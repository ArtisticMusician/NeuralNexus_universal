# Neural Nexus: Future Development & Research Ideas

This document tracks high-level concepts and architectural upgrades for the Neural Nexus Universal Memory Protocol.

## 1. The "Trinity" System (Compound AI MoE)
Move from a simple storage engine to a coordinated system of specialized local experts.

### Expert A: The Scribe (Intelligent Ingestion)
- **Role**: Process raw user input into atomic, structured facts.
- **Local Constraint**: Must use a Small Language Model (SLM) like Phi-3 Mini or a specialized extraction model to minimize resource usage.
- **Logic**: Handles negation ("I don't like X"), conditional facts ("If Y happens, I prefer Z"), and entity extraction.

### Expert B: The Librarian (Semantic Indexing)
- **Role**: High-fidelity vector embeddings.
- **Current**: BGE-Small (Transformers.js).
- **Future**: Upgrade to BGE-M3 or similar for better multi-lingual and long-context support.

### Expert C: The Judge (Contextual Re-Ranking)
- **Role**: Precision verification.
- **Logic**: A Cross-Encoder model that evaluates the top-N results from the Librarian to ensure contextual relevance, filtering out "semantically close but logically wrong" matches.

## 2. Infrastructure & Scaling
- **Distributed Locking**: Replace `async-lock` with a Redis-based Redlock implementation for multi-node deployments.
- **Vector Caching**: Implement an LRU cache for frequently accessed embedding vectors to reduce CPU/GPU load.
- **Tuning API**: Expose endpoints to live-adjust `rrfK`, `decayLambda`, and `similarityThreshold` without server restarts.

## 3. Advanced Memory Logic
- **Contradiction Detection**: If a new memory is stored that contradicts an existing one, trigger an "Audit Alert" or an automated LLM resolution step.
- **Graph-Augmented Memory**: Link related memories (e.g., "User works at X" and "X is located in Y") to allow for multi-hop reasoning during recall.

## 4. Local-First Philosophy
- **Resource Profiling**: Ensure all experts can run on consumer-grade hardware (8GB-16GB RAM) simultaneously with a host LLM.
- **Quantization**: Prioritize support for GGUF/AWQ quantized versions of SLMs for the Scribe role.
