<div align="center">
  <img src="images/NeuralNexus_logo.svg" alt="Neural Nexus Logo" width="300" />
</div>

# 🧠 Neural Nexus: Universal AI Memory Protocol (NNMP)

**Neural Nexus** is a professional-grade, framework-agnostic long-term memory system. It provides a centralized "brain" for AI agents, decoupling memory from specific LLMs or frameworks and making it accessible via a unified architecture.

---

## 🚀 Core Architecture & High-Performance Logic

Neural Nexus is built on a **Singleton Orchestration** pattern. All adapters (MCP, Proxy, Telegram) share a direct instance of the memory core, eliminating redundant network latency.

### 1. Robust Hybrid Search (RRF)
Nexus uses **Reciprocal Rank Fusion (RRF)** to merge results from multiple search methods:
- **Vector Search**: Semantic similarity using `BGE-Small`.
- **Keyword Search**: Precise full-text matching via BM25.
- **Why RRF?**: It provides a mathematically sound way to combine different scoring systems, ensuring high-fidelity retrieval without arbitrary weight constants.

### 2. The Decay Engine (Stable Long-Term Memory)
Memories are designed to last. With a default $\lambda = 1e^{-10}$, the engine provides:
- **Temporal Relevance**: High stability over weeks/months.
- **Manual Reinforcement**: Explicitly strengthen memories to prevent them from ever fading.

### 3. Streaming Interception
The OpenAI Proxy features a custom **Transform Stream** that buffers and parses SSE (Server-Sent Events). It intercepts `store_memory` tool calls in real-time without blocking the user's streaming response.

### 4. Privacy & Multi-Tenancy
- **Strict Partitioning**: Every database query is hard-filtered by `userId`.
- **Atomic Safety**: Locks per user/memory ensure data integrity during high-concurrency operations.

---

## 🔌 Unified Ecosystem

| Adapter | Integration Method | Role |
|---------|--------------------|------|
| **OpenAI Proxy** | Shared Singleton | Real-time memory injection & streaming capture. |
| **MCP Server** | Shared Singleton | Native Claude Desktop & IDE tool support. |
| **Telegram Bot** | Shared Singleton | Mobile memory capture & recall. |
| **CLI Manager** | API Client | Terminal-based administration. |
| **TypeScript SDK** | API Client | Official `@neural-nexus/sdk` for custom apps. |

---

## 📖 Usage Guides

### 1. The OpenAI Proxy Method (Universal Integration)
Use this to give *any* OpenAI-compatible app (Chatbox, SillyTavern, or custom scripts) long-term memory.

1.  **Start the Proxy**:
    ```bash
    npm run proxy:start
    ```
2.  **Configure your AI App**:
    *   **Base URL**: `http://localhost:3001/v1`
    *   **API Key**: (Any value, or your `LLM_API_KEY`)
3.  **Chat**: The proxy will automatically search your Nexus for relevant context and inject it into the prompt. It also intercepts "store_memory" tool calls to save new facts.

### 2. The MCP Method (Claude & IDE Integration)
Use this for native tool support in Claude Desktop or AI-powered editors like Cursor.

1.  **Build the Project**:
    ```bash
    npm run build
    ```
2.  **Add to Config**:
    Add the following to your `claude_desktop_config.json`:
    ```json
    {
      "mjs-servers": {
        "neural-nexus": {
          "command": "node",
          "args": ["/absolute/path/to/dist/src/mcp.js"]
        }
      }
    }
    ```
3.  **Proactive Memory**: Claude will now see `recall_memory` and `store_memory` as native tools.

---

## 📚 Documentation Hub

For a deep dive into the protocol, architecture, and advanced configuration, see the [docs/](./docs) folder:

- **[Protocol Spec](./docs/protocol.md)**: NNMP v1.1 rules and standards.
- **[Feature List](./docs/features.md)**: Detailed breakdown of memory logic.
- **[API Reference](./docs/api.md)**: Endpoint definitions and examples.
- **[Technical Audit](./docs/technical_audit.md)**: Architecture and singleton design.
- **[Roadmap](./docs/roadmap.md)**: Development phases and status.
- **[Research](./docs/research.md)**: Potential future features and exploration.

---

## ⚙️ Configuration (Environment Overrides)

Neural Nexus is highly tunable via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `SIMILARITY_THRESHOLD` | `0.95` | Threshold for semantic deduplication (merging). |
| `RECALL_THRESHOLD` | `0.1` | Minimum score required for a memory to be recalled. |
| `DECAY_LAMBDA` | `1e-10` | The speed at which memories lose relevance over time. |
| `RRF_K` | `60` | The Reciprocal Rank Fusion constant for result merging. |

---

## ⚖️ License
**Neural Nexus Universal License (Personal & Non-Commercial)**
Free for personal, educational, and internal use. Commercial use or redistribution as a service requires written consent. See `LICENSE.md` for details.
