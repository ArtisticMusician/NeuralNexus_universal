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
