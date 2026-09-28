import { NextRequest, NextResponse } from 'next/server';
import { executeDateTimeTool, detectDateTimeIntent } from '@/lib/tools/dateTimeTool';
import { ModelConfig, ReferenceSource, ToolExecutionRecord } from '@/types/rag';

interface ChatRequestBody {
  query: string;
  contextChunks: ReferenceSource[];
  isOutsidePdf: boolean;
  modelConfig: ModelConfig;
  conversationHistory?: { role: 'user' | 'assistant'; content: string }[];
}

export async function POST(req: NextRequest) {
  try {
    const body: ChatRequestBody = await req.json();
    const { query, contextChunks, isOutsidePdf, modelConfig, conversationHistory = [] } = body;

    if (!query || !query.trim()) {
      return NextResponse.json({ error: 'Query is required.' }, { status: 400 });
    }

    // 1. Check for Real-time Date/Time Tool invocation (Teacher's requirement)
    let toolExecution: ToolExecutionRecord | null = null;
    let toolContextPrompt = '';

    if (detectDateTimeIntent(query)) {
      const toolResult = executeDateTimeTool();
      toolExecution = {
        toolName: 'get_current_date_time',
        inputArgs: { query },
        output: JSON.stringify(toolResult),
        executedAt: new Date().toLocaleTimeString(),
      };

      toolContextPrompt = `
[REAL-TIME SYSTEM TOOL EXECUTION - 'get_current_date_time']:
Status: VERIFIED_LIVE_CLOCK_OUTPUT
Live System Date: ${toolResult.currentDate}
Live System Time: ${toolResult.currentTime}
Day of Week: ${toolResult.dayOfWeek}
Timezone: ${toolResult.timezone}
ISO Timestamp: ${toolResult.isoTimestamp}
Note: Your training cutoff date is outdated. You MUST use the live system tool output above to provide the exact, accurate current date and time to the user.
`;
    }

    // 2. Prepare RAG Context Prompt
    let contextBlock = '';
    if (contextChunks && contextChunks.length > 0) {
      contextBlock = contextChunks
        .map(
          (c, idx) =>
            `[DOCUMENT EXCERPT ${idx + 1} | Chunk #${c.chunkIndex} | Page ${c.pageNumber} | Lines ${c.startLine}-${c.endLine} | Similarity: ${(c.similarityScore * 100).toFixed(0)}%]\n"${c.textSnippet}"\n`
        )
        .join('\n');
    }

    // 3. System Instructions
    const systemPrompt = `You are Nexus RAG, an intelligent AI assistant equipped with dynamic document retrieval and live system tools.

KNOWLEDGE BASE & GUIDELINES:
${toolContextPrompt ? toolContextPrompt + '\n' : ''}
${
  contextBlock
    ? `=== RETRIEVED DOCUMENT CONTEXT ===\n${contextBlock}\n=== END DOCUMENT CONTEXT ===\n
INSTRUCTIONS FOR DOCUMENT QUESTIONS:
- Ground your answer primarily in the provided document excerpts above.
- Mention which page or lines provide the evidence when explaining facts from the document.
- Be clear, thorough, and structured.`
    : isOutsidePdf
    ? `NOTE: The user's query appears to be OUTSIDE the uploaded document or no document is uploaded.
Answer using your comprehensive general knowledge, and clearly acknowledge that this answer is derived from general knowledge outside the document.`
    : `Answer helpfully using the provided context or general knowledge.`
}

IMPORTANT: If the user asks for the current date or time, reference the live system tool output provided above. Do NOT use your training cutoff date.`;

    // 4. Dispatch to selected Provider
    const { provider, modelName, apiKey, baseUrl } = modelConfig;

    let assistantResponse = '';

    // Handle Local Ollama
    if (provider === 'ollama') {
      const ollamaUrl = (baseUrl || 'http://127.0.0.1:11434').replace(/\/$/, '') + '/api/chat';
      try {
        const ollamaRes = await fetch(ollamaUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelName || 'llama3',
            messages: [
              { role: 'system', content: systemPrompt },
              ...conversationHistory.slice(-4),
              { role: 'user', content: query },
            ],
            stream: false,
          }),
        });

        if (!ollamaRes.ok) {
          throw new Error(`Ollama responded with status ${ollamaRes.status}: ${await ollamaRes.text()}`);
        }

        const data = await ollamaRes.json();
        assistantResponse = data.message?.content || data.response || 'No response from local Ollama.';
      } catch (err: any) {
        return NextResponse.json(
          {
            error: `Local Ollama Connection Failed: ${err.message}. Please ensure Ollama is running ('ollama serve') on port 11434 or switch to Cloud API.`,
            toolExecution,
          },
          { status: 502 }
        );
      }
    }
    // Handle Google Gemini API
    else if (provider === 'gemini') {
      const key = apiKey || process.env.GEMINI_API_KEY;
      if (!key) {
        return NextResponse.json(
          {
            error: 'Gemini API Key missing. Please provide your Gemini API Key in the settings panel or set GEMINI_API_KEY environment variable.',
            toolExecution,
          },
          { status: 401 }
        );
      }

      const activeModel = modelName || 'gemini-1.5-flash';
      const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${key}`;

      const contents = [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\nUser Question: ${query}` }],
        },
      ];

      const res = await fetch(geminiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1500,
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return NextResponse.json(
          { error: `Gemini API error (${res.status}): ${errText}`, toolExecution },
          { status: res.status }
        );
      }

      const data = await res.json();
      assistantResponse =
        data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response text generated by Gemini.';
    }
    // Handle OpenAI or Groq (OpenAI-compatible)
    else if (provider === 'openai' || provider === 'groq') {
      const isGroq = provider === 'groq';
      const defaultEndpoint = isGroq
        ? 'https://api.groq.com/openai/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';
      const endpoint = baseUrl || defaultEndpoint;
      const key = apiKey || (isGroq ? process.env.GROQ_API_KEY : process.env.OPENAI_API_KEY);

      if (!key) {
        return NextResponse.json(
          {
            error: `${isGroq ? 'Groq' : 'OpenAI'} API Key missing. Please provide it in the top settings panel.`,
            toolExecution,
          },
          { status: 401 }
        );
      }

      const activeModel = modelName || (isGroq ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini');

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: activeModel,
          messages: [
            { role: 'system', content: systemPrompt },
            ...conversationHistory.slice(-4),
            { role: 'user', content: query },
          ],
          temperature: 0.3,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return NextResponse.json(
          { error: `${provider} API error (${res.status}): ${errText}`, toolExecution },
          { status: res.status }
        );
      }

      const data = await res.json();
      assistantResponse = data.choices?.[0]?.message?.content || 'No response from API.';
    }
    // Local Emergency Fallback (Extractive AI synthesis)
    else {
      // High-quality deterministic local synthesizer for emergency mode
      if (toolExecution) {
        const parsed = JSON.parse(toolExecution.output);
        assistantResponse = `🕒 **Live System Time & Date (Real-time Tool)**:\n- **Current Date**: ${parsed.currentDate}\n- **Current Time**: ${parsed.currentTime} (${parsed.timezone})\n- **Day of the Week**: ${parsed.dayOfWeek}\n\n*(Verified using host machine clock tool to eliminate LLM training cutoff discrepancies.)*`;
      } else if (contextChunks && contextChunks.length > 0) {
        assistantResponse = `### [Emergency Local Synthesis Mode]\n\nBased on the uploaded document excerpts:\n\n${contextChunks
          .map((c) => `- **From Page ${c.pageNumber} (Lines ${c.startLine}-${c.endLine})**: ${c.textSnippet.slice(0, 220)}...`)
          .join('\n\n')}\n\n*Note: Operating in Emergency Offline Mode. For deep semantic reasoning, connect Gemini, OpenAI, Groq API key, or local Ollama.*`;
      } else {
        assistantResponse = `Operating in Emergency Offline Mode. To generate generative answers outside the document, please configure a Cloud API key (Gemini, Groq, OpenAI) or start local Ollama on port 11434.`;
      }
    }

    return NextResponse.json({
      content: assistantResponse,
      sources: contextChunks,
      isOutsidePdf,
      toolExecution,
      providerUsed: provider,
      modelUsed: modelName,
    });
  } catch (error: any) {
    console.error('Error in chat API route:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error occurred while processing request.' },
      { status: 500 }
    );
  }
}
