import fastify from "fastify";
import axios from "axios";
import { fileURLToPath } from "url";
import { core } from "./server.js";
import { Transform } from "stream";
import "dotenv/config";

export const server = fastify({ logger: true });

const LLM_TARGET_URL = process.env.LLM_TARGET_URL || "https://api.openai.com/v1";
const LLM_API_KEY = process.env.LLM_API_KEY || "";

/**
 * StreamInterceptor: A Transform stream that parses OpenAI SSE chunks
 * to detect and execute 'store_memory' tool calls during a stream.
 */
class StreamInterceptor extends Transform {
  private buffer: string = "";

  constructor(private userId?: string) {
    super();
  }

  _transform(chunk: any, encoding: string, callback: any) {
    const data = chunk.toString();
    this.buffer += data;

    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const jsonStr = line.replace("data: ", "").trim();
        if (jsonStr === "[DONE]") continue;

        try {
          const json = JSON.parse(jsonStr);
          const toolCalls = json.choices?.[0]?.delta?.tool_calls;
          
          if (toolCalls) {
            for (const call of toolCalls) {
              if (call.function?.name === "store_memory" && call.function.arguments) {
                try {
                  const args = JSON.parse(call.function.arguments);
                  core.store({ ...args, userId: this.userId }).catch(console.error);
                } catch {
                  // Incomplete chunk
                }
              }
            }
          }
        } catch (e) {
          // Noise
        }
      }
    }
    callback(null, chunk);
  }
}

server.post("/v1/chat/completions", async (request, reply) => {
  const body = request.body as any;
  const userId = (request.headers["user-id"] || request.headers["x-user-id"]) as string;
  const messages = body.messages || [];
  
  const lastUserMessage = [...messages].reverse().find(m => m.role === "user")?.content;
  if (lastUserMessage && typeof lastUserMessage === "string") {
    try {
      const recallRes = await core.recall({ query: lastUserMessage, limit: 3, userId });
      if (recallRes.memories.length > 0) {
        const contextStr = "\n\nRelevant Memories:\n" + recallRes.memories.map((m: any) => `- ${m.text}`).join("\n");
        let systemMsg = messages.find((m: any) => m.role === "system");
        if (!systemMsg) {
          systemMsg = { role: "system", content: "You are a helpful assistant with long-term memory." };
          messages.unshift(systemMsg);
        }
        systemMsg.content += contextStr;
      }
    } catch (err) {
      server.log.error(err, "Nexus Recall Failed");
    }
  }

  try {
    const response = await axios.post(`${LLM_TARGET_URL}/chat/completions`, body, {
      headers: {
        "Authorization": `Bearer ${LLM_API_KEY}`,
        "Content-Type": "application/json"
      },
      responseType: body.stream ? 'stream' : 'json'
    });

    if (!body.stream) {
      const choice = response.data.choices?.[0];
      const toolCalls = choice?.message?.tool_calls;

      if (toolCalls) {
        for (const call of toolCalls) {
          if (call.function?.name === "store_memory") {
            const args = JSON.parse(call.function.arguments);
            await core.store({ ...args, userId });
          }
        }
      }
      return response.data;
    }

    reply.raw.writeHead(response.status, response.headers as any);
    const interceptor = new StreamInterceptor(userId);
    response.data.pipe(interceptor).pipe(reply.raw);
  } catch (err: any) {
    server.log.error(err, "LLM Forwarding Failed");
    return reply.status(err.response?.status || 500).send(err.response?.data || { error: "LLM Proxy Error" });
  }
});

server.all("/v1/*", async (request, reply) => {
    const path = (request.params as any)["*"];
    try {
        const response = await axios({
            method: request.method,
            url: `${LLM_TARGET_URL}/${path}`,
            data: request.body,
            headers: {
                "Authorization": `Bearer ${LLM_API_KEY}`,
                "Content-Type": "application/json"
            }
        });
        return response.data;
    } catch (err: any) {
        return reply.status(err.response?.status || 500).send(err.response?.data);
    }
});

export const start = async () => {
  try {
    const port = parseInt(process.env.OPENAI_PROXY_PORT || "3001");
    await core.initialize();
    await server.listen({ port, host: "0.0.0.0" });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start();
}
