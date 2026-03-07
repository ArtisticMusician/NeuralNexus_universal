import { describe, it, expect, beforeEach, vi } from "vitest";
import { StorageService } from "../src/core/StorageService.js";
import * as QdrantModule from "@qdrant/js-client-rest";

vi.mock("@qdrant/js-client-rest", () => {
  const MockClient = vi.fn();
  MockClient.prototype.getCollections = vi.fn().mockResolvedValue({ collections: [] });
  MockClient.prototype.createCollection = vi.fn().mockResolvedValue({});
  MockClient.prototype.createPayloadIndex = vi.fn().mockResolvedValue({});
  MockClient.prototype.upsert = vi.fn().mockResolvedValue({});
  MockClient.prototype.retrieve = vi.fn().mockResolvedValue([]);
  MockClient.prototype.search = vi.fn().mockResolvedValue([]);
  MockClient.prototype.scroll = vi.fn().mockResolvedValue({ points: [] });
  MockClient.prototype.setPayload = vi.fn().mockResolvedValue({});
  
  return { QdrantClient: MockClient };
});

describe("StorageService", () => {
  let storageService: StorageService;
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    storageService = new StorageService("http://localhost:6333", "test_collection");
    mockClient = (storageService as any).client;
  });

  it("initializes collection and indices", async () => {
    await storageService.initialize(128);
    expect(mockClient.createCollection).toHaveBeenCalled();
    expect(mockClient.createPayloadIndex).toHaveBeenCalledTimes(2);
  });

  it("searches with RRF merging", async () => {
    const vector = new Array(128).fill(0.1);
    const userId = "user123";
    const query = "test info";

    mockClient.search.mockResolvedValue([
      { id: "1", payload: { text: "vector result" } }
    ]);
    mockClient.scroll.mockResolvedValue({
      points: [{ id: "2", payload: { text: "keyword result" } }]
    });

    const results = await storageService.find(vector, 5, userId, query);

    expect(results).toHaveLength(2);
    expect(mockClient.search).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      filter: { must: [{ key: "userId", match: { value: userId } }] }
    }));
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("strict userId filtering in scrollAll", async () => {
    await storageService.scrollAll("user123");
    expect(mockClient.scroll).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      filter: { must: [{ key: "userId", match: { value: "user123" } }] }
    }));
  });
});
