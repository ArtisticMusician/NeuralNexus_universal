<div align="center">
  <img src="images/NeuralNexus_logo.svg" alt="Neural Nexus Logo" width="300" />
</div>

# 🧠 Neural Nexus: Universal AI Memory Protocol (NNMP)

**Neural Nexus** is a professional-grade, framework-agnostic long-term memory system. It provides a centralized "brain" for AI agents, decoupling memory from specific LLMs or frameworks (OpenClaw, LangChain, etc.) and making it accessible via a standardized API, CLI, Browser, Mobile, and SDKs.

---

## 🚀 Core Architecture & Logic

Neural Nexus operates on a multi-layered architecture: **Adapters → API Gateway → NeuralNexusCore → Specialized Services**.

### 1. Hybrid Search (Vector + Keyword)
Nexus combines semantic understanding with keyword precision:
- **Vector Search**: Cosine similarity using `Xenova/bge-small-en-v1.5` embeddings.
- **BM25 Keyword Search**: Full-text indexing via Qdrant for precise retrieval of names, technical terms, and IDs.
- **Merging**: Results are merged, ensuring the most relevant context is returned.

### 2. Semantic Deduplication (The "No Bloat" Rule)
When storing information, Nexus prevents "fact bloat" by checking similarity:
- If a new memory is **>= 0.95 similar** to an existing one, the old memory is **updated** (merged) rather than duplicated.
- The system automatically strengthens the existing memory and logs the change to the **Audit Trail**.

### 3. The Decay Engine (Temporal Relevance)
Memories are not static. The engine calculates a `decayed_score` for every retrieval:
- **Formula**: `score * (1 / (1 + lambda * (now - last_accessed))) * strength`.
- **Lambda**: Configurable per category (e.g., facts decay slower than preferences).
- **Strength**: Manual reinforcement multiplier (default +0.05).

### 4. Atomic Integrity & Safety
- **Atomic Locking**: Uses `async-lock` to prevent race conditions during `store` and `reinforce` operations (locked per `userId` and `memoryId`).
- **Token Budgeting**: Built-in `@xenova/transformers` AutoTokenizer ensures `/recall` responses never exceed your LLM's context window.

---

## 🔌 The Ecosystem (Adapters)

| Adapter | Technical Implementation | Features |
|---------|-------------------------|----------|
| **OpenAI Proxy** | `src/openai-proxy.ts` | Injects context into `/v1/chat/completions`, intercepts `store_memory` tool calls. |
| **MCP Server** | `src/mcp.ts` | Native Model Context Protocol support for Claude Desktop. |
| **CLI Manager** | `src/cli.ts` | Commander-based CLI (`nexus`) for recall, store, export, and import. |
| **Telegram Bot** | `src/telegram-bot.ts` | Telegraf-based mobile agent for memory capture and retrieval. |
| **Browser Ext** | `browser-extension/` | Manifest V3 extension with "Read-to-Remember" context menu. |
| **Web Dashboard** | `dashboard/` | Vite + React UI for visual memory browsing and manual entry. |
| **n8n Workflow** | `integrations/n8n/` | Pre-built workflow template for low-code automation. |

---

## 🛠️ API Reference

**Auth**: All endpoints require `X-API-Key` (if configured) and optionally `User-Id` (for multi-tenancy).

### `POST /recall`
Search long-term memory.
- **Body**: `{ query: string, limit?: number, userId?: string, maxTokens?: number }`
- **Result**: Returns a list of `MemoryEntry` objects sorted by `decayed_score`.

### `POST /store`
Add or update memory.
- **Body**: `{ text: string, category?: string, userId?: string, metadata?: object }`
- **Categories**: `preference`, `fact`, `decision`, `entity`, `other`.

### `POST /reinforce`
Strengthen a memory.
- **Body**: `{ memoryId: string, strengthAdjustment?: number }`

### `GET /audit`
Retrieve the replacement audit log (SQLite-backed).

### `GET /admin/export` | `POST /admin/import`
Export/Import memories in **NDJSON** (Line-delimited JSON) format for full data portability.

---

## 📦 SDKs

### TypeScript (@neural-nexus/sdk)
```typescript
import { NeuralNexusClient } from '@neural-nexus/sdk';
const nexus = new NeuralNexusClient({ baseUrl: '...', apiKey: '...' });
await nexus.store({ text: "User prefers Python", category: "preference" });
```

### Python (LangChain Adapter)
```python
from adapters.langchain_nexus import NeuralNexusClient, store_memory
client = NeuralNexusClient(api_key="...")
# Integrated as a LangChain Tool or standalone client.
```

---

## ⚙️ Configuration (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Main API server port. |
| `OPENAI_PROXY_PORT` | `3001` | OpenAI-Compatible proxy port. |
| `NEXUS_API_KEY` | - | Master API key for security. |
| `QDRANT_URL` | `http://localhost:6333` | Vector database endpoint. |
| `EMBEDDING_MODEL` | `Xenova/bge-small-en-v1.5` | Transformers.js model for embeddings. |
| `REPLACEMENT_LOG_PATH` | `./data/replacements.sqlite` | SQLite audit trail path. |

---

## ⚖️ License
**Neural Nexus Universal License (Personal & Non-Commercial)**
Free for personal, educational, and internal use. Commercial use, monetization, or selling as a service is strictly prohibited without written consent. See `LICENSE.md` for details.
