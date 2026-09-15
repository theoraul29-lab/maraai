import type { Server } from 'http';
import { WebSocketServer } from 'ws';
import { checkWebSocketRateLimit } from '../rate-limit.js';
import { unregisterComputePeer } from '../maraai/p2p-compute.js';
import { handleChatMessage } from './chat-handler.js';
import { handleComputeGone, handleComputeReady } from './compute-handler.js';
import { relayP2PSignalingMessage } from './p2p-signaling.js';
import type { UserSocket } from './types.js';

const MAX_MESSAGE_BYTES = 1_000_000;
const MAX_SEEDS_PER_USER = Number.parseInt(
  process.env.P2P_MAX_SEEDS_PER_USER ?? '',
  10,
) || 500;

export function attachWebSocketServer(input: {
  httpServer: Server;
  allowedOrigins: string[];
  log: (message: string, source?: string) => void;
}): WebSocketServer {
  const { httpServer, allowedOrigins, log } = input;
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/p2p-ws',
    maxPayload: MAX_MESSAGE_BYTES,
    verifyClient: (info, done) => {
      const origin = info.origin || info.req.headers.origin;
      if (process.env.NODE_ENV !== 'production' && allowedOrigins.length === 0) {
        return done(true);
      }
      if (origin && allowedOrigins.includes(origin)) {
        return done(true);
      }
      log(`WebSocket connection rejected from origin: ${origin}`, 'p2p-ws');
      return done(false, 403, 'Origin not allowed');
    },
  });

  const userConnections = new Map<string, UserSocket>();
  const videoSeeders = new Map<number, Set<string>>();
  const peerSeeds = new Map<string, Set<number>>();

  const addSeed = (userId: string, videoId: number) => {
    let owned = peerSeeds.get(userId);
    if (owned && owned.size >= MAX_SEEDS_PER_USER && !owned.has(videoId)) return;

    let seeders = videoSeeders.get(videoId);
    if (!seeders) {
      seeders = new Set<string>();
      videoSeeders.set(videoId, seeders);
    }
    seeders.add(userId);

    if (!owned) {
      owned = new Set<number>();
      peerSeeds.set(userId, owned);
    }
    owned.add(videoId);
  };

  const removeSeed = (userId: string, videoId: number) => {
    const seeders = videoSeeders.get(videoId);
    if (seeders) {
      seeders.delete(userId);
      if (seeders.size === 0) videoSeeders.delete(videoId);
    }
    const owned = peerSeeds.get(userId);
    if (owned) {
      owned.delete(videoId);
      if (owned.size === 0) peerSeeds.delete(userId);
    }
  };

  const clearSeedsForUser = (userId: string) => {
    const owned = peerSeeds.get(userId);
    if (!owned) return;
    for (const videoId of owned) {
      const seeders = videoSeeders.get(videoId);
      if (seeders) {
        seeders.delete(userId);
        if (seeders.size === 0) videoSeeders.delete(videoId);
      }
    }
    peerSeeds.delete(userId);
  };

  wss.on('connection', (ws: UserSocket, req: any) => {
    const finalUserId = req.user?.uid;
    if (!finalUserId) {
      log('Anonymous P2P connection rejected — auth required.', 'p2p-ws');
      ws.close(1008, 'Authentication required');
      return;
    }

    log(`P2P user connected: ${finalUserId}`, 'p2p-ws');
    userConnections.set(finalUserId, ws);
    ws.userId = finalUserId;

    ws.on('message', (message: Buffer) => {
      void (async () => {
        if (!ws.userId) {
          ws.close(1008, 'Authentication required');
          return;
        }

        const rateLimitCheck = await checkWebSocketRateLimit(ws.userId);
        if (!rateLimitCheck.allowed) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Too many WebSocket messages. Please try again shortly.',
            retryAfterMs: rateLimitCheck.retryAfterMs,
          }));
          return;
        }

        let data: any;
        try {
          data = JSON.parse(message.toString());
        } catch (err) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON message.' }));
          return;
        }

        switch (data?.type) {
          case 'p2p-offer':
          case 'p2p-answer':
          case 'p2p-candidate':
            await relayP2PSignalingMessage({
              data,
              senderSocket: ws,
              userConnections,
              log,
            });
            break;

          case 'p2p-have-video': {
            const videoId = Number(data?.videoId);
            if (Number.isFinite(videoId)) addSeed(ws.userId, videoId);
            break;
          }

          case 'p2p-drop-video': {
            const videoId = Number(data?.videoId);
            if (Number.isFinite(videoId)) removeSeed(ws.userId, videoId);
            break;
          }

          case 'p2p-want-video': {
            const videoId = Number(data?.videoId);
            if (!Number.isFinite(videoId)) break;
            const seeders = videoSeeders.get(videoId);
            const peers = seeders
              ? Array.from(seeders).filter((uid) => uid !== ws.userId).slice(0, 8)
              : [];
            ws.send(JSON.stringify({ type: 'p2p-peer-list', videoId, peers }));
            break;
          }

          case 'p2p-browser-ready':
            handleComputeReady(ws, data, log);
            break;

          case 'p2p-browser-gone':
            handleComputeGone(ws, log);
            break;

          case 'chat':
            await handleChatMessage(ws, data);
            break;

          default:
            log(`Received unknown P2P message type: ${data?.type}`, 'p2p-ws');
        }
      })();
    });

    ws.on('close', () => {
      if (!ws.userId) {
        log('Anonymous P2P user disconnected.', 'p2p-ws');
        return;
      }
      log(`P2P user disconnected: ${ws.userId}`, 'p2p-ws');
      userConnections.delete(ws.userId);
      clearSeedsForUser(ws.userId);
      unregisterComputePeer(ws.userId);
    });
  });

  log('P2P Signaling Server is attached to the main HTTP server.', 'p2p-ws');
  return wss;
}
