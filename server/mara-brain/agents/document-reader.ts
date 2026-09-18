// Mara Document Reader Agent
// Reads books/documents in chunks, extracts structured ideas via learnFromText

import { learnFromText, type ExtractedIdea, storeKnowledge } from '../knowledge-base.js';
import { storage } from '../../storage.js';
import { tryP2PTask } from '../../lib/provider-router.js';

const CHUNK_SIZE = 4000; // characters per chunk — larger = fewer chunks = faster book processing
const DELAY_BETWEEN_CHUNKS_MS = 1000; // 1s between chunks (was 3s — safe for Anthropic rate limits)
// Short on purpose: this is a supplementary enrichment, not on the critical
// path — a slow/offline P2P network should never meaningfully delay book
// processing, so a miss just falls through with zero effect below.
const P2P_TERM_EXTRACTION_TIMEOUT_MS = 6000;

/**
 * A browser P2P node's `knowledgeBase` task result is untrusted input — it
 * could come from a buggy or actively malicious node. Rather than trust it
 * outright (the generic submitTaskResult() check is just "non-empty"), this
 * does a cheap, real correctness check before any of it is used: the
 * reported char count must roughly match what we actually sent, and every
 * claimed top term must really appear in the source text. A node that
 * fabricates unrelated terms fails this and its result is simply discarded
 * — same as a timeout, no special-casing needed downstream.
 */
function validateP2PTermExtraction(
  chunkText: string,
  result: Record<string, unknown>,
): string[] | null {
  const terms = result.terms;
  const charCount = result.charCount;
  if (!Array.isArray(terms) || terms.length === 0) return null;
  if (typeof charCount !== 'number' || Math.abs(charCount - chunkText.length) > chunkText.length * 0.1) return null;
  const lowerChunk = chunkText.toLowerCase();
  const verified = terms.filter((t): t is string => typeof t === 'string' && lowerChunk.includes(t.toLowerCase()));
  // Require most claimed terms to actually verify, not literally all — a
  // legitimate node can differ slightly on tokenization edge cases; a node
  // returning mostly-fabricated terms still gets rejected.
  if (verified.length < terms.length * 0.8) return null;
  return verified.slice(0, 15);
}

export interface DocumentReadResult {
  title: string;
  totalChunks: number;
  processedChunks: number;
  totalIdeas: number;
  ideas: ExtractedIdea[];
  savedKnowledgeIds: number[];
}

/**
 * Process a full document/book — splits into chunks, extracts ideas from each
 */
export async function processDocument(
  content: string,
  title: string,
  source: string = 'library',
): Promise<DocumentReadResult> {
  console.log(`[DocumentReader] 📖 Starting to read: "${title}" (${content.length} chars)`);

  const chunks = splitIntoChunks(content, CHUNK_SIZE);
  const allIdeas: ExtractedIdea[] = [];
  const allSavedIds: number[] = [];
  let processedChunks = 0;
  // Real work offloaded to P2P browser nodes (see tryP2PTask below) — top
  // terms across every chunk a node actually computed and that passed
  // validation, surfaced on the document's own knowledge entry so this is
  // inspectable, not just a fire-and-forget side effect.
  const p2pTermsByChunk: string[][] = [];

  // Store a top-level knowledge entry for the document itself
  await storeKnowledge(
    'book_knowledge',
    `Document: ${title}`,
    `Mara a citit documentul "${title}" cu ${chunks.length} secțiuni. Sursa: ${source}`,
    'document',
    60,
    { documentTitle: title, totalChunks: chunks.length, source },
  );

  for (let i = 0; i < chunks.length; i++) {
    try {
      console.log(`[DocumentReader] 📖 Chunk ${i + 1}/${chunks.length} of "${title}"`);

      // Offer this chunk's term-frequency analysis to a P2P browser node
      // first — matches the knowledgeBase task type's real, already-shipped
      // browser computation (frontend/src/pwa/p2pComputeWorker.ts). Purely
      // additive: on timeout, failure, or a result that fails validation,
      // this is silently null and reading proceeds exactly as it always did.
      const p2pResult = await tryP2PTask(
        { type: 'knowledgeBase', payload: { text: chunks[i], category: source } },
        P2P_TERM_EXTRACTION_TIMEOUT_MS,
      );
      const verifiedTerms = p2pResult ? validateP2PTermExtraction(chunks[i], p2pResult) : null;
      if (verifiedTerms) p2pTermsByChunk.push(verifiedTerms);

      const result = await learnFromText(
        chunks[i],
        'document',
        `${title} — chunk ${i + 1}/${chunks.length}`,
      );

      allIdeas.push(...result.ideas);
      allSavedIds.push(...result.savedIds);
      processedChunks++;

      // Rate limit between chunks
      if (i < chunks.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_CHUNKS_MS));
      }
    } catch (error) {
      console.error(`[DocumentReader] Failed on chunk ${i + 1} of "${title}":`, error);
    }
  }

  if (p2pTermsByChunk.length > 0) {
    const termCounts = new Map<string, number>();
    for (const terms of p2pTermsByChunk) {
      for (const term of terms) termCounts.set(term, (termCounts.get(term) ?? 0) + 1);
    }
    const topTerms = [...termCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([t]) => t);
    console.log(`[DocumentReader] 🌐 P2P nodes computed verified term-frequency for ${p2pTermsByChunk.length}/${chunks.length} chunks of "${title}"`);
    await storeKnowledge(
      'book_knowledge',
      `P2P term analysis: ${title}`,
      `Noduri P2P au calculat frecvența termenilor pentru ${p2pTermsByChunk.length} din ${chunks.length} secțiuni ale documentului "${title}" (rezultate verificate server-side înainte de utilizare).`,
      'document',
      55,
      { documentTitle: title, chunksAnalyzedByP2P: p2pTermsByChunk.length, totalChunks: chunks.length, topTerms },
    );
  }

  // Log the reading activity
  await storage.createSearchHistory({
    query: `Citit document: ${title}`,
    source: 'document',
    resultSummary: `Extras ${allIdeas.length} idei din ${processedChunks}/${chunks.length} secțiuni`,
    knowledgeExtracted: JSON.stringify(allSavedIds),
    triggeredBy: 'library_reader',
  });

  console.log(`[DocumentReader] ✅ Finished "${title}": ${allIdeas.length} ideas from ${processedChunks} chunks`);

  return {
    title,
    totalChunks: chunks.length,
    processedChunks,
    totalIdeas: allIdeas.length,
    ideas: allIdeas,
    savedKnowledgeIds: allSavedIds,
  };
}

/**
 * Process multiple documents in sequence with rate limiting
 */
export async function processDocumentBatch(
  documents: { title: string; content: string; source?: string }[],
): Promise<DocumentReadResult[]> {
  const results: DocumentReadResult[] = [];

  for (const doc of documents) {
    const result = await processDocument(doc.content, doc.title, doc.source);
    results.push(result);
    // Extra delay between documents
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  return results;
}

// Split text into chunks at natural boundaries (paragraph/sentence breaks)
function splitIntoChunks(text: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= chunkSize) {
      chunks.push(remaining.trim());
      break;
    }

    // Try to split at paragraph boundary
    let splitAt = remaining.lastIndexOf('\n\n', chunkSize);
    if (splitAt < chunkSize * 0.5) {
      // Try sentence boundary
      splitAt = remaining.lastIndexOf('. ', chunkSize);
    }
    if (splitAt < chunkSize * 0.3) {
      // Fall back to hard split
      splitAt = chunkSize;
    }

    chunks.push(remaining.substring(0, splitAt + 1).trim());
    remaining = remaining.substring(splitAt + 1);
  }

  return chunks.filter((c) => c.length > 50); // Skip tiny fragments
}
