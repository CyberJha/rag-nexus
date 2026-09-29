'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Upload,
  Cpu,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Layers,
  Settings,
  Send,
  Trash2,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Copy,
  Check,
  Eye,
  X,
  RefreshCw,
  Zap,
  Globe,
  Database
} from 'lucide-react';

import {
  ChatMessage,
  DocumentChunk,
  ModelConfig,
  ModelProvider,
  ParsedDocument,
  ReferenceSource,
  ToolExecutionRecord,
} from '@/types/rag';
import { parsePdfFile, parseTextFile } from '@/lib/pdfParser';
import { chunkDocumentPages, estimateTokenCount } from '@/lib/tokenization';
import { VectorStore } from '@/lib/vectorStore';

export default function NexusRagPage() {
  // Model Settings State
  const [modelConfig, setModelConfig] = useState<ModelConfig>({
    provider: 'gemini',
    modelName: 'gemini-1.5-flash',
    apiKey: '',
    baseUrl: '',
    temperature: 0.3,
  });
  const [showSettings, setShowSettings] = useState(false);

  // Document & Vector Store State
  const [parsedDoc, setParsedDoc] = useState<ParsedDocument | null>(null);
  const [vectorStore, setVectorStore] = useState<VectorStore | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState('');
  const [isDragActive, setIsDragActive] = useState(false);
  const [showChunksModal, setShowChunksModal] = useState(false);
  const [chunkFilterPage, setChunkFilterPage] = useState<number | 'all'>('all');

  // Chunking Configuration
  const [maxTokensPerChunk, setMaxTokensPerChunk] = useState(350);
  const [overlapTokens, setOverlapTokens] = useState(50);
  const [topK, setTopK] = useState(3);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const [copiedSnippetId, setCopiedSnippetId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load saved settings from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedConfig = localStorage.getItem('nexus_rag_config');
      if (savedConfig) {
        try {
          setModelConfig(JSON.parse(savedConfig));
        } catch (e) {
          console.error('Failed to parse saved config', e);
        }
      }
    }
  }, []);

  // Save settings when changed
  const updateModelConfig = (newConfig: Partial<ModelConfig>) => {
    const updated = { ...modelConfig, ...newConfig };
    setModelConfig(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('nexus_rag_config', JSON.stringify(updated));
    }
  };

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Handle File Upload & Tokenization
  const processUploadedFile = async (file: File) => {
    setIsUploading(true);
    setUploadProgressText('Extracting document pages & text content...');

    try {
      let parsed;
      if (file.name.toLowerCase().endsWith('.pdf')) {
        parsed = await parsePdfFile(file);
      } else {
        parsed = await parseTextFile(file);
      }

      setUploadProgressText('Estimating tokens & building semantic chunks...');
      const chunks = chunkDocumentPages(parsed.pages, {
        maxTokensPerChunk,
        overlapTokens,
      });

      const totalTokens = chunks.reduce((acc, c) => acc + c.tokenCount, 0);

      setUploadProgressText('Vectorizing text chunks & generating embeddings...');
      const vStore = new VectorStore(chunks);
      setVectorStore(vStore);

      const doc: ParsedDocument = {
        name: file.name,
        size: file.size,
        totalPages: parsed.pages.length,
        totalTokens,
        totalChunks: chunks.length,
        uploadedAt: new Date().toLocaleTimeString(),
        chunks,
      };

      setParsedDoc(doc);
      setUploadProgressText('');
      setIsUploading(false);

      // Add system announcement in chat
      setMessages((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          role: 'system',
          content: `✅ Successfully embedded **${file.name}**! Generated **${chunks.length} chunks** (~${totalTokens.toLocaleString()} tokens) across **${parsed.pages.length} pages**. You can now ask any question with exact line reference citations, or ask general questions outside the document.`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } catch (err: any) {
      console.error('File parsing failed:', err);
      alert(`Error processing file: ${err.message || 'Unable to parse document.'}`);
      setIsUploading(false);
      setUploadProgressText('');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processUploadedFile(e.dataTransfer.files[0]);
    }
  };

  // Submit Query
  const handleSendMessage = async (queryText?: string) => {
    const query = queryText || inputQuery;
    if (!query.trim() || isLoading) return;

    setInputQuery('');

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // 1. Vector Search against document if uploaded
      let contextChunks: ReferenceSource[] = [];
      let isOutsidePdf = true;

      if (vectorStore && parsedDoc) {
        const retrieval = vectorStore.search(query, topK, 0.08);
        contextChunks = retrieval.relevantChunks;
        isOutsidePdf = retrieval.isOutsidePdf;
      }

      // 2. Call backend /api/chat with RAG context & model config
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          contextChunks,
          isOutsidePdf,
          modelConfig,
          conversationHistory: messages
            .filter((m) => m.role !== 'system')
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `HTTP error ${res.status}`);
      }

      const assistantMessage: ChatMessage = {
        id: `asst-${Date.now()}`,
        role: 'assistant',
        content: data.content,
        timestamp: new Date().toLocaleTimeString(),
        sources: data.sources || [],
        isOutsidePdf: data.isOutsidePdf,
        toolExecution: data.toolExecution,
        modelUsed: data.modelUsed,
        providerUsed: data.providerUsed,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      console.error('Chat request failed:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ **Request Error**: ${err.message}\n\n*Tip: Check your API Key or switch to Local/Emergency mode in the top Settings panel.*`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSources = (msgId: string) => {
    setExpandedSources((prev) => ({
      ...prev,
      [msgId]: !prev[msgId],
    }));
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippetId(id);
    setTimeout(() => setCopiedSnippetId(null), 2000);
  };

  const clearChat = () => {
    setMessages([]);
  };

  const removeDocument = () => {
    setParsedDoc(null);
    setVectorStore(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setMessages((prev) => [
      ...prev,
      {
        id: `sys-${Date.now()}`,
        role: 'system',
        content: 'Document removed from active vector store. The AI is now operating in pure general knowledge & tool mode.',
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
  };

  return (
    <div className="app-container">
      {/* HEADER */}
      <header className="app-header glass-panel">
        <div className="logo-area">
          <div className="logo-icon">
            <Sparkles size={24} />
          </div>
          <div>
            <div className="logo-title">NEXUS RAG AI</div>
            <div className="logo-subtitle">PDF Vector Intelligence & Real-Time System Tools</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Model Status Pill */}
          <div
            className={`badge ${
              modelConfig.provider === 'ollama'
                ? 'badge-cyan'
                : modelConfig.provider === 'local_fallback'
                ? 'badge-amber'
                : 'badge-purple'
            }`}
          >
            <Cpu size={14} />
            <span>
              {modelConfig.provider.toUpperCase()} : {modelConfig.modelName}
            </span>
          </div>

          {/* Settings Toggle Button */}
          <button
            className={`btn-secondary ${showSettings ? 'active' : ''}`}
            onClick={() => setShowSettings(!showSettings)}
            title="Configure LLM APIs & Local Fallbacks"
          >
            <Settings size={16} />
            <span>LLM Settings</span>
          </button>
        </div>
      </header>

      {/* TOP SETTINGS DRAWER */}
      {showSettings && (
        <div className="glass-panel" style={{ padding: '20px 24px', animation: 'fadeIn 0.2s ease' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Cpu size={18} color="var(--accent-purple-light)" />
              LLM Engine & Dual Connection Config (API & Local)
            </h3>
            <button
              onClick={() => setShowSettings(false)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              <X size={18} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            {/* Provider Switch */}
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>
                Select Engine / Connection
              </label>
              <select
                className="glass-select"
                value={modelConfig.provider}
                onChange={(e) => {
                  const p = e.target.value as ModelProvider;
                  let defaultModel = 'gemini-1.5-flash';
                  if (p === 'openai') defaultModel = 'gpt-4o-mini';
                  if (p === 'groq') defaultModel = 'llama-3.3-70b-versatile';
                  if (p === 'ollama') defaultModel = 'llama3';
                  if (p === 'local_fallback') defaultModel = 'extractive-offline';
                  updateModelConfig({ provider: p, modelName: defaultModel });
                }}
              >
                <option value="gemini">🚀 Google Gemini API (Recommended)</option>
                <option value="groq">⚡ Groq Cloud (Ultra Fast Llama 3)</option>
                <option value="openai">🧠 OpenAI API (GPT-4o mini / GPT-4o)</option>
                <option value="ollama">💻 Local Ollama (Emergency / Offline)</option>
                <option value="local_fallback">🛡️ Pure Offline Local Extractor</option>
              </select>
            </div>

            {/* Model Name */}
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>
                Model Identifier
              </label>
              <input
                type="text"
                className="glass-input"
                value={modelConfig.modelName}
                placeholder="e.g. gemini-1.5-flash, llama3"
                onChange={(e) => updateModelConfig({ modelName: e.target.value })}
              />
            </div>

            {/* API Key (if cloud provider) */}
            {modelConfig.provider !== 'ollama' && modelConfig.provider !== 'local_fallback' && (
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>
                  API Key ({modelConfig.provider.toUpperCase()})
                </label>
                <input
                  type="password"
                  className="glass-input"
                  value={modelConfig.apiKey || ''}
                  placeholder={`Enter your ${modelConfig.provider} API key`}
                  onChange={(e) => updateModelConfig({ apiKey: e.target.value })}
                />
              </div>
            )}

            {/* Base URL (if Ollama or custom) */}
            {modelConfig.provider === 'ollama' && (
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>
                  Local Ollama Base URL
                </label>
                <input
                  type="text"
                  className="glass-input"
                  value={modelConfig.baseUrl || 'http://127.0.0.1:11434'}
                  placeholder="http://127.0.0.1:11434"
                  onChange={(e) => updateModelConfig({ baseUrl: e.target.value })}
                />
              </div>
            )}
          </div>

          <div style={{ marginTop: '12px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            💡 <strong>Pro Tip for Deployment & Demo</strong>: You can provide your Gemini / OpenAI / Groq API key in the field above or set it as an Environment Variable (<code>GEMINI_API_KEY</code>, <code>OPENAI_API_KEY</code>, <code>GROQ_API_KEY</code>) in your Vercel project dashboard. In case of network disconnection or emergency, switch to <strong>Local Ollama</strong> or <strong>Pure Offline Mode</strong>!
          </div>
        </div>
      )}

      {/* MAIN TWO-COLUMN WORKSPACE */}
      <div className="main-layout">
        {/* SIDEBAR: Upload & Document Metrics */}
        <aside className="sidebar glass-panel">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.05rem', color: '#fff' }}>
              Knowledge Base
            </span>
            {parsedDoc && (
              <button
                onClick={removeDocument}
                className="btn-secondary"
                style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#F87171' }}
                title="Remove current document"
              >
                <Trash2 size={13} />
                <span>Unload</span>
              </button>
            )}
          </div>

          {/* Upload Dropzone */}
          {!parsedDoc ? (
            <div
              className={`dropzone ${isDragActive ? 'drag-active' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragActive(true);
              }}
              onDragLeave={() => setIsDragActive(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    processUploadedFile(e.target.files[0]);
                  }
                }}
              />
              <div className="dropzone-icon">
                <Upload size={24} />
              </div>
              <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.95rem', marginBottom: '4px' }}>
                Upload PDF Document
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Drag & drop or click to tokenize & embed
              </div>
              <div style={{ marginTop: '12px' }}>
                <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>
                  Supports .PDF, .TXT, .MD
                </span>
              </div>
            </div>
          ) : (
            /* Active Document Info Card */
            <div className="glass-card" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div
                  style={{
                    background: 'rgba(168, 85, 247, 0.2)',
                    padding: '8px',
                    borderRadius: '8px',
                    color: 'var(--accent-purple-light)',
                  }}
                >
                  <FileText size={20} />
                </div>
                <div style={{ overflow: 'hidden' }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={parsedDoc.name}
                  >
                    {parsedDoc.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {(parsedDoc.size / 1024).toFixed(1)} KB • {parsedDoc.totalPages} Pages
                  </div>
                </div>
              </div>

              {/* Chunks and Token Counters (Requirement 2 & 4) */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px',
                  marginBottom: '14px',
                }}
              >
                <div
                  style={{
                    background: 'rgba(14, 10, 26, 0.8)',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid rgba(168, 85, 247, 0.2)',
                  }}
                >
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    Total Chunks
                  </div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--accent-purple-light)' }}>
                    {parsedDoc.totalChunks}
                  </div>
                </div>

                <div
                  style={{
                    background: 'rgba(14, 10, 26, 0.8)',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid rgba(168, 85, 247, 0.2)',
                  }}
                >
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    Token Count
                  </div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#38BDF8' }}>
                    ~{parsedDoc.totalTokens.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Chunks Inspector Button */}
              <button
                className="btn-secondary"
                style={{ width: '100%', fontSize: '0.8rem' }}
                onClick={() => setShowChunksModal(true)}
              >
                <Layers size={14} />
                <span>Inspect Chunks & Line Mappings</span>
              </button>
            </div>
          )}

          {/* Upload Progress Indicator */}
          {isUploading && (
            <div className="glass-card" style={{ padding: '14px', textAlign: 'center' }}>
              <div
                style={{
                  display: 'inline-block',
                  animation: 'spin 1s linear infinite',
                  color: 'var(--accent-purple-light)',
                  marginBottom: '8px',
                }}
              >
                <RefreshCw size={20} />
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                {uploadProgressText}
              </div>
            </div>
          )}

          {/* RAG Search Hyperparameters (Hidden as requested) */}
          {/*
          <div className="glass-card" style={{ padding: '16px' }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Database size={15} color="var(--accent-purple-light)" />
              RAG Hyperparameters
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Top-K Chunks to Retrieve</span>
                  <span style={{ fontWeight: 700, color: 'var(--accent-purple-light)' }}>{topK}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="8"
                  value={topK}
                  onChange={(e) => setTopK(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent-purple)' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Chunk Size (Tokens)</span>
                  <span style={{ fontWeight: 700, color: 'var(--accent-purple-light)' }}>{maxTokensPerChunk}</span>
                </div>
                <input
                  type="range"
                  min="150"
                  max="800"
                  step="50"
                  value={maxTokensPerChunk}
                  onChange={(e) => setMaxTokensPerChunk(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent-purple)' }}
                />
              </div>
            </div>
          </div>
          */}

          {/* Quick Prompts Helper */}
          <div style={{ marginTop: 'auto' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 600 }}>
              Try Teacher Test Prompts:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button
                className="btn-secondary"
                style={{ textAlign: 'left', justifyContent: 'flex-start', fontSize: '0.74rem', padding: '6px 10px' }}
                onClick={() => handleSendMessage("What is today's date and current time right now?")}
              >
                <Zap size={12} color="#F59E0B" />
                <span>Test Live Date/Time Tool</span>
              </button>
              <button
                className="btn-secondary"
                style={{ textAlign: 'left', justifyContent: 'flex-start', fontSize: '0.74rem', padding: '6px 10px' }}
                onClick={() => handleSendMessage("What will be the date two days later?")}
              >
                <Zap size={12} color="#C084FC" />
                <span>Calculate Date: 2 Days Later</span>
              </button>
              <button
                className="btn-secondary"
                style={{ textAlign: 'left', justifyContent: 'flex-start', fontSize: '0.74rem', padding: '6px 10px' }}
                onClick={() => handleSendMessage('Explain how photosynthesis works in plants')}
              >
                <Globe size={12} color="#10B981" />
                <span>Test Question Outside PDF</span>
              </button>
            </div>
          </div>
        </aside>

        {/* CHAT ARENA */}
        <main className="chat-arena glass-panel">
          {/* Chat Header */}
          <div className="chat-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="pulse-dot"></div>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1rem' }}>
                Conversation Session
              </span>
              {parsedDoc ? (
                <span className="badge badge-emerald" style={{ fontSize: '0.68rem' }}>
                  Document Loaded: {parsedDoc.chunks.length} Chunks Active
                </span>
              ) : (
                <span className="badge badge-amber" style={{ fontSize: '0.68rem' }}>
                  No Document Loaded (Pure Tool/General Mode)
                </span>
              )}
            </div>

            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="btn-secondary"
                style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                title="Clear conversation"
              >
                <Trash2 size={13} />
                <span>Clear</span>
              </button>
            )}
          </div>

          {/* Messages Scroll Area */}
          <div className="messages-list">
            {messages.length === 0 ? (
              <div
                style={{
                  margin: 'auto',
                  textAlign: 'center',
                  maxWidth: '520px',
                  padding: '40px 20px',
                }}
              >
                <div
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(168, 85, 247, 0.3) 0%, rgba(99, 102, 241, 0.1) 70%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                    border: '1px solid rgba(168, 85, 247, 0.4)',
                  }}
                >
                  <Sparkles size={32} color="var(--accent-purple-light)" />
                </div>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.4rem', marginBottom: '8px' }}>
                  Welcome to Nexus RAG AI
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '24px' }}>
                  Upload any PDF in the left sidebar to generate vector token chunks, or ask general questions and test the teacher&apos;s real-time clock tool.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', textAlign: 'left' }}>
                  <div
                    className="glass-card"
                    style={{ padding: '12px', cursor: 'pointer' }}
                    onClick={() => handleSendMessage("What is today's date and time?")}
                  >
                    <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#FBBF24', marginBottom: '4px' }}>
                      ⚡ Test Live Clock Tool
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                      Fixes LLM training cutoff with real-time system tool execution
                    </div>
                  </div>

                  <div
                    className="glass-card"
                    style={{ padding: '12px', cursor: 'pointer' }}
                    onClick={() => handleSendMessage('What are the key advantages of RAG over fine-tuning?')}
                  >
                    <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#38BDF8', marginBottom: '4px' }}>
                      🌐 General Knowledge
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                      Answers questions outside the PDF using full LLM intellect
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`message-bubble ${msg.role === 'user' ? 'message-user' : 'message-assistant'}`}
                >
                  {/* System Tool Execution Badge (Teacher requirement) */}
                  {msg.toolExecution && (
                    <div className="tool-banner">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Zap size={16} color="#F59E0B" />
                        <div>
                          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#FCD34D' }}>
                            Tool Invoked: {msg.toolExecution.toolName}()
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                            System host clock queried at {msg.toolExecution.executedAt} (Eliminating training cutoff)
                          </div>
                        </div>
                      </div>
                      <span className="tool-badge-live">LIVE OUTPUT</span>
                    </div>
                  )}

                  {/* Context Badge: PDF vs Outside */}
                  {msg.role === 'assistant' && (
                    <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {msg.isOutsidePdf ? (
                        <span className="badge badge-cyan" style={{ fontSize: '0.65rem' }}>
                          <Globe size={11} /> Outside Document Knowledge
                        </span>
                      ) : msg.sources && msg.sources.length > 0 ? (
                        <span className="badge badge-purple" style={{ fontSize: '0.65rem' }}>
                          <FileText size={11} /> Grounded in PDF ({msg.sources.length} Chunks Referenced)
                        </span>
                      ) : null}

                      {msg.modelUsed && (
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          via {msg.providerUsed} ({msg.modelUsed})
                        </span>
                      )}
                    </div>
                  )}

                  {/* Message Content */}
                  <div
                    style={{
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontSize: '0.92rem',
                    }}
                  >
                    {msg.content}
                  </div>

                  {/* COLLAPSIBLE SOURCES ACCORDION (Requirement 3: "keep the reference hidden and option to see the reference") */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div style={{ marginTop: '12px' }}>
                      <button
                        className="sources-toggle-btn"
                        onClick={() => toggleSources(msg.id)}
                      >
                        <Eye size={13} />
                        <span>
                          {expandedSources[msg.id] ? 'Hide References' : `View Referenced Sources (${msg.sources.length} chunks)`}
                        </span>
                        {expandedSources[msg.id] ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>

                      {expandedSources[msg.id] && (
                        <div className="sources-container">
                          {msg.sources.map((src, idx) => (
                            <div key={src.chunkId || idx} className="source-item">
                              <div className="source-meta">
                                <span style={{ color: 'var(--accent-purple-light)', fontWeight: 600 }}>
                                  Citation #{idx + 1} • Page {src.pageNumber} • Lines {src.startLine}-{src.endLine}
                                </span>
                                <span style={{ fontSize: '0.72rem', color: '#34D399', fontWeight: 600 }}>
                                  {(src.similarityScore * 100).toFixed(0)}% Match (Chunk #{src.chunkIndex})
                                </span>
                              </div>
                              <div className="source-text">
                                &quot;{src.textSnippet}&quot;
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                                <button
                                  className="btn-secondary"
                                  style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                                  onClick={() => copyToClipboard(src.textSnippet, `${msg.id}-${idx}`)}
                                >
                                  {copiedSnippetId === `${msg.id}-${idx}` ? (
                                    <>
                                      <Check size={11} color="#34D399" />
                                      <span>Copied</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy size={11} />
                                      <span>Copy Citation</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'right' }}>
                    {msg.timestamp}
                  </div>
                </div>
              ))
            )}

            {isLoading && (
              <div className="message-bubble message-assistant" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-purple-light)' }}>
                  <RefreshCw size={16} />
                </div>
                <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                  Analyzing vector chunks and querying LLM engine...
                </span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* INPUT BAR */}
          <div className="chat-input-bar">
            <input
              type="text"
              className="glass-input"
              value={inputQuery}
              placeholder={
                parsedDoc
                  ? 'Ask anything about the document or outside topics (or ask for today&apos;s date)...'
                  : 'Ask any question or test the live date/time tool...'
              }
              onChange={(e) => setInputQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSendMessage();
              }}
              disabled={isLoading}
            />
            <button
              className="btn-primary"
              onClick={() => handleSendMessage()}
              disabled={isLoading || !inputQuery.trim()}
            >
              <Send size={16} />
              <span>Send</span>
            </button>
          </div>
        </main>
      </div>

      {/* CHUNKS INSPECTOR MODAL (Requirement 2 & 4 Visualizer) */}
      {showChunksModal && parsedDoc && (
        <div className="modal-overlay" onClick={() => setShowChunksModal(false)}>
          <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Layers size={20} color="var(--accent-purple-light)" />
                <div>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', margin: 0 }}>
                    Document Chunks & Line Reference Inspector
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {parsedDoc.name} • Total {parsedDoc.totalChunks} Chunks (~{parsedDoc.totalTokens.toLocaleString()} Tokens)
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowChunksModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--glass-border)', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Filter by Page:</span>
              <button
                className={`btn-secondary ${chunkFilterPage === 'all' ? 'active' : ''}`}
                style={{ padding: '3px 10px', fontSize: '0.75rem' }}
                onClick={() => setChunkFilterPage('all')}
              >
                All Pages ({parsedDoc.totalChunks})
              </button>
              {Array.from({ length: parsedDoc.totalPages }, (_, i) => i + 1).map((pg) => (
                <button
                  key={pg}
                  className={`btn-secondary ${chunkFilterPage === pg ? 'active' : ''}`}
                  style={{ padding: '3px 10px', fontSize: '0.75rem' }}
                  onClick={() => setChunkFilterPage(pg)}
                >
                  Page {pg}
                </button>
              ))}
            </div>

            <div className="modal-body">
              {parsedDoc.chunks
                .filter((c) => chunkFilterPage === 'all' || c.pageNumber === chunkFilterPage)
                .map((chunk) => (
                  <div key={chunk.id} className="glass-card" style={{ padding: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.8rem' }}>
                      <span style={{ fontWeight: 700, color: 'var(--accent-purple-light)' }}>
                        Chunk #{chunk.chunkIndex} of {parsedDoc.totalChunks}
                      </span>
                      <span className="badge badge-purple" style={{ fontSize: '0.68rem' }}>
                        Page {chunk.pageNumber} • Lines {chunk.startLine}-{chunk.endLine} • ~{chunk.tokenCount} Tokens
                      </span>
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.78rem',
                        background: 'rgba(8, 6, 16, 0.7)',
                        padding: '10px 12px',
                        borderRadius: '6px',
                        borderLeft: '3px solid var(--accent-purple)',
                        maxHeight: '120px',
                        overflowY: 'auto',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {chunk.text}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
