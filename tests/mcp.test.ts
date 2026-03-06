import { test, expect, vi } from "vitest";
import axios from "axios";
import { server } from "../src/mcp.js";

vi.mock("axios");

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
  vi.mocked(axios.post).mockResolvedValue({
    data: { memories: [{ text: "test memory", category: "fact" }] }
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
  vi.mocked(axios.post).mockResolvedValue({ status: 201 });

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
