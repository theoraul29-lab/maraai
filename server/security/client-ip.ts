// IP resolution for hellomara.net
// Priority: CF-Connecting-IP (Cloudflare, most reliable) → req.ip (trust-proxy=1) → null
// GDPR basis: Art. 6(1)(f) — legitimate interest, network security (Recital 49)

import net from 'net';
import type { Request } from 'express';

/**
 * Normalize an IP string:
 * - IPv4: returned as-is
 * - IPv6: lowercased, zone ID stripped
 * - Invalid: returns null
 */
function normalizeIp(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Strip IPv6 zone ID (e.g. "fe80::1%eth0" → "fe80::1")
  const withoutZone = trimmed.replace(/%[^%]*$/, '');

  // Unwrap IPv4-mapped IPv6 (::ffff:1.2.3.4 → 1.2.3.4)
  const ipv4mapped = withoutZone.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (ipv4mapped) return ipv4mapped[1];

  if (net.isIP(withoutZone) === 0) return null;
  return withoutZone.toLowerCase();
}

/**
 * For IPv6 addresses, return the /64 prefix as the blacklist key to prevent
 * trivial rotation within the same allocation block.
 * For IPv4, return the address unchanged.
 */
export function toBlacklistKey(ip: string): string {
  if (net.isIPv6(ip)) {
    // Split into 8 groups of 16-bit hex. Expand "::" first.
    const expanded = expandIPv6(ip);
    if (expanded) {
      const groups = expanded.split(':');
      // /64 = first 4 groups
      return groups.slice(0, 4).join(':') + '::/64';
    }
  }
  return ip;
}

function expandIPv6(ip: string): string | null {
  try {
    // Node's net module doesn't expand, so do it manually
    const parts = ip.split('::');
    if (parts.length > 2) return null;
    const left = parts[0] ? parts[0].split(':') : [];
    const right = parts[1] ? parts[1].split(':') : [];
    const missing = 8 - left.length - right.length;
    const middle = Array(missing).fill('0000');
    const all = [...left, ...middle, ...right].map((g) => g.padStart(4, '0'));
    if (all.length !== 8) return null;
    return all.join(':');
  } catch {
    return null;
  }
}

export interface ClientIpResult {
  ip: string | null;
  reliable: boolean;
}

/**
 * Resolve the real client IP for a request.
 *
 * - `reliable: true`  → IP came from CF-Connecting-IP (set by Cloudflare edge,
 *   cannot be spoofed by the client) or from Express req.ip behind trust-proxy=1.
 * - `reliable: false` → No trustworthy header found; do NOT ban on this IP.
 */
export function getClientIp(req: Request): ClientIpResult {
  // 1. CF-Connecting-IP — set by Cloudflare, single value, not spoofable
  const cfHeader = req.headers['cf-connecting-ip'];
  if (cfHeader && typeof cfHeader === 'string') {
    const ip = normalizeIp(cfHeader);
    if (ip) return { ip, reliable: true };
  }

  // 2. Express req.ip — resolved via trust proxy=1 (set in server/auth.ts for production)
  if (req.ip) {
    const ip = normalizeIp(req.ip);
    if (ip) return { ip, reliable: true };
  }

  return { ip: null, reliable: false };
}
