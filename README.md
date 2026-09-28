# 🌌 Nexus RAG AI Assistant

> **Next-Generation Retrieval-Augmented Generation (RAG) AI Assistant with Semantic PDF Tokenization, Vector Search, Collapsible Line Citations, Real-Time System Tools, and Dual Cloud/Local LLM Connectivity.**

Built with **Next.js 14**, **React**, **TypeScript**, and **Custom Glassmorphic Vanilla CSS (Pitch Black & Neon Purple Aesthetic)**. Ready for 1-click deployment on **Vercel** via GitHub.

---

## 🎯 Assignment Marks & Features Checklist

| # | Requirement | Implementation Status | Where to Find & Test |
|---|-------------|-----------------------|----------------------|
| **1** | **Dual LLM Connection (API & Local)** | ✅ Complete | Top-right **LLM Settings**: Switch between **Google Gemini**, **Groq**, **OpenAI**, **Local Ollama** (`http://127.0.0.1:11434`), or **Pure Offline Extractor**! |
| **2** | **PDF Upload & Token Embedding** | ✅ Complete | Drag & drop or upload `.pdf` (or `.txt`/`.md`). Parses text with line numbers, calculates BPE tokens, and generates vector space embeddings. |
| **3** | **Exact Line References (Hidden with Toggle Option)** | ✅ Complete | Cites exact **Page Number**, **Lines range (e.g. Lines 45-62)**, **Chunk ID**, and **Similarity Match %**. Kept **collapsed by default** with an interactive `View Referenced Sources` pill! |
| **4** | **Chunks Count & Metrics Display** | ✅ Complete | Sidebar displays **Total Chunks**, **Token Count**, **Top-K Retrieval Slider**, plus an **Inspect Chunks** modal showing every indexed block! |
| **5** | **Answer Questions Outside PDF** | ✅ Complete | Intelligent query router: if similarity confidence is low or question is general, the LLM answers gracefully with a `🌐 Outside Document Knowledge` badge. |
| **★** | **Real-Time Date & Time Tool (Teacher's Special Requirement)** | ✅ Complete | Custom autonomous tool `get_current_date_time` executes live host clock queries, eliminating LLM training cutoff discrepancies and displaying a `⚡ Tool Invoked` badge! |

---

## 🎨 Design & Aesthetic

- **Glassmorphism**: Ultra-high refractive blur (`backdrop-filter: blur(20px)`), frosted translucent acrylic panels (`rgba(20, 15, 36, 0.6)`), and subtle ambient gradient borders.
- **Color Palette**: Pitch Black (`#07060D`), Deep Violet (`#0E0B1A`), Neon Purple (`#A855F7`), Cyber Indigo (`#6366F1`), and Electric Magenta (`#EC4899`).
- **Interactive Micro-animations**: Glowing pulse status dots, floating background ambient orbs, smooth collapsible drawers, and hover glow accents.

---

## 🛠️ The Real-Time Date & Time Tool (`get_current_date_time`)

### The Problem Pointed Out by Teacher:
When asking standard LLM APIs *"What is today's date and time?"*, models reply with their static training cutoff date (e.g. 2023 or 2024), failing to know the real-world current moment.

### The Solution Built:
1. **Tool Definition**: Registered `get_current_date_time` tool schema (`lib/tools/dateTimeTool.ts`).
2. **Intent Detector**: Autonomously intercepts temporal queries ("today's date", "current time", "what day is today").
3. **Host Clock Execution**: Queries the live machine clock with timezone resolution.
4. **Context Injection**: Injects verified live timestamps into the model's system reasoning.
5. **UI Visibility**: Displays a glowing `⚡ Tool Invoked: get_current_date_time() [LIVE OUTPUT]` badge in the response.

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- **Node.js** (v18 or higher)
- **npm** (comes with Node.js)

### 2. Run Development Server
```bash
# Clone the repository
git clone https://github.com/your-username/nexus-rag-ai-assistant.git
cd nexus-rag-ai-assistant

# Install dependencies (if not already installed)
npm install

# Start development server
npm run dev
```

Open your browser and navigate to:
```
http://localhost:3000
```

### 3. Local LLM / Ollama Setup (Emergency Mode)
If you want to run purely locally without any cloud API keys:
1. Install [Ollama](https://ollama.ai)
2. Pull a local model:
   ```bash
   ollama run llama3
   # or: ollama run mistral / phi3
   ```
3. In Nexus RAG, click **LLM Settings** at the top right, select **Local Ollama**, and ensure base URL is `http://127.0.0.1:11434`.

---

## 🌐 Deploy to Vercel via GitHub (Step-by-Step)

Deploying this project to Vercel is 100% plug-and-play:

### Step 1: Push to your GitHub Repository
```bash
# In the project root:
git add .
git commit -m "feat: complete Nexus RAG AI with glassmorphism, vector search, and date-time tool"
git branch -M main
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/<YOUR_REPOSITORY_NAME>.git
git push -u origin main
```

### Step 2: Import into Vercel
1. Go to [Vercel](https://vercel.com) and log in.
2. Click **"Add New Project"** -> **"Import Git Repository"**.
3. Select your `nexus-rag-ai-assistant` repository.
4. Framework Preset will automatically detect **Next.js**.

### Step 3: Configure Environment Variables (Optional)
Under **Environment Variables**, you can optionally set:
- `GEMINI_API_KEY`: Your Google Gemini API Key ([get free from Google AI Studio](https://aistudio.google.com/))
- `GROQ_API_KEY`: Your Groq API Key ([get free from Groq Console](https://console.groq.com/))
- `OPENAI_API_KEY`: Your OpenAI API Key

*(Note: Users can also paste their API key directly into the application's top Settings UI in the browser, stored safely in `localStorage`!)*

### Step 4: Click Deploy!
Vercel will build and deploy your application in under 60 seconds with an instant `.vercel.app` live URL.

---

## 📋 Teacher Demonstration Checklist

When presenting this project to your teacher, test in this exact order:

1. **Test Real-Time Date/Time Tool**:
   - Type: *"What is today's date and current time right now?"*
   - 👉 **Teacher will observe**: The model does **NOT** give an old cutoff date. The yellow glowing `⚡ Tool Invoked: get_current_date_time()` card appears with the verified live system timestamp!
2. **Upload PDF / Document**:
   - Drag & drop any `.pdf` (or use `public/sample-research-paper.txt`).
   - 👉 **Teacher will observe**: Token estimation, chunking animation, and the sidebar showing **Total Chunks** and **Token Count**.
3. **Inspect Chunks**:
   - Click the **"Inspect Chunks & Line Mappings"** button.
   - 👉 **Teacher will observe**: A modal displaying each individual chunk with its exact line numbers (e.g., `Lines 14-38`), page numbers, and token counts.
4. **Ask Question from Document & View Hidden References**:
   - Ask: *"What is the formula for cosine similarity and what does it measure?"*
   - 👉 **Teacher will observe**: The answer cites the document cleanly. Below the message, click **"View Referenced Sources"** to smoothly unfold the exact cited lines, page number, and similarity match percentage!
5. **Ask Question Outside Document**:
   - Ask: *"What is quantum entanglement?"*
   - 👉 **Teacher will observe**: The system detects low document similarity and routes to general LLM intellect with the `🌐 Outside Document Knowledge` badge.
6. **Switch to Local / Emergency Mode**:
   - Open **LLM Settings**, switch to **Local Ollama** or **Offline Local Extractor**.
   - 👉 **Teacher will observe**: Complete offline resilience without cloud dependencies!
