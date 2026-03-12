import { test, expect, vi, beforeEach } from "vitest";
import { server, core } from "../src/server.js";
import { InMemoryStorageFake } from "./fakes/InMemoryStorage.js";
import { EmbeddingFake } from "./fakes/EmbeddingFake.js";

// Mock the Audit service to avoid sqlite3 issues
vi.mock('../src/core/ReplacementAuditService.js', () => ({
  ReplacementAuditService: class {
    async initialize() {}
    async logReplacement() {}
    async getLogs() { return []; }
    async close() {}
  }
}));

describe("API Server (No Mocks Integration)", () => {
  beforeEach(async () => {
    // Inject Fakes into the singleton core
    (core as any).storage = new InMemoryStorageFake();
    (core as any).embedding = new EmbeddingFake();
    
    // Ensure core is "ready" for the server
    await core.initialize();
  });

  test("server health check", async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/health'
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  test("POST /store actually persists memory in fake database", async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/store',
      payload: { text: "API stored this", userId: "api-user" }
    });

    expect(response.statusCode).toBe(201);

    // Verify it's actually in our fake storage
    const recall = await core.recall({ query: "API", userId: "api-user" });
    expect(recall.memories).toHaveLength(1);
    expect(recall.memories[0].text).toBe("API stored this");
  });

  test("POST /recall retrieves data from fake database", async () => {
    // 1. Seed
    await core.store({ text: "Find me", userId: "api-user" });

    // 2. Recall via API
    const response = await server.inject({
      method: 'POST',
      url: '/recall',
      payload: { query: "Find", userId: "api-user" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().memories[0].text).toBe("Find me");
  });
});
