<div align="center">
  <img src="images/NeuralNexus_logo.svg" alt="Neural Nexus Logo" width="300" />
</div>

# 🧠 Neural Nexus: Universal AI Memory Protocol (NNMP)

**Neural Nexus** is a framework-agnostic, long-term memory system designed to give AI agents a persistent "brain" that persists across different LLMs, platforms, and sessions. 

It decouples memory from specific implementations (like OpenClaw or LangChain), providing a centralized, secure, and searchable knowledge base accessible via **API, CLI, Browser, Mobile, and SDKs.**

---

## 🚀 Core Capabilities

### 1. Hybrid Semantic Search
Neural Nexus doesn't just "match" keywords. It combines:
- **Vector Search (Cosine Similarity)**: Understands the *meaning* of your query using `BGE-Small` embeddings.
- **Full-Text Search (BM25)**: Ensures precise retrieval for specific names, technical terms, or IDs.

### 2. The Decay Engine (Temporal Relevance)
Memories are not static. The engine calculates a `decayed_score` for every retrieval based on:
- **Base Similarity**: How well the memory matches the query.
- **Access Frequency**: Memories used often stay "fresh."
- **Recency**: Older, untouched memories naturally fade to keep context relevant.
- **Strength**: Manually "reinforce" important memories to prevent them from decaying.

### 3. Atomic Integrity & Deduplication
- **Async Locking**: Prevents race conditions during simultaneous memory operations.
- **Semantic Deduplication**: Automatically merges new information with existing similar memories (>=0.95 similarity) to prevent "fact bloat" and keep the brain clean.

### 4. Enterprise-Ready Architecture
- **Multi-Tenancy**: Every operation is partitioned by `userId`. Securely serve thousands of users from one instance.
- **Token Budgeting**: Built-in counting ensures `/recall` never returns more memories than your LLM's context window can handle.
- **Audit Logging**: A transparent SQLite-backed trail of every memory update, replacement, and merge.

---

## 🔌 The Ecosystem (Adapters)

Neural Nexus is everywhere you are:

| Adapter | Description | Use Case |
|---------|-------------|----------|
| **TypeScript SDK** | Official `@neural-nexus/sdk` | Custom Node.js/Web apps |
| **Python SDK** | Standalone client + LangChain Tools | AI Research & Python Agents |
| **OpenAI Proxy** | Injects memory into any OpenAI-compatible app | Use with Ollama, LM Studio, etc. |
| **MCP Server** | Native Model Context Protocol support | Claude Desktop / IDE Integration |
| **CLI Manager** | The `nexus` command-line tool | Terminal-based memory management |
| **Mobile Agent** | Telegraf-based Telegram Bot | Store/Recall memories via phone |
| **Browser Ext** | Chrome Manifest V3 Extension | "Read-to-Remember" web content |
| **Web Dashboard** | Vite + React UI | Visual browsing & manual editing |
| **n8n Workflow** | Low-code automation node | Connect memory to 400+ apps |

---

## 🛠️ Quick Start

### 1. Prerequisites
- **Node.js**: v20+
- **Qdrant**: `docker run -p 6333:6333 qdrant/qdrant` (The vector database)

### 2. Installation
```bash
git clone https://github.com/your-repo/neural-nexus
cd neural-nexus
npm install
npm run build
```

### 3. Configuration
Copy `.env.example` to `.env` and set your master key:
```env
PORT=3000
NEXUS_API_KEY=your_secret_key
QDRANT_URL=http://localhost:6333
LLM_TARGET_URL=http://localhost:11434/v1 # e.g. Ollama
```

### 4. Running the Stack
- **Full Server**: `npm run server:dev`
- **Proxy**: `npm run proxy:start`
- **Telegram Bot**: `npm run telegram:start`

---

## 📦 SDK Integration

### TypeScript
```typescript
import { NeuralNexusClient } from '@neural-nexus/sdk';

const nexus = new NeuralNexusClient({
  baseUrl: 'http://localhost:3000',
  apiKey: 'your_secret_key',
  userId: 'user_123'
});

// Store a memory
await nexus.store({ text: "I prefer working in the mornings", category: "preference" });

// Recall with token budgeting
const { memories } = await nexus.recall({ 
  query: "What is the user's schedule?", 
  maxTokens: 500 
});
```

### Python (LangChain)
```python
from adapters.langchain_nexus import NeuralNexusClient, recall_memory

client = NeuralNexusClient(api_key="your_secret")
memories = client.recall("user preferences")

# Or use as a LangChain Tool
agent = initialize_agent([recall_memory, store_memory], llm)
```

---

## 🔒 Security & Data Sovereignty

- **Authentication**: All endpoints are secured via `X-API-Key`.
- **Local First**: Your embeddings and vectors stay on *your* hardware.
- **No Lock-in**: Export your entire brain to **NDJSON** at any time.
```bash
nexus export my_backup.jsonl
nexus import backup_from_other_instance.jsonl
```

---

## 🗺️ Roadmap Status
- [x] Phase 1: Core Decoupling & Modularity
- [x] Phase 2: API Gateway & Multi-Tenancy
- [x] Phase 3: Universal Adapters (8+ platforms)
- [x] Phase 4: Hybrid Search & Token Budgeting
- [x] Phase 5: Official SDKs & API Security

---

## ⚖️ License
**Neural Nexus Universal License (Personal & Non-Commercial)**
Free for personal, educational, and internal use. Commercial use or redistribution as a service requires written consent. See `LICENSE.md` for details.
