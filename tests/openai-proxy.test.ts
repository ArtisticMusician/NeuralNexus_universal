import { vi, test, expect } from "vitest";
import { server } from "../src/openai-proxy.js";
import axios from "axios";

vi.mock("axios", () => {
  const axiosMock = vi.fn().mockImplementation(() => Promise.resolve({ data: { result: "passthrough" } }));
  (axiosMock as any).post = vi.fn();
  (axiosMock as any).get = vi.fn();
  (axiosMock as any).create = vi.fn().mockReturnValue(axiosMock);
  return { default: axiosMock };
});

test("POST /v1/chat/completions injects context and handles tool calls", async () => {
  const axiosPostMock = vi.mocked(axios.post);
  
  axiosPostMock.mockImplementation(async (url: string, data?: any) => {
    if (url.endsWith("/recall")) {
      return { data: { memories: [{ text: "Past memory" }] } };
    }
    if (url.endsWith("/chat/completions")) {
      return {
        data: {
          choices: [{
            message: {
              content: "I remember that.",
              tool_calls: [{
                function: {
                  name: "store_memory",
                  arguments: JSON.stringify({ text: "new memory" })
                }
              }]
            }
          }]
        }
      };
    }
    if (url.endsWith("/store")) {
      return { data: { status: "stored" } };
    }
    return { data: {} };
  });

  const response = await server.inject({
    method: "POST",
    url: "/v1/chat/completions",
    payload: {
      messages: [{ role: "user", content: "Tell me something." }]
    },
  });

  expect(response.statusCode).toBe(200);
  const json = response.json();
  expect(json.choices[0].message.content).toBe("I remember that.");
  
  // Verify recall was called
  expect(axiosPostMock).toHaveBeenCalledWith(expect.stringContaining("/recall"), expect.any(Object));
  
  // Verify LLM was called with injected context
  const llmCall = axiosPostMock.mock.calls.find(call => call[0].endsWith("/chat/completions"));
  expect(llmCall).toBeDefined();
  const llmPayload = llmCall[1];
  expect(llmPayload.messages[0].role).toBe("system");
  expect(llmPayload.messages[0].content).toContain("Relevant Memories:");
  expect(llmPayload.messages[0].content).toContain("Past memory");

  // Verify store was called due to tool call interception
  expect(axiosPostMock).toHaveBeenCalledWith(expect.stringContaining("/store"), { text: "new memory" });
});

test("Pass-through for other OpenAI endpoints", async () => {
  const axiosMock = vi.mocked(axios);

  const response = await server.inject({
    method: "GET",
    url: "/v1/models",
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ result: "passthrough" });
  expect(axiosMock).toHaveBeenCalledWith(expect.objectContaining({
    method: "GET",
    url: expect.stringContaining("/models")
  }));
});
