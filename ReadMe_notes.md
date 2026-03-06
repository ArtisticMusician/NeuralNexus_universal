# Neural Nexus: Deep-Dive Technical Audit

## 1. Architecture: The Layered Intelligence Model
Neural Nexus operates as a decoupled orchestration system consisting of three primary layers:

### A. Adapter Layer (Interfaces)
- **Multi-Entrypoint Strategy**: Interaction occurs through REST (Fastify), MCP (Stdio), or direct Library usage (OpenClaw Plugin).
- **Communication**: Most adapters communicate with the central server via the REST API using `axios`, though the OpenClaw plugin instantiates `NeuralNexusCore` directly.

### B. Core Layer (Orchestration)
- **NeuralNexusCore**: The heart of the system. Manages the lifecycle of memories, coordinating between embedding generation, storage retrieval, and score post-processing.
- **Service-Oriented Design**:
  - `EmbeddingService`: Local vectorization using `@xenova/transformers`.
  - `DecayEngine`: Time-based score attenuation.
  - `ReplacementAuditService`: SQLite-backed logging of memory overwrites.
  - `AsyncLock`: Ensures thread-safety (atomic locking) for `store` and `reinforce` operations.

### C. Storage Layer (Persistence)
- **Qdrant**: Primary vector database. Uses **Cosine Distance** for similarity. 
- **Payload Indexing**: Specifically indexes `userId` (keyword) and `text` (text) to support Hybrid Search.
- **SQLite**: Local persistence for audit logs (`neural_nexus_replacements.sqlite`).

---

## 2. Core Algorithms & Formulas

### Semantic Deduplication
- **Threshold**: **0.95** (Cosine Similarity).
- **Logic**: During `store()`, if an existing memory for the user has a similarity score ≥ 0.95, the system **updates** the existing record instead of creating a new one. It increments the `strength` by **0.1** and logs the change in the Audit Service.

### Hybrid Search (Vector + BM25-lite)
- **Process**: 
  1. Executes a standard Qdrant vector search.
  2. Executes a Qdrant `scroll` with a text filter (mimicking keyword search).
  3. **Merges** results: Text-only matches are injected with a baseline score of **0.5**.
- **Constraint**: Results are deduplicated by ID and capped by the requested `limit`.

### Decay Engine Formula
The final score used for ranking in `recall()` is calculated as:
$$Score_{final} = (Score_{similarity} \times Strength) \times e^{-(\lambda \times \Delta T)}$$
- **$\lambda$ (Lambda)**: `0.0000001` (Decay constant per ms).
- **$\Delta T$**: Time elapsed since `last_accessed` in milliseconds.
- **Strength**: Multiplier (starts at 1.0, increases via `reinforce` or deduplication).

---

## 3. API Reference

### Headers
- `X-API-Key`: Required if `NEXUS_API_KEY` is set in the environment.
- `User-Id` or `X-User-Id`: Identifies the memory space.

### Endpoints
| Method | Endpoint | Description | Key Body Parameters |
| :--- | :--- | :--- | :--- |
| `POST` | `/recall` | Search memories | `query`, `limit`, `max_tokens`, `userId` |
| `POST` | `/store` | Save memory | `text`, `category`, `metadata`, `userId` |
| `POST` | `/reinforce`| Strengthen memory | `memory_id`, `strength_adjustment` (def: 0.05) |
| `GET` | `/audit` | Get replacement logs| `limit` (def: 50) |
| `GET` | `/admin/export`| Export memories | `userId` (Returns NDJSON) |
| `POST` | `/admin/import`| Import memories | NDJSON or JSON Array body |

---

## 4. Adapters & Integrations (8+ Total)

1.  **CLI (`nexus`)**: Command-line interface for `recall`, `store`, `export`, and `import`.
2.  **Telegram Bot**: Mobile agent supporting `/recall` and passive message storage.
3.  **OpenAI Proxy**: Intercepts `/v1/chat/completions`, injects memories into system prompts, and side-effects `store_memory` tool calls.
4.  **MCP Server**: Model Context Protocol implementation providing `recall_memory` and `store_memory` tools.
5.  **Browser Extension**: Context-menu "Save to Neural Nexus" and popup search.
6.  **n8n Workflow**: Integration via JSON workflow for automation (located in `integrations/n8n/`).
7.  **OpenClaw Plugin**: Native memory extension for OpenClaw with auto-capture logic.
8.  **LangChain Python Adapter**: Pythonic client + LangChain `@tool` definitions.
9.  **Web Dashboard**: React-based UI served directly by the server for memory management.

---

## 5. SDKs & Usage

### @neural-nexus/sdk (TypeScript)
```typescript
const client = new NeuralNexusClient({ baseUrl: "...", apiKey: "..." });
const results = await client.recall({ query: "What is my cat's name?" });
```

### Python LangChain Adapter
```python
client = NeuralNexusClient(api_key="...")
# LangChain Tool usage:
from langchain.agents import initialize_agent
tools = [recall_memory, store_memory]
```

---

## 6. Configuration (Environment Variables)

| Variable | Impact | Default |
| :--- | :--- | :--- |
| `EMBEDDING_MODEL` | Transformers.js model name | `Xenova/bge-small-en-v1.5` |
| `EMBEDDING_DEVICE`| Computation backend | `cpu` (or `cuda`) |
| `QDRANT_URL` | Vector DB location | `http://localhost:6333` |
| `QDRANT_COLLECTION`| Memory collection name | `openclaw_memories` |
| `NEXUS_API_KEY` | Security layer auth key | `undefined` (Disabled) |
| `LLM_TARGET_URL` | Forwarding target for Proxy | `https://api.openai.com/v1` |

---

## 7. Advanced Features

- **Atomic Locking**: Uses `async-lock` to prevent race conditions during memory reinforcement and deduplication, locking by `userId` or `memoryId`.
- **Token Budgeting**: Integration with `@xenova/transformers` tokenizer allows `recall` to return only as many memories as fit within a `maxTokens` budget.
- **NDJSON Portability**: Admin export/import uses Newline Delimited JSON for high-performance streaming of large memory sets.
- **Auto-Capture**: In OpenClaw mode, the system can automatically consolidate conversation turns into a single "fact" memory using a configurable turn threshold.

---

## 8. Dev Workflow

- **Build**: `npm run build` (Compiles TypeScript to `dist/`).
- **Testing**: `npm test` (Uses **Vitest** for unit and integration testing of core services).
- **Deployment**: `docker-compose up` (Orchestrates Qdrant, Neural Nexus, and n8n). 
- **Local Dev**: `npm run dev` for TS watch and `npm run server:dev` for server watch with env-file support.
