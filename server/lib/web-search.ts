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

// DuckDuckGo's "Instant Answer" JSON API — despite the generic name, this
// only returns a result for topics that have a Wikipedia-style abstract/
// disambiguation entry (e.g. "Python (programming language)"). It does NOT
// do general web search, so for the kind of research query the brain
// actually issues ("Stoicism — practică zilnică modernă", "Deep Work —
// focus și productivitate") it returns nothing essentially every time —
// confirmed live: every single autonomous-learning web search this
// produced empty results, silently stalling all external knowledge
// acquisition once the pre-loaded library was exhausted. Kept as the
// last-resort tier below (it's free, no key, and occasionally does hit for
// a well-known named topic) but no longer relied on as the only fallback.
async function searchDuckDuckGoInstantAnswer(query: string, limit: number): Promise<SearchResult[]> {
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

// Real organic web search, no API key required — DuckDuckGo's plain-HTML
// results page (the same one served to browsers with JS disabled), meant
// for exactly this kind of use when there's no search API key configured.
// A lightweight regex scrape rather than a full HTML parser dependency:
// best-effort by design, matching this module's existing "never throws"
// contract — if DuckDuckGo changes their markup this just returns [] and
// the caller falls through to the next tier, same as any other failure.
async function searchDuckDuckGoHtml(query: string, limit: number): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: {
      // A browser-like UA avoids DuckDuckGo's bot-blocking on the plain
      // default fetch() UA string (confirmed live: default UA got 0 results).
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) throw new Error(`DuckDuckGo HTML ${res.status}`);
  const html = await res.text();

  const results: SearchResult[] = [];
  const linkRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRe = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  const stripTags = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const decodeEntities = (s: string) =>
    s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'");

  const snippets: string[] = [];
  let snippetMatch: RegExpExecArray | null;
  while ((snippetMatch = snippetRe.exec(html)) !== null) {
    snippets.push(decodeEntities(stripTags(snippetMatch[1])));
  }

  let linkMatch: RegExpExecArray | null;
  let i = 0;
  while ((linkMatch = linkRe.exec(html)) !== null && results.length < limit) {
    // DuckDuckGo's HTML results wrap the real destination in a redirect
    // link (/l/?uddg=<encoded-url>&...) rather than linking to it directly.
    let href = decodeEntities(linkMatch[1]);
    const uddgMatch = href.match(/[?&]uddg=([^&]+)/);
    if (uddgMatch) {
      try { href = decodeURIComponent(uddgMatch[1]); } catch { /* keep raw */ }
    }
    results.push({
      title: decodeEntities(stripTags(linkMatch[2])),
      url: href,
      snippet: snippets[i] ?? '',
    });
    i++;
  }
  return results;
}

export async function webSearch(query: string, limit = 5): Promise<SearchResult[]> {
  if (process.env.SERPER_API_KEY) {
    try {
      return await searchSerper(query, limit);
    } catch (err) {
      console.warn('[WebSearch] Serper failed, trying DuckDuckGo HTML:', err instanceof Error ? err.message : err);
    }
  }
  try {
    const htmlResults = await searchDuckDuckGoHtml(query, limit);
    if (htmlResults.length > 0) return htmlResults;
  } catch (err) {
    console.warn('[WebSearch] DuckDuckGo HTML failed, trying instant-answer:', err instanceof Error ? err.message : err);
  }
  try {
    return await searchDuckDuckGoInstantAnswer(query, limit);
  } catch (err) {
    console.warn('[WebSearch] DuckDuckGo instant-answer also failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

export function formatSearchResultsForPrompt(results: SearchResult[]): string {
  if (results.length === 0) return '';
  return results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`)
    .join('\n\n');
}
