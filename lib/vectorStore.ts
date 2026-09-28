import { DocumentChunk, ReferenceSource } from '@/types/rag';

export interface SearchResult {
  chunk: DocumentChunk;
  similarity: number;
}

export interface RetrievalOutput {
  relevantChunks: ReferenceSource[];
  isOutsidePdf: boolean;
  maxSimilarity: number;
}

/**
 * Builds vocabulary and computes TF-IDF + n-gram vector representations.
 * Zero external API dependency, lightning fast, runs on Vercel or locally.
 */
export class VectorStore {
  private chunks: DocumentChunk[] = [];
  private vocabulary: Map<string, number> = new Map();
  private idf: Map<string, number> = new Map();
  private chunkVectors: number[][] = [];

  constructor(chunks: DocumentChunk[] = []) {
    if (chunks.length > 0) {
      this.indexChunks(chunks);
    }
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 1);
  }

  public indexChunks(chunks: DocumentChunk[]): void {
    this.chunks = chunks;
    this.vocabulary.clear();
    this.idf.clear();

    const docCount = chunks.length;
    const docTermFreqs: Map<string, number>[] = [];
    const docFrequency: Map<string, number> = new Map();

    // Pass 1: Build vocabulary and document frequencies
    for (const chunk of chunks) {
      const tokens = this.tokenize(chunk.text);
      const tf = new Map<string, number>();
      const seenInDoc = new Set<string>();

      for (const token of tokens) {
        tf.set(token, (tf.get(token) || 0) + 1);
        if (!seenInDoc.has(token)) {
          seenInDoc.add(token);
          docFrequency.set(token, (docFrequency.get(token) || 0) + 1);
        }
      }

      docTermFreqs.push(tf);
    }

    // Assign vocab index
    let vocabIndex = 0;
    docFrequency.forEach((df, term) => {
      this.vocabulary.set(term, vocabIndex++);
      // Standard smoothed IDF: ln((N + 1) / (df + 1)) + 1
      const idfValue = Math.log((docCount + 1) / (df + 1)) + 1;
      this.idf.set(term, idfValue);
    });

    const vocabSize = this.vocabulary.size;

    // Pass 2: Vectorize each chunk
    this.chunkVectors = chunks.map((chunk, idx) => {
      const tfMap = docTermFreqs[idx];
      const vector = new Array(vocabSize).fill(0);
      let normSq = 0;

      tfMap.forEach((count, term) => {
        const vIndex = this.vocabulary.get(term);
        const idfVal = this.idf.get(term) || 1;
        if (vIndex !== undefined) {
          // TF-IDF with sublinear term frequency scaling
          const tf = 1 + Math.log(count);
          const score = tf * idfVal;
          vector[vIndex] = score;
          normSq += score * score;
        }
      });

      // L2 Normalize
      const norm = Math.sqrt(normSq) || 1;
      return vector.map((val) => val / norm);
    });
  }

  private vectorizeQuery(query: string): number[] {
    const vocabSize = this.vocabulary.size;
    const vector = new Array(vocabSize).fill(0);
    const tokens = this.tokenize(query);
    if (tokens.length === 0 || vocabSize === 0) return vector;

    const queryTf = new Map<string, number>();
    for (const token of tokens) {
      queryTf.set(token, (queryTf.get(token) || 0) + 1);
    }

    let normSq = 0;
    queryTf.forEach((count, term) => {
      const vIndex = this.vocabulary.get(term);
      const idfVal = this.idf.get(term) || 0;
      if (vIndex !== undefined && idfVal > 0) {
        const tf = 1 + Math.log(count);
        const score = tf * idfVal;
        vector[vIndex] = score;
        normSq += score * score;
      }
    });

    const norm = Math.sqrt(normSq) || 1;
    return vector.map((val) => val / norm);
  }

  private cosineSimilarity(vA: number[], vB: number[]): number {
    let dot = 0;
    for (let i = 0; i < vA.length; i++) {
      dot += vA[i] * vB[i];
    }
    return Math.max(0, Math.min(1, dot));
  }

  /**
   * Search top K chunks matching user query.
   * If highest similarity is below threshold, marks as outside the PDF.
   */
  public search(
    query: string,
    topK: number = 3,
    similarityThreshold: number = 0.08
  ): RetrievalOutput {
    if (this.chunks.length === 0) {
      return {
        relevantChunks: [],
        isOutsidePdf: true,
        maxSimilarity: 0,
      };
    }

    const queryVec = this.vectorizeQuery(query);
    const scored: SearchResult[] = [];

    for (let i = 0; i < this.chunks.length; i++) {
      const sim = this.cosineSimilarity(queryVec, this.chunkVectors[i]);
      scored.push({ chunk: this.chunks[i], similarity: sim });
    }

    scored.sort((a, b) => b.similarity - a.similarity);
    const topScored = scored.slice(0, topK);
    const maxSim = topScored.length > 0 ? topScored[0].similarity : 0;

    const isOutside = maxSim < similarityThreshold;

    const relevantChunks: ReferenceSource[] = topScored
      .filter((s) => s.similarity > (isOutside ? 0.01 : similarityThreshold))
      .map((s) => ({
        chunkId: s.chunk.id,
        pageNumber: s.chunk.pageNumber,
        chunkIndex: s.chunk.chunkIndex,
        startLine: s.chunk.startLine,
        endLine: s.chunk.endLine,
        similarityScore: Math.round(s.similarity * 100) / 100,
        textSnippet: s.chunk.text,
      }));

    return {
      relevantChunks,
      isOutsidePdf: isOutside,
      maxSimilarity: maxSim,
    };
  }

  public getChunksCount(): number {
    return this.chunks.length;
  }
}
