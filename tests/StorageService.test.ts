import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorageService } from '../src/core/StorageService.js';

describe('StorageService', () => {
  let storageService: StorageService;
  let client: any;

  beforeEach(() => {
    vi.clearAllMocks();
    storageService = new StorageService('http://localhost:6333', 'test_collection', 'test_key');
    client = {
      getCollections: vi.fn(),
      createCollection: vi.fn(),
      upsert: vi.fn(),
      search: vi.fn(),
      setPayload: vi.fn(),
      createPayloadIndex: vi.fn(),
    };
    (storageService as any).client = client;
  });

  it('creates collection if it does not exist during initialization', async () => {
    client.getCollections.mockResolvedValue({ collections: [] });
    
    await storageService.initialize(128);

    expect(client.createCollection).toHaveBeenCalledWith('test_collection', {
      vectors: { size: 128, distance: 'Cosine' },
    });
  });

  it('does not create collection if it already exists during initialization', async () => {
    client.getCollections.mockResolvedValue({
      collections: [{ name: 'test_collection' }],
    });

    await storageService.initialize(128);

    expect(client.createCollection).not.toHaveBeenCalled();
  });

  it('upserts a point to storage', async () => {
    const id = 'test-id';
    const vector = [0.1, 0.2];
    const payload = { text: 'test' };

    await storageService.store(id, vector, payload);

    expect(client.upsert).toHaveBeenCalledWith('test_collection', {
      points: [{ id, vector, payload }],
    });
  });

  it('searches for points', async () => {
    const vector = [0.1, 0.2];
    const limit = 5;
    client.search.mockResolvedValue([{ id: 1, score: 0.9 }]);

    const results = await storageService.find(vector, limit);

    expect(client.search).toHaveBeenCalledWith('test_collection', {
      vector,
      limit,
      with_payload: true,
    });
    expect(results).toEqual([{ id: 1, score: 0.9 }]);
  });

  it('searches with userId filter', async () => {
    const vector = [0.1, 0.2];
    const limit = 5;
    const userId = 'user-123';
    client.search.mockResolvedValue([{ id: 1, score: 0.9 }]);

    await storageService.find(vector, limit, userId);

    expect(client.search).toHaveBeenCalledWith('test_collection', {
      vector,
      limit,
      filter: {
        must: [{ key: 'userId', match: { value: userId } }],
      },
      with_payload: true,
    });
  });

  it('performs keyword search when query is provided and merges results', async () => {
    const vector = [0.1, 0.2];
    const limit = 5;
    const query = 'test query';
    client.search.mockResolvedValue([{ id: 'v1', score: 0.9, payload: { text: 'vector hit' } }]);
    client.scroll = vi.fn().mockResolvedValue({
      points: [
        { id: 'v1', payload: { text: 'vector hit' } },
        { id: 'k1', payload: { text: 'keyword hit' } },
      ],
    });

    const results = await storageService.find(vector, limit, undefined, query);

    expect(client.scroll).toHaveBeenCalledWith('test_collection', {
      filter: {
        must: [{ key: 'text', match: { text: query } }],
      },
      limit,
      with_payload: true,
    });

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('v1');
    expect(results[1].id).toBe('k1');
    expect(results[1].score).toBe(0.5);
  });

  it('applies userId filter to keyword search', async () => {
    const vector = [0.1, 0.2];
    const limit = 5;
    const userId = 'user-123';
    const query = 'test query';
    client.search.mockResolvedValue([]);
    client.scroll = vi.fn().mockResolvedValue({ points: [] });

    await storageService.find(vector, limit, userId, query);

    expect(client.scroll).toHaveBeenCalledWith('test_collection', {
      filter: {
        must: [
          { key: 'userId', match: { value: userId } },
          { key: 'text', match: { text: query } },
        ],
      },
      limit,
      with_payload: true,
    });
  });

  it('updates payload', async () => {
    const id = 'test-id';
    const partialPayload = { strength: 1.1 };

    await storageService.updatePayload(id, partialPayload);

    expect(client.setPayload).toHaveBeenCalledWith('test_collection', {
      payload: partialPayload,
      points: [id],
    });
  });

  it('updates access time', async () => {
    const id = 'test-id';
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    await storageService.updateAccessTime(id);

    expect(client.setPayload).toHaveBeenCalledWith('test_collection', {
      payload: { last_accessed: now },
      points: [id],
    });

    vi.useRealTimers();
  });
});

