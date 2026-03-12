<div align="center">
  <p align="center">
    <img src="images/NeuralNexus_logo.svg" alt="Neural Nexus Logo" width="350" />
  </p>
  <p align="center">
    <strong>The professional-grade, framework-agnostic long-term memory protocol for AI agents.</strong>
  </p>
  <p align="center">
    <a href="#-core-features">Features</a> •
    <a href="#-quick-start">Quickstart</a> •
    <a href="docs/">Documentation</a> •
    <a href="#-the-ecosystem">Ecosystem</a> •
    <a href="#-architecture">Architecture</a>
  </p>
</div>

---

# 🧠 Neural Nexus: Universal AI Memory

**Neural Nexus** is a centralized "brain" for your AI agents. It provides a standardized, high-performance interface for storing, retrieving, and maintaining facts, preferences, and decisions over time. 

By decoupling memory from specific LLMs or frameworks (like LangChain or OpenClaw), Neural Nexus ensures your agents share a consistent, long-term context across every platform—API, CLI, Browser, and Mobile.

## ✨ Core Features

### 🔍 Hybrid RRF Retrieval
Nexus uses **Reciprocal Rank Fusion (RRF)** to merge semantic vector similarity with traditional keyword precision. This ensures that whether you're searching for a vague concept or a specific serial number, you get the right result every time.

### 📉 Temporal Decay Engine
Memories aren't static. Our decay engine calculates relevance based on recency and strength. Unreinforced memories naturally fade, while frequently accessed information stays at the forefront of your agent's context.

### 🛡️ Semantic Deduplication (Zero-Bloat)
Stop "fact bloat" before it starts. When storing new information, Nexus checks for existing matches. If a new memory is **>= 0.95 similar** to an existing one, the records are **merged and reinforced** rather than duplicated.

### 🔒 Privacy-First & Local-First
Uses `@xenova/transformers` for **local embedding generation**. Your sensitive data doesn't need to leave your infrastructure for vectorization.

### 🚀 One-Command Start
Get a production-ready memory environment running in seconds with our automated `quickstart` system.

---

## ⚡ Quick Start

### 1. Prerequisites
- **Node.js** (v18+)
- **Qdrant** (Optional, but recommended. The quickstart will handle this for you!)

### 2. Launch in 60 Seconds
Clone the repo and run the automation script:

**Linux / macOS:**
```bash
./quickstart.sh
```

**Windows:**
```batch
quickstart.bat
```

This will initialize your environment, check dependencies, and start the Core Server and OpenAI Proxy.

---

## 🔌 The Ecosystem

Neural Nexus isn't just a server; it's a complete memory ecosystem.

| Interface | Description |
| :--- | :--- |
| **OpenAI Proxy** | A transparent proxy that injects memories into chat contexts and intercepts tool calls in real-time streams. |
| **MCP Server** | Native **Model Context Protocol** support for immediate integration with Claude Desktop and other MCP clients. |
| **Mobile Bot** | A Telegraf-based **Telegram Bot** for capturing and recalling memories on the go. |
| **Browser Ext** | A Manifest V3 extension with "Read-to-Remember" context menu support. |
| **Web Dashboard** | A Vite + React dashboard for visual browsing and management of your agent's brain. |
| **CLI Manager** | A powerful CLI tool (`nexus`) for bulk operations, imports, and exports. |

---

## 📚 Documentation

Our [**Documentation Hub**](docs/) contains exhaustive guides for every aspect of the system:

- 🛠️ [**Setup Guide**](docs/setup.md): Detailed installation and environment configuration.
- 📡 [**API Reference**](docs/api.md): Full documentation of all REST endpoints.
- 🤖 [**Integrations**](docs/integrations.md): How to connect to OpenAI, Claude, LangChain, and more.
- 📜 [**NNMP Protocol**](docs/protocol.md): The formal specification of the Neural Nexus Memory Protocol.
- 🔍 [**Technical Audit**](docs/technical_audit.md): Deep dive into the search math and engine logic.

---

## 🏗️ Architecture

Neural Nexus follows a strict hub-and-spoke design centered around the `NeuralNexusCore`.

1. **Adapters**: The entry points (Proxy, MCP, Bot).
2. **NeuralNexusCore**: The orchestrator handling atomicity, deduplication, and budgeting.
3. **Specialized Services**:
   - **StorageService**: High-fidelity Qdrant wrapper.
   - **EmbeddingService**: Local Transformers.js model management.
   - **CategoryService**: Heuristic-based intent detection.
   - **DecayEngine**: Mathematical relevance scoring.

---

## ⚖️ License

**Neural Nexus Universal License (Personal & Non-Commercial)**
Free for personal use, education, and internal prototyping. Commercial use or redistribution as a service is prohibited without written consent. See `LICENSE.md` for full terms.
