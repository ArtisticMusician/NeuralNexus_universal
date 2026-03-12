import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NeuralNexusCore } from '../src/core/NeuralNexusCore.js';
import { normalizeMemoryConfig } from '../src/core/config.js';
import { execSync } from 'child_process';

describe('Actual Multi-Container Integration Test', () => {
    let core: NeuralNexusCore;

    beforeAll(async () => {
        // Spin up actual qdrant container
        console.log("Cleaning up and connecting to local Qdrant instance...");

        const testCollection = 'actual_integration_test_collection';

        const config = normalizeMemoryConfig({
            qdrant: { url: 'http://localhost:6333', collection: testCollection },
            thresholds: { recall: 0.01, similarity: 0.92 },
            search: { limit: 5, rrfK: 60 }
        });

        core = new NeuralNexusCore(config);
        // Force cleanup of potential stale data from previous failed runs
        try {
            const storage = (core as any).storage;
            await storage.client.deleteCollection(testCollection);
        } catch (e) {
            // Ignore if collection doesn't exist
        }
        await core.initialize();
    }, 120000); // Higher timeout for image pulls if needed

    afterAll(() => {
        console.log("Integration test complete.");
    });

    it('performs end-to-end store and hybrid recall using actual vector embeddings and Qdrant DB', async () => {
        await core.store({ text: "The capital of actual France is indeed Paris.", category: "fact", userId: "test_user_1" });
        await core.store({ text: "My favorite color is a deep actual blue.", category: "preference", userId: "test_user_1" });

        // Let index settle briefly (Qdrant async indexing)
        await new Promise(res => setTimeout(res, 500));

        const res1 = await core.recall({ query: "What is the capital of actual France?", userId: "test_user_1" });
        expect(res1.memories.length).toBeGreaterThan(0);
        expect(res1.memories[0].text).toContain("Paris");

        const res2 = await core.recall({ query: "blue color", userId: "test_user_1" });
        expect(res2.memories.length).toBeGreaterThan(0);
        expect(res2.memories[0].text).toContain("deep actual blue");
    });

    it('performs semantic deduplication against actual database', async () => {
        await core.store({ text: "I actually love eating organic red apples.", category: "preference", userId: "test_user_2" });
        // Very similar text causing a merge
        await core.store({ text: "I actually love eating organic red apples.", category: "preference", userId: "test_user_2" });

        await new Promise(res => setTimeout(res, 500));

        // verify only 1 exists for user
        const res = await core.recall({ query: "organic red apples", limit: 10, userId: "test_user_2" });
        expect(res.memories.length).toBe(1);
        expect(res.memories[0].metadata.strength).toBeGreaterThan(1); // Has merged
    });
});
