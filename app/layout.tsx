import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nexus RAG | Next-Gen PDF Intelligence & System Tool Agent',
  description:
    'Production RAG AI assistant with PDF tokenization, vector search, collapsible line citations, real-time date/time tools, and dual Cloud/Local LLM connectivity.',
  keywords: ['RAG', 'AI', 'PDF Assistant', 'Vector Search', 'Tokenization', 'Ollama', 'Gemini', 'Vercel'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#07060D" />
      </head>
      <body>{children}</body>
    </html>
  );
}
