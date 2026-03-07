import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock the core instance that server.ts exports
vi.mock("../src/server.js", () => {
  return {
    core: {
      initialize: vi.fn().mockResolvedValue(undefined),
      recall: vi.fn().mockResolvedValue({ memories: [] }),
      store: vi.fn().mockResolvedValue(undefined),
    },
    config: {}
  };
});

import { server } from "../src/mcp.js";
import { core } from "../src/server.js";

describe("MCP Server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("MCP list tools", async () => {
    // @ts-ignore
    const handler = server._requestHandlers.get("tools/list");
    const result = await handler({
      method: "tools/list"
    });
    expect(result.tools).toHaveLength(2);
    expect(result.tools[0].name).toBe("recall_memory");
  });

  test("MCP call recall tool", async () => {
    vi.mocked(core.recall).mockResolvedValue({
      memories: [{ text: "test memory", category: "fact", metadata: {} }] as any
    });

    // @ts-ignore
    const handler = server._requestHandlers.get("tools/call");
    const result = await handler({
      method: "tools/call",
      params: {
        name: "recall_memory",
        arguments: { query: "test" }
      }
    });

    expect(result.content[0].text).toContain("test memory");
  });

  test("MCP call store tool", async () => {
    // @ts-ignore
    const handler = server._requestHandlers.get("tools/call");
    const result = await handler({
      method: "tools/call",
      params: {
        name: "store_memory",
        arguments: { text: "new info", category: "fact" }
      }
    });

    expect(core.store).toHaveBeenCalledWith(expect.objectContaining({ text: "new info" }));
    expect(result.content[0].text).toBe("Memory stored successfully.");
  });
});
