import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import { fileURLToPath } from "url";
import "dotenv/config";

const API_URL = process.env.API_URL || "http://localhost:3000";
const API_KEY = process.env.NEXUS_API_KEY;

export const api = axios.create({
  baseURL: API_URL,
  headers: API_KEY ? { 'X-API-Key': API_KEY } : {}
});

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

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "recall_memory",
        description: "Search long-term memory for relevant past information, preferences, or facts.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query",
            },
            limit: {
              type: "number",
              description: "Maximum number of memories to retrieve",
              default: 5,
            },
          },
          required: ["query"],
        },
      },
      {
        name: "store_memory",
        description: "Save important information, facts, or user preferences to long-term memory.",
        inputSchema: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "The content of the memory",
            },
            category: {
              type: "string",
              enum: ["preference", "fact", "entity", "decision", "other"],
              description: "Memory category",
              default: "fact",
            },
          },
          required: ["text"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "recall_memory") {
      const response = await api.post(`/recall`, args);
      const memories = response.data.memories.map((m: any) => 
        `[${m.category}] ${m.text}`
      ).join("\n");

      return {
        content: [{ type: "text", text: memories || "No relevant memories found." }],
      };
    }

    if (name === "store_memory") {
      await api.post(`/store`, args);
      return {
        content: [{ type: "text", text: "Memory stored successfully." }],
      };
    }

    throw new Error(`Tool not found: ${name}`);
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.response?.data?.error || error.message}`,
        },
      ],
      isError: true,
    };
  }
});

export async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Neural Nexus MCP server running on stdio");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
}
