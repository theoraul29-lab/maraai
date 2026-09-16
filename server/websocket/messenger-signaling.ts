import { z } from 'zod';
import { storage } from '../storage.js';
import type { UserConnectionMap, UserSocket } from './types.js';

/**
 * WebRTC signaling for peer-to-peer file/photo transfer inside the You
 * messenger (server/modules/messenger.ts). Deliberately separate from
 * p2p-signaling.ts's p2p-offer/answer/candidate channel: that one gates on
 * the `p2pEnabled` consent flag, which is opt-in and off by default for
 * everyone — it exists for the distributed AI-compute mesh, not for "let
 * two friends send each other a photo". Gating file-sharing behind that
 * toggle would make it invisible to virtually every user. This channel
 * instead gates on the same trust boundary the messenger API itself already
 * uses: two users may exchange files iff they aren't blocked (server/modules/
 * messenger.ts's sendMessage/getOrCreateConv enforce the identical check).
 *
 * File bytes never touch this server — this module only relays SDP offers/
 * answers/ICE candidates between two already-connected sockets so the
 * browsers can open a direct RTCDataChannel. If the recipient isn't
 * connected right now, the offer is silently dropped (matching
 * p2p-signaling.ts's behavior); the sender is expected to retry while the
 * file is queued locally (see frontend/src/hooks/useP2PFileTransfer.ts).
 */

const signalSchema = z
  .object({
    type: z.enum(['msg-file-offer', 'msg-file-answer', 'msg-file-candidate']),
    target: z.string().min(1).max(128),
    transferId: z.string().min(1).max(128),
    from: z.string().optional(),
    userId: z.string().optional(),
    sdp: z.unknown().optional(),
    candidate: z.unknown().optional(),
    fileName: z.string().max(255).optional(),
    fileSize: z.number().optional(),
    mimeType: z.string().max(120).optional(),
  })
  .passthrough();

function sendSecurityError(ws: UserSocket, message: string): void {
  ws.send(JSON.stringify({ type: 'error', message }));
}

export async function relayMessengerSignal(input: {
  data: unknown;
  senderSocket: UserSocket;
  userConnections: UserConnectionMap;
  log: (message: string, source?: string) => void;
}): Promise<void> {
  const parsed = signalSchema.safeParse(input.data);
  if (!parsed.success) {
    sendSecurityError(input.senderSocket, 'Invalid file-transfer signaling payload.');
    return;
  }

  const senderUserId = input.senderSocket.userId;
  if (!senderUserId) {
    sendSecurityError(input.senderSocket, 'Authentication required.');
    return;
  }
  // Same anti-spoofing check as p2p-signaling.ts: a socket may only ever
  // claim to be speaking as the user it authenticated as.
  if (
    (parsed.data.from && parsed.data.from !== senderUserId) ||
    (parsed.data.userId && parsed.data.userId !== senderUserId)
  ) {
    input.log(`Rejected messenger P2P spoofing attempt from ${senderUserId}`, 'msg-p2p-ws');
    input.senderSocket.close(1008, 'Identity mismatch');
    return;
  }
  if (parsed.data.target === senderUserId) {
    sendSecurityError(input.senderSocket, 'Self-signaling is not allowed.');
    return;
  }

  const targetSocket = input.userConnections.get(parsed.data.target);
  if (!targetSocket) {
    // No error sent back — the sender's client keeps the transfer queued
    // locally and retries later, exactly like an offline text message
    // waiting for the recipient to come back online.
    input.log(`Messenger P2P target not connected: ${parsed.data.target}`, 'msg-p2p-ws');
    return;
  }

  if (await storage.isBlocked(senderUserId, parsed.data.target)) {
    sendSecurityError(input.senderSocket, 'File transfer is not allowed between these users.');
    return;
  }

  input.log(
    `Relaying messenger P2P ${parsed.data.type} (transfer ${parsed.data.transferId}) from ${senderUserId} to ${parsed.data.target}`,
    'msg-p2p-ws',
  );
  targetSocket.send(
    JSON.stringify({
      ...parsed.data,
      from: senderUserId,
      userId: senderUserId,
    }),
  );
}
