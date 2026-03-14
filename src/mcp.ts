import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { NeuralNexusCore } from "./core/NeuralNexusCore.js";
import { fileURLToPath } from "url";
import { core as defaultCore } from "./server.js";
import "dotenv/config";

export function createMcpServer(core: NeuralNexusCore) {
    const server = new Server(
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
                    description:
                        "Search long-term memory for relevant past information, preferences, or facts.",
                    inputSchema: {
                        type: "object" as const,
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
                            // ──────────────────────────────────────────────
                            // NEW — exposes userid so clients actually send it
                            // ──────────────────────────────────────────────
                            userid: {
                                type: "string",
                                description:
                                    "Unique identifier for the user whose memories should be searched. " +
                                    "Omit only when the caller is unauthenticated.",
                            },
                            context: {
                                type: "string",
                                description: "Optional conversation history to use for deduplicating results. Helps prevent repeating things the user just said or already knows.",
                            },
                        },
                        required: ["query"],
                    },
                },
                {
                    name: "store_memory",
                    description:
                        "Save important information, facts, or user preferences to long-term memory.",
                    inputSchema: {
                        type: "object" as const,
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
                            // ──────────────────────────────────────────────
                            // NEW — same addition for store_memory
                            // ──────────────────────────────────────────────
                            userid: {
                                type: "string",
                                description:
                                    "Unique identifier for the user who owns this memory. " +
                                    "Omit only when the caller is unauthenticated.",
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
        const userid = (args as any).userid || "anonymous";

        try {
            if (name === "recall_memory") {
                const response = await core.recall({
                    query: (args as any).query,
                    limit: (args as any).limit,
                    userid,
                });

                let memoriesToDisplay = response.memories;

                // centralizing refineContext logic for MCP as well
                if ((args as any).context) {
                    memoriesToDisplay = await core.refineContext(
                        memoriesToDisplay, 
                        (args as any).context
                    );
                }

                const memories = memoriesToDisplay
                    .map((m: any) => `[${m.category}] ${m.text}`)
                    .join("\n");

                return {
                    content: [
                        { type: "text", text: memories || "No relevant memories found." },
                    ],
                };
            }

            if (name === "store_memory") {
                await core.store({
                    text: (args as any).text,
                    category: (args as any).category,
                    userid,
                });
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
                        text: `Error: ${error.message}`,
                    },
                ],
                isError: true,
            };
        }
    });

    return server;
}

export async function main() {
    const transport = new StdioServerTransport();
    await defaultCore.initialize();
    const server = createMcpServer(defaultCore);
    await server.connect(transport);
    console.error("Neural Nexus MCP server running on stdio");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error("Server error:", error);
        process.exit(1);
    });
}