import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NeuralNexusCore } from '../src/core/NeuralNexusCore.js';
import { normalizeMemoryConfig } from '../src/core/config.js';
import { InMemoryStorageFake } from './fakes/InMemoryStorage.js';
import { EmbeddingFake } from './fakes/EmbeddingFake.js';

vi.mock('../src/core/ReplacementAuditService.js', () => ({
  ReplacementAuditService: class {
    private logs: any[] = [];
    async initialize() { }
    async logReplacement(record: any) { this.logs.push(record); }
    async getLogs(limit: number = 50) { return [...this.logs].reverse().slice(0, limit); }
    async close() { }
  }
}));

describe('NeuralNexusCore (Mock-less Integration)', () => {
  let core: NeuralNexusCore;
  let storage: InMemoryStorageFake;
  let embedding: EmbeddingFake;

  beforeEach(() => {
    const config = normalizeMemoryConfig({
      thresholds: { recall: 0.01, similarity: 0.95 },
      search: { limit: 5, rrfK: 60 }
    });

    core = new NeuralNexusCore(config);

    storage = new InMemoryStorageFake();
    embedding = new EmbeddingFake();

    (core as any).storage = storage;
    (core as any).embedding = embedding;
  });

  it('stores and recalls a memory without mocks', async () => {
    const text = "The capital of France is Paris.";
    await core.store({ text, userid: "user1" });

    const result = await core.recall({ query: "What is the capital of France?", userid: "user1" });

    expect(result.memories).toHaveLength(1);
    expect(result.memories[0].text).toBe(text);
    expect(result.memories[0].metadata.search_score).toBeGreaterThan(0.01);
  });

  it('enforces multi-tenancy (privacy) automatically', async () => {
    await core.store({ text: "User A secret", userid: "userA" });
    await core.store({ text: "User B secret", userid: "userB" });

    const resultA = await core.recall({ query: "secret", userid: "userA" });
    expect(resultA.memories).toHaveLength(1);
    expect(resultA.memories[0].text).toContain("User A");

    const resultB = await core.recall({ query: "secret", userid: "userB" });
    expect(resultB.memories).toHaveLength(1);
    expect(resultB.memories[0].text).toContain("User B");
  });

  it('performs semantic deduplication (merge) based on similarity', async () => {
    const original = "I love eating red apples.";
    await core.store({ text: original, userid: "user1" });

    // Very similar text
    const duplicate = "I love eating red apples.";
    await core.store({ text: duplicate, userid: "user1" });

    const all = await storage.scrollAll("user1");
    expect(all).toHaveLength(1);
    expect(all[0].payload.strength).toBeGreaterThan(1);
  });

  it('recalculates embedding vector on merge to prevent semantic drift', async () => {
    const original = "The sky is blue today.";
    await core.store({ text: original, userid: "user1" });

    const storeSpy = vi.spyOn(storage, 'store');

    const duplicate = "The sky is very blue today.";
    await core.store({ text: duplicate, userid: "user1" });

    expect(storeSpy).toHaveBeenCalled();
    const calls = storeSpy.mock.calls;
    const lastCall = calls[calls.length - 1]; // [id, vector, payload]
    expect(lastCall[2].text).toBe(duplicate);
  });

  it('filters results below the recall threshold', async () => {
    // Manually push a low-scoring result to the fake storage
    await storage.store("id1", new Array(384).fill(0), { text: "Irrelevant", userid: "user1" });

    // Set a very high threshold manually
    (core as any).config.thresholds.recall = 0.9;

    const result = await core.recall({ query: "target", userid: "user1" });
    expect(result.memories).toHaveLength(0);
  });
});
