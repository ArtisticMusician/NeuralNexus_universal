import fastify from "fastify";
import axios from "axios";
import { fileURLToPath } from "url";
import "dotenv/config";

export const server = fastify({ logger: true });

const NEXUS_API_URL = process.env.API_URL || "http://localhost:3000";
const LLM_TARGET_URL = process.env.LLM_TARGET_URL || "https://api.openai.com/v1";
const LLM_API_KEY = process.env.LLM_API_KEY || "";

server.post("/v1/chat/completions", async (request, reply) => {
  const body = request.body as any;
  const messages = body.messages || [];
  
  // 1. Extract last user message for recall
  const lastUserMessage = [...messages].reverse().find(m => m.role === "user")?.content;
  let contextStr = "";

  if (lastUserMessage && typeof lastUserMessage === "string") {
    try {
      const recallRes = await axios.post(`${NEXUS_API_URL}/recall`, {
        query: lastUserMessage,
        limit: 3
      });
      
      const memories = recallRes.data.memories;
      if (memories && memories.length > 0) {
        contextStr = "\n\nRelevant Memories:\n" + memories.map((m: any) => `- ${m.text}`).join("\n");
      }
    } catch (err) {
      server.log.error(err, "Nexus Recall Failed");
    }
  }

  // 2. Inject context into System Message
  let systemMsg = messages.find((m: any) => m.role === "system");
  if (!systemMsg) {
    systemMsg = { role: "system", content: "You are a helpful assistant with long-term memory." };
    messages.unshift(systemMsg);
  }
  
  if (contextStr) {
    systemMsg.content += contextStr;
  }

  // 3. Forward to Target LLM
  try {
    const response = await axios.post(`${LLM_TARGET_URL}/chat/completions`, body, {
      headers: {
        "Authorization": `Bearer ${LLM_API_KEY}`,
        "Content-Type": "application/json"
      },
      responseType: body.stream ? 'stream' : 'json'
    });

    // Handle non-streaming response for tool interception
    if (!body.stream) {
      const choice = response.data.choices?.[0];
      const toolCalls = choice?.message?.tool_calls;

      if (toolCalls) {
        for (const call of toolCalls) {
          if (call.function?.name === "store_memory") {
            const args = JSON.parse(call.function.arguments);
            await axios.post(`${NEXUS_API_URL}/store`, args);
            server.log.info("Intercepted and executed store_memory tool call");
          }
        }
      }
      return response.data;
    }

    // Handle streaming
    reply.raw.writeHead(response.status, response.headers as any);
    response.data.pipe(reply.raw);
  } catch (err: any) {
    server.log.error(err, "LLM Forwarding Failed");
    return reply.status(err.response?.status || 500).send(err.response?.data || { error: "LLM Proxy Error" });
  }
});

// Pass-through for other OpenAI endpoints
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
    await server.listen({ port, host: "0.0.0.0" });
    console.log(`OpenAI-Compatible Proxy running on port ${port} -> Targeting ${LLM_TARGET_URL}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start();
}
