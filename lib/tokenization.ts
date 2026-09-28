import { DocumentChunk } from '@/types/rag';

/**
 * High-fidelity token estimator based on GPT/Gemini BPE subword patterns.
 * Approximately 1 token ≈ 4 characters or 0.75 words in English.
 */
export function estimateTokenCount(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  // Count words and punctuation clusters
  const words = text.trim().split(/\s+/).length;
  const chars = text.length;
  // Blend heuristic: words * 1.33 + penalty for complex symbols
  const estimate = Math.ceil(Math.max(words * 1.3, chars / 3.8));
  return estimate;
}

export interface ChunkingOptions {
  maxTokensPerChunk?: number; // default: 350 (~1400 chars)
  overlapTokens?: number;     // default: 50 (~200 chars)
}

export interface ParsedPageData {
  pageNumber: number;
  lines: string[];
}

/**
 * Splits extracted page lines into semantic chunks with line-level references.
 */
export function chunkDocumentPages(
  pages: ParsedPageData[],
  options: ChunkingOptions = {}
): DocumentChunk[] {
  const maxTokens = options.maxTokensPerChunk || 350;
  const overlapTokens = options.overlapTokens || 50;

  const chunks: DocumentChunk[] = [];
  let chunkIndex = 0;

  for (const page of pages) {
    let currentChunkLines: { lineNum: number; text: string }[] = [];
    let currentChunkTokens = 0;

    for (let i = 0; i < page.lines.length; i++) {
      const lineText = page.lines[i];
      const lineTokens = estimateTokenCount(lineText);

      // If adding this line exceeds maxTokens and we already have content
      if (currentChunkTokens + lineTokens > maxTokens && currentChunkLines.length > 0) {
        const fullChunkText = currentChunkLines.map((l) => l.text).join('\n');
        const startLine = currentChunkLines[0].lineNum;
        const endLine = currentChunkLines[currentChunkLines.length - 1].lineNum;

        chunks.push({
          id: `chunk-p${page.pageNumber}-c${chunkIndex + 1}`,
          pageNumber: page.pageNumber,
          chunkIndex: chunkIndex + 1,
          totalChunksInDoc: 0, // will be updated at the end
          startLine,
          endLine,
          tokenCount: estimateTokenCount(fullChunkText),
          text: fullChunkText,
        });

        chunkIndex++;

        // Prepare overlap: retain trailing lines that sum up to overlapTokens
        let overlapAccumulator = 0;
        const overlapSlice: { lineNum: number; text: string }[] = [];
        for (let j = currentChunkLines.length - 1; j >= 0; j--) {
          const lTokens = estimateTokenCount(currentChunkLines[j].text);
          if (overlapAccumulator + lTokens <= overlapTokens) {
            overlapAccumulator += lTokens;
            overlapSlice.unshift(currentChunkLines[j]);
          } else {
            break;
          }
        }

        currentChunkLines = [...overlapSlice];
        currentChunkTokens = overlapAccumulator;
      }

      currentChunkLines.push({ lineNum: i + 1, text: lineText });
      currentChunkTokens += lineTokens;
    }

    // Flush any remaining lines on this page
    if (currentChunkLines.length > 0) {
      const fullChunkText = currentChunkLines.map((l) => l.text).join('\n');
      const startLine = currentChunkLines[0].lineNum;
      const endLine = currentChunkLines[currentChunkLines.length - 1].lineNum;

      chunks.push({
        id: `chunk-p${page.pageNumber}-c${chunkIndex + 1}`,
        pageNumber: page.pageNumber,
        chunkIndex: chunkIndex + 1,
        totalChunksInDoc: 0,
        startLine,
        endLine,
        tokenCount: estimateTokenCount(fullChunkText),
        text: fullChunkText,
      });

      chunkIndex++;
    }
  }

  // Update totalChunksInDoc on all chunks
  return chunks.map((c) => ({
    ...c,
    totalChunksInDoc: chunks.length,
  }));
}
