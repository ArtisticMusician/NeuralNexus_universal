import { test, expect, vi, beforeAll } from "vitest";
import { server } from "../src/server.js";

// Mock the core
vi.mock("../src/core/NeuralNexusCore.js", () => {
  const NeuralNexusCore = vi.fn();
  NeuralNexusCore.prototype.initialize = vi.fn().mockResolvedValue(undefined);
  NeuralNexusCore.prototype.recall = vi.fn().mockResolvedValue({ memories: [] });
  NeuralNexusCore.prototype.store = vi.fn().mockResolvedValue(undefined);
  NeuralNexusCore.prototype.reinforce = vi.fn().mockResolvedValue(undefined);
  NeuralNexusCore.prototype.getAuditLogs = vi.fn().mockResolvedValue([]);
  return { NeuralNexusCore };
});

import { core } from "../src/server.js";

test("server health check", async () => {
  const response = await server.inject({
    method: 'GET',
    url: '/health'
  });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ status: "ok" });
});

test("server recall endpoint", async () => {
  const mockMemories = [{ id: "1", text: "test", category: "fact", metadata: { decayed_score: 0.9 } }];
  vi.mocked(core.recall).mockResolvedValueOnce({ memories: mockMemories } as any);

  const response = await server.inject({
    method: 'POST',
    url: '/recall',
    payload: { query: "test query" }
  });

  expect(response.statusCode).toBe(200);
  expect(response.json().memories).toHaveLength(1);
  expect(vi.mocked(core.recall)).toHaveBeenCalled();
});

test("server store endpoint", async () => {
  const response = await server.inject({
    method: 'POST',
    url: '/store',
    payload: { text: "new memory" }
  });

  expect(response.statusCode).toBe(201);
  expect(response.json()).toEqual({ status: "stored" });
  expect(vi.mocked(core.store)).toHaveBeenCalled();
});

test("server audit endpoint", async () => {
  const response = await server.inject({
    method: 'GET',
    url: '/audit'
  });

  expect(response.statusCode).toBe(200);
  expect(Array.isArray(response.json())).toBe(true);
  expect(vi.mocked(core.getAuditLogs)).toHaveBeenCalled();
});
