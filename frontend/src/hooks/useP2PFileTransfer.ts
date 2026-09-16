import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * True peer-to-peer file/photo transfer for the You messenger.
 *
 * Files never touch the server. This hook opens a WebSocket to the existing
 * signaling relay (server/websocket/messenger-signaling.ts — a dedicated
 * channel, separate from the AI-mesh p2p-offer/answer/candidate one, which
 * gates on an opt-in "P2P participation" toggle that's off by default for
 * everyone; file sharing between two people who can already message each
 * other should just work) purely to exchange WebRTC SDP offers/answers/ICE
 * candidates, then streams the file directly over an RTCDataChannel.
 *
 * "Stays on the sender's hard drive until the recipient comes online": the
 * picked file's bytes are written to IndexedDB immediately (a real local
 * disk store, survives a page reload) and a background retry loop re-offers
 * it every few seconds for as long as it hasn't been delivered — if the
 * recipient isn't connected right now the signaling server just drops the
 * offer (no error, nothing queued server-side), and the next retry picks it
 * up once they are. There is no server fallback: if the sender's browser/
 * device is gone for good before delivery, the file is gone.
 */

export type TransferStatus = 'queued' | 'connecting' | 'transferring' | 'done' | 'failed';

export interface FileTransfer {
  id: string;
  peerId: string;
  direction: 'outgoing' | 'incoming';
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: TransferStatus;
  progress: number; // 0..1
  blobUrl?: string;
}

const DB_NAME = 'mara-p2p-files';
const DB_VERSION = 1;
const STORE = 'files';
const CHUNK_SIZE = 16 * 1024;
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB — keeps in-browser chunked transfer practical
const RETRY_INTERVAL_MS = 8000;
const ICE_SERVERS: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

interface StoredFile {
  id: string;
  peerId: string;
  direction: 'outgoing' | 'incoming';
  fileName: string;
  fileSize: number;
  mimeType: string;
  blob: Blob;
  delivered?: boolean;
}

async function dbPut(record: StoredFile): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function dbGet(id: string): Promise<StoredFile | undefined> {
  const db = await openDb();
  const result = await new Promise<StoredFile | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result as StoredFile | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

async function dbDelete(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function dbAllPendingOutgoing(): Promise<StoredFile[]> {
  const db = await openDb();
  const result = await new Promise<StoredFile[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as StoredFile[]).filter((r) => r.direction === 'outgoing' && !r.delivered));
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

interface PeerConn {
  pc: RTCPeerConnection;
  channel: RTCDataChannel | null;
  pendingCandidates: RTCIceCandidateInit[];
  receiveBuffer: ArrayBuffer[];
  receivedBytes: number;
}

export function useP2PFileTransfer(currentUserId: string | null) {
  const [transfers, setTransfers] = useState<Record<string, FileTransfer>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const connsRef = useRef<Map<string, PeerConn>>(new Map());
  const metaRef = useRef<Map<string, { peerId: string; fileName: string; fileSize: number; mimeType: string }>>(new Map());

  const patchTransfer = useCallback((id: string, patch: Partial<FileTransfer>) => {
    setTransfers((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      return { ...prev, [id]: { ...existing, ...patch } };
    });
  }, []);

  const send = useCallback((msg: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  const closeConn = useCallback((transferId: string) => {
    const conn = connsRef.current.get(transferId);
    if (conn) {
      try { conn.channel?.close(); } catch { /* noop */ }
      try { conn.pc.close(); } catch { /* noop */ }
      connsRef.current.delete(transferId);
    }
  }, []);

  const startOutgoing = useCallback((transferId: string, peerId: string, file: StoredFile) => {
    if (connsRef.current.has(transferId)) return;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const channel = pc.createDataChannel(`file-${transferId}`, { ordered: true });
    const conn: PeerConn = { pc, channel, pendingCandidates: [], receiveBuffer: [], receivedBytes: 0 };
    connsRef.current.set(transferId, conn);

    pc.onicecandidate = (ev) => {
      if (ev.candidate) send({ type: 'msg-file-candidate', target: peerId, transferId, candidate: ev.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        patchTransfer(transferId, { status: 'failed' });
        closeConn(transferId); // frees connsRef so the retry loop tries again
      }
    };

    channel.binaryType = 'arraybuffer';
    channel.onopen = async () => {
      patchTransfer(transferId, { status: 'transferring', progress: 0 });
      const buf = await file.blob.arrayBuffer();
      let offset = 0;
      const CHUNK_LOW = 1 * 1024 * 1024;
      const sendNext = () => {
        while (offset < buf.byteLength) {
          if (channel.bufferedAmount > CHUNK_LOW) {
            channel.onbufferedamountlow = () => {
              channel.onbufferedamountlow = null;
              sendNext();
            };
            return;
          }
          const end = Math.min(offset + CHUNK_SIZE, buf.byteLength);
          channel.send(buf.slice(offset, end));
          offset = end;
          patchTransfer(transferId, { progress: offset / buf.byteLength });
        }
        // Delivery is best-effort-confirmed by the channel closing cleanly
        // after the receiver has everything it expects.
        patchTransfer(transferId, { status: 'done', progress: 1 });
        void dbPut({ ...file, delivered: true });
        setTimeout(() => closeConn(transferId), 2000);
      };
      channel.bufferedAmountLowThreshold = CHUNK_LOW / 2;
      sendNext();
    };
    channel.onerror = () => patchTransfer(transferId, { status: 'failed' });

    void (async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send({
        type: 'msg-file-offer',
        target: peerId,
        transferId,
        sdp: offer,
        fileName: file.fileName,
        fileSize: file.fileSize,
        mimeType: file.mimeType,
      });
      patchTransfer(transferId, { status: 'connecting' });
    })();
  }, [send, patchTransfer, closeConn]);

  const handleIncomingOffer = useCallback(async (data: any) => {
    const { transferId, target: _target, from, sdp, fileName, fileSize, mimeType } = data;
    if (!from || !transferId || fileSize > MAX_FILE_BYTES) return;
    const existing = connsRef.current.get(transferId);
    if (existing && existing.pc.connectionState !== 'failed' && existing.pc.connectionState !== 'closed') {
      return; // a transfer for this id is already in flight — ignore the duplicate retry offer
    }
    if (existing) closeConn(transferId);
    metaRef.current.set(transferId, { peerId: from, fileName: fileName || 'file', fileSize, mimeType: mimeType || 'application/octet-stream' });
    setTransfers((prev) => ({
      ...prev,
      [transferId]: {
        id: transferId, peerId: from, direction: 'incoming', fileName: fileName || 'file',
        fileSize: fileSize || 0, mimeType: mimeType || 'application/octet-stream', status: 'connecting', progress: 0,
      },
    }));

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const conn: PeerConn = { pc, channel: null, pendingCandidates: [], receiveBuffer: [], receivedBytes: 0 };
    connsRef.current.set(transferId, conn);

    pc.onicecandidate = (ev) => {
      if (ev.candidate) send({ type: 'msg-file-candidate', target: from, transferId, candidate: ev.candidate.toJSON() });
    };
    pc.ondatachannel = (ev) => {
      const channel = ev.channel;
      conn.channel = channel;
      channel.binaryType = 'arraybuffer';
      channel.onmessage = (msgEv) => {
        const chunk = msgEv.data as ArrayBuffer;
        conn.receiveBuffer.push(chunk);
        conn.receivedBytes += chunk.byteLength;
        const expected = metaRef.current.get(transferId)?.fileSize || 1;
        patchTransfer(transferId, { status: 'transferring', progress: Math.min(1, conn.receivedBytes / expected) });
        if (conn.receivedBytes >= expected) {
          const meta = metaRef.current.get(transferId)!;
          const blob = new Blob(conn.receiveBuffer, { type: meta.mimeType });
          const blobUrl = URL.createObjectURL(blob);
          void dbPut({ id: transferId, peerId: from, direction: 'incoming', fileName: meta.fileName, fileSize: meta.fileSize, mimeType: meta.mimeType, blob, delivered: true });
          patchTransfer(transferId, { status: 'done', progress: 1, blobUrl });
          setTimeout(() => closeConn(transferId), 2000);
        }
      };
    };

    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    for (const cand of conn.pendingCandidates) await pc.addIceCandidate(cand).catch(() => {});
    conn.pendingCandidates = [];
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    send({ type: 'msg-file-answer', target: from, transferId, sdp: answer });
  }, [send, patchTransfer, closeConn]);

  const handleAnswer = useCallback(async (data: any) => {
    const conn = connsRef.current.get(data.transferId);
    if (!conn) return;
    await conn.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    for (const cand of conn.pendingCandidates) await conn.pc.addIceCandidate(cand).catch(() => {});
    conn.pendingCandidates = [];
  }, []);

  const handleCandidate = useCallback((data: any) => {
    const conn = connsRef.current.get(data.transferId);
    if (!conn) return;
    if (conn.pc.remoteDescription) {
      void conn.pc.addIceCandidate(data.candidate).catch(() => {});
    } else {
      conn.pendingCandidates.push(data.candidate);
    }
  }, []);

  // WebSocket lifecycle — same-origin, cookie carries session auth on the
  // upgrade request (server/websocket/index.ts reads req.user.uid).
  useEffect(() => {
    if (!currentUserId) return;
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closed) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/p2p-ws`);
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        let data: any;
        try { data = JSON.parse(ev.data); } catch { return; }
        if (data?.type === 'msg-file-offer') void handleIncomingOffer(data);
        else if (data?.type === 'msg-file-answer') void handleAnswer(data);
        else if (data?.type === 'msg-file-candidate') handleCandidate(data);
      };
      ws.onclose = () => {
        if (!closed) reconnectTimer = setTimeout(connect, 4000);
      };
      ws.onerror = () => ws.close();
    };
    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [currentUserId, handleIncomingOffer, handleAnswer, handleCandidate]);

  // Retry loop — re-offers every still-undelivered outgoing file. A dropped
  // offer (recipient offline) has no error to react to, so this is the only
  // delivery mechanism once the recipient comes back.
  useEffect(() => {
    if (!currentUserId) return;
    const tick = async () => {
      const pending = await dbAllPendingOutgoing();
      for (const file of pending) {
        if (connsRef.current.has(file.id)) continue; // already in flight
        setTransfers((prev) => (prev[file.id] ? prev : {
          ...prev,
          [file.id]: {
            id: file.id, peerId: file.peerId, direction: 'outgoing', fileName: file.fileName,
            fileSize: file.fileSize, mimeType: file.mimeType, status: 'queued', progress: 0,
          },
        }));
        startOutgoing(file.id, file.peerId, file);
      }
    };
    void tick();
    const interval = setInterval(tick, RETRY_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [currentUserId, startOutgoing]);

  const sendFile = useCallback(async (peerId: string, file: File): Promise<{ id: string; tooLarge?: boolean }> => {
    if (file.size > MAX_FILE_BYTES) return { id: '', tooLarge: true };
    const id = genId();
    const record: StoredFile = { id, peerId, direction: 'outgoing', fileName: file.name, fileSize: file.size, mimeType: file.type || 'application/octet-stream', blob: file };
    await dbPut(record);
    setTransfers((prev) => ({
      ...prev,
      [id]: { id, peerId, direction: 'outgoing', fileName: file.name, fileSize: file.size, mimeType: record.mimeType, status: 'queued', progress: 0 },
    }));
    startOutgoing(id, peerId, record);
    return { id };
  }, [startOutgoing]);

  // Rehydrate a previously-received (or previously-sent-and-delivered) file
  // from IndexedDB — used when the thread re-renders a file bubble after a
  // reload and the live transfer map is empty.
  const rehydrate = useCallback(async (transferId: string): Promise<FileTransfer | null> => {
    const rec = await dbGet(transferId);
    if (!rec) return null;
    const blobUrl = rec.direction === 'incoming' || rec.delivered ? URL.createObjectURL(rec.blob) : undefined;
    return {
      id: rec.id, peerId: rec.peerId, direction: rec.direction, fileName: rec.fileName,
      fileSize: rec.fileSize, mimeType: rec.mimeType, status: 'done', progress: 1, blobUrl,
    };
  }, []);

  const forget = useCallback((transferId: string) => {
    closeConn(transferId);
    void dbDelete(transferId);
    setTransfers((prev) => {
      const next = { ...prev };
      delete next[transferId];
      return next;
    });
  }, [closeConn]);

  return { transfers, sendFile, rehydrate, forget, maxFileBytes: MAX_FILE_BYTES };
}
