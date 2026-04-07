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

    // Block internal/private network requests
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.') ||
      hostname === '169.254.169.254' ||
      hostname.endsWith('.internal')
    ) {
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
