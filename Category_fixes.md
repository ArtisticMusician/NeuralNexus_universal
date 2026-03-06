# Neural Nexus plugin changes: category-based decay + stable, overwritable preferences

Goal
----
Update the Neural Nexus memory plugin to support:

1. Category-based decay (different stability per memory category).
2. Preference memories that:
   - Do not decay.
   - Do not require reinforcement.
   - Are overwritten when the user changes their preference (semantic overwrite).

Files involved:
- config.js (no change required for this pass)
- DecayEngine.js
- EmbeddingService.js (no change)
- NeuralNexus.js (category detection already exists)
- StorageService.js
- index.js


1. Category model and parameters
-------------------------------

Use the existing categories:
- preference
- fact
- decision
- entity
- other

Add a category parameter table (in index.js or a new module):

// index.js (top-level)
export const CATEGORY_PARAMS = {
  preference: { lambda: 0, reinforce: false },
  fact:       { lambda: 1e-10, reinforce: true },
  entity:     { lambda: 5e-11, reinforce: true },
  decision:   { lambda: 2e-10, reinforce: true },
  other:      { lambda: 5e-10, reinforce: false },
};

// Notes:
// - lambda: 0 means no decay (used for preference).
// - Other categories use exponential decay with different rates.
// - reinforce controls whether we adjust strength/lambda on access.


2. DecayEngine.js: per-memory λ and strength, no-decay for preferences
----------------------------------------------------------------------

Replace the contents of DecayEngine.js with:

export class DecayEngine {
    /**
     * Applies exponential decay with category-specific lambda and strength.
     * If lambda === 0, no decay is applied (used for preferences).
     */
    calculateScore(originalScore, lastAccessed, lambda, strength = 1) {
        if (lambda === 0) {
            return originalScore * strength;
        }
        const now = Date.now();
        const deltaT = now - lastAccessed;
        return (originalScore * strength) * Math.exp(-lambda * deltaT);
    }
}


3. StorageService.js: generic payload updates
---------------------------------------------

Update StorageService.js to support generic payload updates.

Replace its contents with:

import { QdrantClient } from "@qdrant/js-client-rest";

export class StorageService {
    url;
    collection;
    client;

    constructor(url, collection, apiKey) {
        this.url = url;
        this.collection = collection;
        this.client = new QdrantClient({ url, apiKey });
    }

    async initialize(vectorSize) {
        const collections = await this.client.getCollections();
        if (!collections.collections.some(c => c.name === this.collection)) {
            await this.client.createCollection(this.collection, {
                vectors: { size: vectorSize, distance: "Cosine" },
            });
        }
    }

    async store(id, vector, payload) {
        await this.client.upsert(this.collection, { points: [{ id, vector, payload }] });
    }

    async find(vector, limit) {
        return await this.client.search(this.collection, {
            vector,
            limit,
            with_payload: true
        });
    }

    async updatePayload(id, partialPayload) {
        await this.client.setPayload(this.collection, {
            payload: partialPayload,
            points: [id]
        });
    }

    async updateAccessTime(id) {
        await this.updatePayload(id, { last_accessed: Date.now() });
    }
}


4. index.js: category-aware store, decay, reinforcement, preference overwrite
-----------------------------------------------------------------------------

4.1 Imports and category params (top of file):

import crypto from "node:crypto";
import { Type } from "@sinclair/typebox";
import { normalizeMemoryConfig } from "./config.js";
import { EmbeddingService } from "./EmbeddingService.js";
import { StorageService } from "./StorageService.js";
import { NeuralNexus } from "./NeuralNexus.js";
import { DecayEngine } from "./DecayEngine.js";

const CATEGORY_PARAMS = {
    preference: { lambda: 0, reinforce: false },
    fact:       { lambda: 1e-10, reinforce: true },
    entity:     { lambda: 5e-11, reinforce: true },
    decision:   { lambda: 2e-10, reinforce: true },
    other:      { lambda: 5e-10, reinforce: false },
};


4.2 recallWithDecay: use per-memory λ and strength

Replace the existing recallWithDecay with:

const recallWithDecay = async (query, limit, threshold) => {
    if (!(await ensureInitialized())) {
        return [];
    }
    const vector = await embeddings.createVector(query);
    const hits = await storage.find(vector, limit * 2);

    return hits
        .map((hit) => {
            const payload = hit.payload ?? {};
            const lambda = typeof payload.lambda === "number"
                ? payload.lambda
                : CATEGORY_PARAMS[payload.category]?.lambda ?? 1e-10;
            const strength = typeof payload.strength === "number"
                ? payload.strength
                : 1;
            const lastAccessed = typeof payload.last_accessed === "number"
                ? payload.last_accessed
                : Date.now();

            return {
                ...hit,
                adjustedScore: decay.calculateScore(
                    hit.score,
                    lastAccessed,
                    lambda,
                    strength
                ),
            };
        })
        .filter((hit) => hit.adjustedScore >= threshold)
        .sort((a, b) => b.adjustedScore - a.adjustedScore)
        .slice(0, limit);
};


4.3 Auto-capture: category-aware store + preference overwrite

Replace the entire if (cfg.autoCapture) { ... } block with:

if (cfg.autoCapture) {
    api.on("agent_end", async (event) => {
        if (!event.success || !Array.isArray(event.messages)) {
            return;
        }
        if (!(await ensureInitialized())) {
            return;
        }

        try {
            const content = cfg.consolidation
                ? neuralNexus.consolidate(event.messages, cfg.consolidationThreshold ?? 4)
                : neuralNexus.extractCandidate(event.messages);

            if (!content) {
                return;
            }

            const category = neuralNexus.detectCategory(content);
            const params = CATEGORY_PARAMS[category] ?? CATEGORY_PARAMS.other;

            const vector = await embeddings.createVector(content);

            // Preference: overwrite semantics
            if (category === "preference") {
                const existing = await recallWithDecay(content, 3, 0.92);
                const existingPref = existing.find(
                    (m) => m.payload?.category === "preference"
                );

                if (existingPref) {
                    await storage.store(String(existingPref.id), vector, {
                        ...existingPref.payload,
                        text: content,
                        category,
                        lambda: 0,
                        strength: 1,
                        last_accessed: Date.now(),
                    });
                    return;
                }

                // No existing preference: store new
                await storage.store(crypto.randomUUID(), vector, {
                    text: content,
                    category,
                    lambda: 0,
                    strength: 1,
                    last_accessed: Date.now(),
                });
                return;
            }

            // Non-preference: avoid near-duplicates
            const existing = await recallWithDecay(content, 1, 0.92);
            if (existing.length > 0) {
                return;
            }

            await storage.store(crypto.randomUUID(), vector, {
                text: content,
                category,
                lambda: params.lambda,
                strength: 1,
                last_accessed: Date.now(),
            });
        } catch (err) {
            api.logger.warn(`[Neural Nexus] Auto-capture failed: ${String(err)}`);
        }
    });
}


4.4 Reinforcement on recall (non-preferences only)

Inside the memory_recall tool registration, replace:

const results = await recallWithDecay(query, limit, 0.3);
for (const result of results) {
    await storage.updateAccessTime(String(result.id));
}
const payload = results.map((result) => ({
    text: typeof result.payload?.text === "string" ? result.payload.text : "",
    score: result.adjustedScore,
}));

with:

const results = await recallWithDecay(query, limit, 0.3);

for (const result of results) {
    const payload = result.payload ?? {};
    const category = payload.category ?? "other";
    const params = CATEGORY_PARAMS[category] ?? CATEGORY_PARAMS.other;

    const updates = { last_accessed: Date.now() };

    if (params.reinforce) {
        const currentStrength = typeof payload.strength === "number"
            ? payload.strength
            : 1;
        updates.strength = currentStrength + 0.05;

        if (typeof payload.lambda === "number") {
            updates.lambda = payload.lambda * 0.98;
        }
    }

    await storage.updatePayload(String(result.id), updates);
}

const payload = results.map((result) => ({
    text: typeof result.payload?.text === "string" ? result.payload.text : "",
    score: result.adjustedScore,
}));


5. Behavioral summary
---------------------

Preferences:
- Stored with category = "preference", lambda = 0, strength = 1.
- Do not decay.
- Do not get reinforced.
- On new preference:
  - If a similar preference exists (high similarity, same category), it is overwritten (same id, new text/vector).
  - Otherwise, a new preference is stored.

Other categories:
- Use category-specific lambda for decay.
- Can be reinforced on recall (strength increases, lambda optionally decreases slightly).
- Still use exponential decay via DecayEngine.

This is the complete set of changes needed to implement category-based decay and stable, overwritable preferences in the Neural Nexus plugin.


