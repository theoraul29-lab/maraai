// Tarpit — slow-drip response to confirmed bots/attackers.
// Streams 1 byte every 2–3 s for up to SECURITY_TARPIT_MAX_SECONDS, then 404.
// Self-DoS protection: global concurrency cap (SECURITY_TARPIT_MAX_CONCURRENT).
// Purely defensive: never sends attacker data, never counterattacks.

import type { Request, Response } from 'express';

function getConcurrentCap(): number {
  const v = parseInt(process.env.SECURITY_TARPIT_MAX_CONCURRENT ?? '25', 10);
  return Number.isFinite(v) && v > 0 ? v : 25;
}

function getMaxSeconds(): number {
  const v = parseInt(process.env.SECURITY_TARPIT_MAX_SECONDS ?? '20', 10);
  return Number.isFinite(v) && v > 0 ? v : 20;
}

let activeTarpits = 0;

export function getActiveTarpitCount(): number {
  return activeTarpits;
}

/**
 * Send a tarpit response. Returns a promise that resolves when the connection
 * is closed (either by the client or after max seconds).
 *
 * When the concurrency cap is reached, responds instantly with 404 instead.
 */
export function tarpit(req: Request, res: Response): void {
  const cap = getConcurrentCap();

  if (activeTarpits >= cap) {
    res.status(404).end();
    return;
  }

  activeTarpits++;

  const maxMs = getMaxSeconds() * 1000;
  const intervalMs = 2000 + Math.floor(Math.random() * 1000); // 2–3 s jitter

  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.status(200);

  // Set socket timeout slightly above our max to prevent Railway from killing
  // the connection before we do.
  req.socket?.setTimeout(maxMs + 5000);

  let elapsed = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const cleanup = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    activeTarpits = Math.max(0, activeTarpits - 1);
  };

  res.on('close', cleanup);
  res.on('finish', cleanup);
  res.on('error', cleanup);

  timer = setInterval(() => {
    elapsed += intervalMs;

    try {
      res.write(' ');
    } catch {
      cleanup();
      return;
    }

    if (elapsed >= maxMs) {
      cleanup();
      try {
        res.status(404).end();
      } catch {
        // already closed
      }
    }
  }, intervalMs);
}
