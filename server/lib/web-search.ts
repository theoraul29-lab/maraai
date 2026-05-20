/**
 * Real web search — Serper API first (requires SERPER_API_KEY), DuckDuckGo
 * instant-answer fallback (no key needed). Never throws — returns [] on
 * total failure so the brain agent can always fall back to LLM-only mode.
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface SerperResponse {
  organic?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
  }>;
}

async function searchSerper(query: string, limit: number): Promise<SearchResult[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) throw new Error('SERPER_API_KEY not configured');

  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
    body: JSON.stringify({ q: query, num: limit }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`Serper API ${res.status}`);
  const data = (await res.json()) as SerperResponse;
  return (data.organic ?? []).slice(0, limit).map((r) => ({
    title: r.title ?? '',
    url: r.link ?? '',
    snippet: r.snippet ?? '',
  }));
}

async function searchDuckDuckGo(query: string, limit: number): Promise<SearchResult[]> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`DuckDuckGo API ${res.status}`);

  const data = (await res.json()) as {
    AbstractText?: string;
    AbstractURL?: string;
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
  };

  const results: SearchResult[] = [];
  if (data.AbstractText && data.AbstractURL) {
    results.push({ title: query, url: data.AbstractURL, snippet: data.AbstractText });
  }
  for (const topic of data.RelatedTopics ?? []) {
    if (results.length >= limit) break;
    if (topic.Text && topic.FirstURL) {
      results.push({
        title: topic.Text.substring(0, 80),
        url: topic.FirstURL,
        snippet: topic.Text,
      });
    }
  }
  return results.slice(0, limit);
}

export async function webSearch(query: string, limit = 5): Promise<SearchResult[]> {
  if (process.env.SERPER_API_KEY) {
    try {
      return await searchSerper(query, limit);
    } catch (err) {
      console.warn('[WebSearch] Serper failed, trying DuckDuckGo:', err instanceof Error ? err.message : err);
    }
  }
  try {
    return await searchDuckDuckGo(query, limit);
  } catch (err) {
    console.warn('[WebSearch] DuckDuckGo also failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

export function formatSearchResultsForPrompt(results: SearchResult[]): string {
  if (results.length === 0) return '';
  return results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`)
    .join('\n\n');
}
