import { test, expect, vi } from "vitest";
import axios from "axios";

vi.mock("axios", () => {
  return {
    default: {
      create: vi.fn().mockReturnValue({
        post: vi.fn(),
        get: vi.fn(),
      }),
    },
  };
});

// Import server AFTER mocking axios
import { server, api } from "../src/mcp.js";

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
  vi.mocked(api.post).mockResolvedValue({
    data: { memories: [{ text: "test memory", category: "fact" }] }
  } as any);

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
  vi.mocked(api.post).mockResolvedValue({ status: 201 } as any);

  // @ts-ignore
  const handler = server._requestHandlers.get("tools/call");
  const result = await handler({
    method: "tools/call",
    params: {
      name: "store_memory",
      arguments: { text: "new info" }
    }
  });

  expect(result.content[0].text).toBe("Memory stored successfully.");
});

test("MCP handle tool not found", async () => {
  // @ts-ignore
  const handler = server._requestHandlers.get("tools/call");
  const result = await handler({
    method: "tools/call",
    params: {
      name: "unknown_tool",
      arguments: {}
    }
  });
  
  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain("Tool not found");
});
