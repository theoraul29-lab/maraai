/**
 * Local embeddings for semantic knowledge search.
 *
 * Uses bge-m3 (already pulled on the laptop's Ollama, multilingual —
 * RO/EN/DE all embed well) via the SAME Ollama endpoint already used for
 * chat (OLLAMA_BASE_URL, tunneled from Railway to the laptop). No new
 * infrastructure, no new provider, no per-call cost.
 *
 * Every function here degrades to `null`/a no-op on failure (Ollama down,
 * model not pulled, network hiccup) rather than throwing — callers must
 * treat embeddings as an optional enhancement and fall back to keyword
 * search, never hard-fail a knowledge read/write because embeddings are
 * temporarily unavailable.
 */
const DEFAULT_BASE_URL = 'http://localhost:11434';
const EMBED_TIMEOUT_MS = 15_000;

// bge-m3's native output size. If OLLAMA_EMBED_MODEL is ever pointed at a
// different model with a different dimension, vec0's fixed-width column
// would silently reject or corrupt inserts — searchByEmbedding/upsert guard
// against that mismatch explicitly (see storeEmbedding below).
export const EMBEDDING_DIM = 1024;

function getBaseUrl(): string {
  return (process.env.OLLAMA_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function getModel(): string {
  return process.env.OLLAMA_EMBED_MODEL || 'bge-m3';
}

interface OllamaEmbedResponse {
  embeddings?: number[][];
}

/** Returns null on any failure — Ollama down, model missing, bad response shape. */
export async function getEmbedding(text: string): Promise<Float32Array | null> {
  const trimmed = text?.trim();
  if (!trimmed) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);
  try {
    const res = await fetch(`${getBaseUrl()}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // bge-m3's practical context is generous, but knowledge-base rows are
      // short (topic + a few sentences) — 8000 chars is a generous cap that
      // just guards against an accidental oversized call, not a real limit.
      body: JSON.stringify({ model: getModel(), input: trimmed.slice(0, 8000) }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as OllamaEmbedResponse;
    const vec = data.embeddings?.[0];
    if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIM) return null;
    return new Float32Array(vec);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** sqlite-vec (and better-sqlite3 param binding) need a real Buffer, not a bare ArrayBuffer/Float32Array. */
export function vecToBuffer(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}
