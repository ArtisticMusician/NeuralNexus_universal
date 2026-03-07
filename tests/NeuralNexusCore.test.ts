import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/core/ReplacementAuditService.js', () => {
  const MockAudit = vi.fn();
  MockAudit.prototype.initialize = vi.fn().mockResolvedValue(undefined);
  MockAudit.prototype.logReplacement = vi.fn().mockResolvedValue(undefined);
  MockAudit.prototype.close = vi.fn().mockResolvedValue(undefined);
  return { ReplacementAuditService: MockAudit };
});

vi.mock('../src/core/EmbeddingService.js', () => {
  const MockEmbedding = vi.fn();
  MockEmbedding.prototype.initialize = vi.fn();
  MockEmbedding.prototype.getDim = vi.fn().mockReturnValue(128);
  MockEmbedding.prototype.createVector = vi.fn().mockResolvedValue(new Array(128).fill(0.1));
  MockEmbedding.prototype.countTokens = vi.fn().mockResolvedValue(10);
  return { EmbeddingService: MockEmbedding };
});

vi.mock('../src/core/StorageService.js', () => {
  const MockStorage = vi.fn();
  MockStorage.prototype.initialize = vi.fn();
  MockStorage.prototype.find = vi.fn().mockResolvedValue([]);
  MockStorage.prototype.store = vi.fn();
  MockStorage.prototype.updatePayload = vi.fn();
  MockStorage.prototype.getPoint = vi.fn();
  return { StorageService: MockStorage };
});

import { NeuralNexusCore } from '../src/core/NeuralNexusCore.js';
import { normalizeMemoryConfig } from '../src/core/config.js';

describe('NeuralNexusCore', () => {
  let core: NeuralNexusCore;
  const config = normalizeMemoryConfig({});

  beforeEach(() => {
    vi.clearAllMocks();
    core = new NeuralNexusCore(config);
  });

  it('detects categories correctly with improved logic', () => {
    expect(core.detectCategory('I love coding')).toBe('preference');
    expect(core.detectCategory('I decided to quit')).toBe('decision');
    expect(core.detectCategory('He is a doctor')).toBe('entity');
    expect(core.detectCategory('The sky is blue')).toBe('fact');
  });

  it('recall applies strict userId filtering', async () => {
    const storage = (core as any).storage;
    await core.recall({ query: 'test', userId: 'user1' });
    expect(storage.find).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Number),
      'user1',
      'test',
      expect.any(Number)
    );
  });
});
