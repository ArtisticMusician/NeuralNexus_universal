import { describe, vi, test, expect, beforeEach } from "vitest";

// Mock the core instance that server.ts exports
vi.mock("../src/server.js", () => {
  return {
    core: {
      initialize: vi.fn().mockResolvedValue(undefined),
      recall: vi.fn().mockResolvedValue({ memories: [{ text: "Past memory" }] }),
      store: vi.fn().mockResolvedValue(undefined),
    },
    config: {}
  };
});

import { server } from "../src/openai-proxy.js";
import { core } from "../src/server.js";
import axios from "axios";

vi.mock("axios");

describe("OpenAI Proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("POST /v1/chat/completions injects context", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      status: 200,
      headers: {},
      data: {
        choices: [{
          message: { content: "I remember that." }
        }]
      }
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        messages: [{ role: "user", content: "Tell me something." }]
      },
    });

    expect(response.statusCode).toBe(200);
    expect(core.recall).toHaveBeenCalled();
    
    const llmCall = vi.mocked(axios.post).mock.calls[0];
    const payload = llmCall[1] as any;
    expect(payload.messages[0].content).toContain("Relevant Memories:");
  });
});
