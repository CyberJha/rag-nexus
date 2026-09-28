export type ModelProvider = 'gemini' | 'openai' | 'groq' | 'ollama' | 'local_fallback';

export interface ModelConfig {
  provider: ModelProvider;
  modelName: string;
  apiKey?: string;
  baseUrl?: string; // For Ollama or custom OpenAI-compatible endpoint
  temperature?: number;
  maxTokens?: number;
}

export interface DocumentChunk {
  id: string;
  pageNumber: number;
  chunkIndex: number;
  totalChunksInDoc: number;
  startLine: number;
  endLine: number;
  tokenCount: number;
  text: string;
  vector?: number[];
}

export interface ParsedDocument {
  name: string;
  size: number;
  totalPages: number;
  totalTokens: number;
  totalChunks: number;
  uploadedAt: string;
  chunks: DocumentChunk[];
}

export interface ReferenceSource {
  chunkId: string;
  pageNumber: number;
  chunkIndex: number;
  startLine: number;
  endLine: number;
  similarityScore: number;
  textSnippet: string;
}

export interface ToolExecutionRecord {
  toolName: string;
  inputArgs: Record<string, any>;
  output: string;
  executedAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  sources?: ReferenceSource[];
  isOutsidePdf?: boolean;
  toolExecution?: ToolExecutionRecord;
  modelUsed?: string;
  providerUsed?: ModelProvider;
}

export interface RagMetrics {
  totalChunks: number;
  totalTokens: number;
  activeContextChunks: number;
  retrievalLatencyMs?: number;
}
