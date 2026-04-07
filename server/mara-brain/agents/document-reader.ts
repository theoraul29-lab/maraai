// Mara Document Reader Agent
// Reads books/documents in chunks, extracts structured ideas via learnFromText

import { learnFromText, type ExtractedIdea, storeKnowledge } from '../knowledge-base.js';
import { storage } from '../../storage.js';

const CHUNK_SIZE = 2000; // characters per chunk (balanced for Gemini context)
const DELAY_BETWEEN_CHUNKS_MS = 3000; // rate limit

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
