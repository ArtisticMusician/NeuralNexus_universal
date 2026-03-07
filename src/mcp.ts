import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { fileURLToPath } from "url";
import { core } from "./server.js"; 
import "dotenv/config";

export const server = new Server(
  {
    name: "neural-nexus",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "recall_memory",
      description: "Search long-term memory for relevant past information.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query" },
          limit: { type: "number", description: "Max results to return" },
          userId: { type: "string", description: "The user ID (optional)" },
        },
        required: ["query"],
      },
    },
    {
      name: "store_memory",
      description: "Save important facts or user preferences to long-term memory.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "The information to remember" },
          category: { type: "string", enum: ["fact", "preference", "decision", "entity", "other"] },
          userId: { type: "string", description: "The user ID (optional)" },
        },
        required: ["text"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "recall_memory") {
      const results = await core.recall({
        query: args?.query as string,
        limit: args?.limit as number,
        userId: args?.userId as string,
      });
      const memories = results.memories.map((m: any) => `[${m.category}] ${m.text}`).join("\n");
      return {
        content: [{ type: "text", text: memories || "No relevant memories found." }],
      };
    }

    if (name === "store_memory") {
      await core.store({
        text: args?.text as string,
        category: args?.category as any,
        userId: args?.userId as string,
      });
      return {
        content: [{ type: "text", text: "Memory stored successfully." }],
      };
    }

    return {
      content: [{ type: "text", text: `Tool not found: ${name}` }],
      isError: true,
    };
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

async function run() {
  await core.initialize();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Neural Nexus MCP Server running on stdio");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run();
}
