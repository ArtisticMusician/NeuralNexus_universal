# 🧠 Neural Nexus: Universal AI Memory

Neural Nexus is a framework-agnostic, long-term memory system for AI agents. It decouples memory from specific LLMs or frameworks (like OpenClaw or LangChain), providing a centralized "brain" accessible via API, CLI, Browser, and Mobile.

## 🚀 Features

### Core Memory Engine
- **Hybrid Search**: Combines semantic vector search (Cosine) with keyword search (BM25) for precision.
- **Decay Engine**: Automatically adjusts memory relevance based on time and access frequency.
- **Token Budgeting**: Built-in counting ensures memories never exceed your LLM's context window.
- **Multi-Tenancy**: Secure partitioning of memories via `user_id` headers.
- **Audit Logs**: Transparent SQLite-backed logging of all memory replacements and updates.
- **Conflict Resolution**: Atomic locking and semantic deduplication to prevent data corruption.

### Universal Adapters
- **TypeScript SDK**: Integration-ready client for Node.js and Browser.
- **Web Dashboard**: Browse, search, and manually manage memories at `http://localhost:3000`.
- **OpenAI Proxy**: Use Nexus with *any* app (Ollama, LM Studio) by pointing to `http://localhost:3001`.
- **MCP Server**: Native integration for Claude Desktop and other MCP-compatible agents.
- **Browser Extension**: "Read-to-Remember" context menu and quick-recall popup.
- **Mobile Agent**: Telegram Bot for storing and recalling memories on the go.
- **CLI Manager**: Manage memories directly from your terminal with the `nexus` command.
- **n8n Automation**: Pre-built workflow template for low-code automation.

---

## 🛠️ Quick Start

### 1. Prerequisites
- **Node.js**: v20 or higher.
- **Qdrant**: A running Qdrant instance (`docker run -p 6333:6333 qdrant/qdrant`).

### 2. Installation
```bash
git clone <your-repo-url>
cd neural-nexus-universal
npm install
npm run build
```

### 3. Configuration
Copy `.env.example` to `.env` and fill in your values:
```env
# API Server
PORT=3000
NEXUS_API_KEY=your_secret_key_here
QDRANT_URL=http://localhost:6333

# Adapters
TELEGRAM_BOT_TOKEN=your_token_here
LLM_TARGET_URL=http://localhost:11434/v1
```

### 4. Running the Stack
- **API Server & Dashboard**: `npm run server:dev` (Port 3000)
- **OpenAI Proxy**: `npm run proxy:start` (Port 3001)
- **MCP Server**: `npm run mcp:start`
- **Telegram Bot**: `npm run telegram:start`

---

## 📖 Adapter Guides

### TypeScript SDK
Integrate Neural Nexus into your own applications:
```typescript
import { NeuralNexusClient } from '@neural-nexus/sdk';

const nexus = new NeuralNexusClient({
  baseUrl: 'http://localhost:3000',
  apiKey: 'your_secret_key'
});

await nexus.store({ text: "User prefers dark mode", category: "preference" });
const memories = await nexus.recall({ query: "What are the user's UI preferences?" });
```

### OpenAI-Compatible Proxy
Point your favorite AI app (Chatbox, SillyTavern, etc.) to:
- **Base URL**: `http://localhost:3001/v1`
- **Key**: (Any value if using local LLMs)
The proxy will automatically inject relevant memories into your system prompt.

### Browser Extension
1. Go to `chrome://extensions/`.
2. Enable "Developer Mode".
3. "Load unpacked" and select the `browser-extension` folder.

### CLI Manager
```bash
npm link
nexus store "My favorite color is blue" --category preference
nexus recall "What is my favorite color?"
nexus export backup.jsonl
```

---

## 🔧 Troubleshooting

### Qdrant Connection Issues
- **Error**: `Connection refused`.
- **Fix**: Ensure Qdrant is running and `QDRANT_URL` in `.env` matches your setup.

### "Sharp" or "Sqlite3" Native Errors
- **Error**: `Could not locate bindings file`.
- **Fix**: Run `npm install --ignore-scripts=false sharp sqlite3` to rebuild native modules for your OS.

---

## ⚖️ License
**Neural Nexus Universal License (Personal & Non-Commercial)**
Free for personal, educational, and internal use. Commercial use, monetization, or selling as a service is strictly prohibited without written consent. See `LICENSE.md` for full details.
