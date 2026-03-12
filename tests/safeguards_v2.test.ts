import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService } from '../src/core/StorageService.js';
import { InMemoryStorageFake } from './fakes/InMemoryStorage.js';

describe('Safeguard Suite (Regression Prevention)', () => {
  let storage: StorageService;
  let fakeDb: InMemoryStorageFake;

  beforeEach(async () => {
    // We instantiate the REAL StorageService but inject a Fake Client
    storage = new StorageService('http://localhost:6333', 'test');
    fakeDb = new InMemoryStorageFake();
    (storage as any).client = fakeDb;
  });

  describe('RRF Score Scale Integrity', () => {
    it('verifies RRF scores fall within a range compatible with RECALL_THRESHOLD (0.01)', async () => {
      // Store 2 memories
      await fakeDb.store('1', new Array(384).fill(1), { text: 'Apple', userId: 'user1' });
      await fakeDb.store('2', new Array(384).fill(1), { text: 'Banana', userId: 'user1' });

      // Search
      const results = await storage.find(new Array(384).fill(1), 10, 'user1', 'Apple');
      
      const topScore = results[0].score;
      // RRF with rank 1 + rank 1 should be (1/61 + 1/61) = 0.0327...
      // This MUST be greater than our default threshold of 0.01
      expect(topScore).toBeGreaterThan(0.01);
      
      // Sanity check: it should be normalized (max 1.0)
      expect(topScore).toBeLessThanOrEqual(1.0);
    });
  });

  describe('Semantic Confidence Preservation', () => {
    it('preserves original cosine similarity in metadata even after RRF', async () => {
      await fakeDb.store('1', [1, 0], { text: 'Exact Match', userId: 'user1' });

      // Search with exact vector
      const results = await storage.find([1, 0], 1, 'user1');
      
      // The main score is RRF (~0.016), but original must be 1.0
      expect(results[0].payload._original_score).toBeCloseTo(1.0);
    });
  });
});
