import type { Request, Response } from 'express';

export async function fetchWithPython(req: Request, res: Response) {
  try {
    const { url, method, headers, body } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ message: 'URL is required' });
    }

    // Validate URL to prevent SSRF
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return res.status(400).json({ message: 'Invalid URL' });
    }

    // Only allow http and https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return res.status(400).json({ message: 'Only http and https protocols are allowed' });
    }

    // Block internal/private network requests
    const hostname = parsed.hostname.toLowerCase();
    if (isInternalHost(hostname)) {
      return res.status(403).json({ message: 'Access to internal networks is not allowed' });
    }

    const response = await fetch(url, {
      method: method || 'GET',
      headers: headers || {},
      body: body ? JSON.stringify(body) : undefined,
    });

    const contentType = response.headers.get('content-type') || '';
    let data: any;

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    res.json({
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      data,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Python bridge request failed' });
  }
}

/**
 * Returns true if the hostname refers to a private/internal/loopback address.
 * NOTE: This check is based on the hostname string only. DNS rebinding attacks
 * (a public domain that resolves to 127.0.0.1) are not blocked here. For
 * higher-security deployments, resolve the hostname to an IP before checking.
 */
function isInternalHost(hostname: string): boolean {
  // IPv4 loopback and unspecified
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
    return true;
  }

  // IPv6 loopback and unspecified
  if (hostname === '::1' || hostname === '::' || hostname === '[::1]' || hostname === '[::]') {
    return true;
  }

  // IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1)
  if (hostname.startsWith('::ffff:')) {
    const ipv4Part = hostname.slice(7);
    return isInternalHost(ipv4Part);
  }

  // IPv4 private ranges
  if (
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    hostname === '169.254.169.254' || // AWS metadata endpoint
    hostname.startsWith('169.254.')   // Link-local range
  ) {
    return true;
  }

  // RFC1918 172.16.0.0/12 — 172.16.x.x through 172.31.x.x
  const match172 = hostname.match(/^172\.(\d{1,3})\./);
  if (match172) {
    const second = parseInt(match172[1], 10);
    if (second >= 16 && second <= 31) return true;
  }

  // IPv6 private ranges (fc00::/7 covers fc00:: and fd00::)
  if (hostname.startsWith('fc') || hostname.startsWith('fd') ||
      hostname.startsWith('[fc') || hostname.startsWith('[fd')) {
    return true;
  }

  // Link-local IPv6
  if (hostname.startsWith('fe80') || hostname.startsWith('[fe80')) {
    return true;
  }

  // Cloud metadata endpoints
  if (
    hostname === 'metadata.google.internal' ||
    hostname === 'metadata.goog' ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.local')
  ) {
    return true;
  }

  return false;
}
