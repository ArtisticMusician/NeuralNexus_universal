# Universal Neural Nexus: Roadmap

## Phase 1: Core Decoupling [DONE]
- Extract `DecayEngine`, `EmbeddingService`, `StorageService`, and `ReplacementAuditService` into `/src/core`.
- Eliminate all framework-specific imports (OpenClaw/Electron).
- Define `NeuralNexusCore` as the primary interface for all operations.
- Establish DTOs for `MemoryEntry`, `RecallRequest`, and `RecallResponse`.

## Phase 2: API Gateway Construction [DONE]
- Implement Fastify (TS) wrapper.
- Expose standardized endpoints: `POST /recall`, `POST /store`, `POST /reinforce`.
- Implement multi-tenancy via `user_id` headers to partition Qdrant collections.

## Phase 3: Adapter & Integration Layer [DONE]
- Create standard JSON Schema (OpenAI-compatible) for tool calling.
- Develop platform-specific adapters (CLI, Telegram, Browser Extension, n8n).
- Package as a Dockerized solution for self-hosting.

## Phase 4: Reliability & Feature Parity [DONE]
- Add hybrid search (Vector + BM25) for precision.
- Implement token-budgeting on `/recall` responses.
- Expose SQLite audit logs for memory transparency.

## Phase 5: Protocol & SDK Development [DONE]
- Implement Official TypeScript SDK (`packages/nexus-js`).
- Implement Official Python SDK (`adapters/langchain_nexus.py`).
- Implement Security Layer (API Keys).
- Implement Data Portability (Export/Import).
- Enforce strict Separation of Concerns across layers.
