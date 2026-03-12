// Core Exports
export { NeuralNexusCore } from "./src/core/NeuralNexusCore.js";
export { EmbeddingService } from "./src/core/EmbeddingService.js";
export { StorageService } from "./src/core/StorageService.js";
export { DecayEngine } from "./src/core/DecayEngine.js";
export { ReplacementAuditService } from "./src/core/ReplacementAuditService.js";
export { normalizeMemoryConfig } from "./src/core/config.js";

// Type Exports
export * from "./src/core/types.js";

// Legacy OpenClaw Plugin Adapter (Optional)
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { NeuralNexusCore } from "./src/core/NeuralNexusCore.js";
import { normalizeMemoryConfig } from "./src/core/config.js";

const neuralNexusPlugin = {
  id: "neural_nexus",
  name: "Neural Nexus",
  description: "Qdrant-backed universal long-term memory",
  kind: "memory" as const,

  async register(api: OpenClawPluginApi): Promise<void> {
    const config = normalizeMemoryConfig(api.pluginConfig);
    const core = new NeuralNexusCore(config);

    api.registerService({
      id: "neural_nexus",
      start: async () => {
        await core.initialize();
        api.logger.info("Neural Nexus Universal Core initialized via OpenClaw");
      },
      stop: async () => {}
    });

    api.registerTool({
      name: "memory_recall",
      label: "Memory Recall",
      description: "Search long-term memory",
      parameters: Type.Object({
        query: Type.String({ minLength: 1 }),
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 20, default: 5 })),
      }),
      async execute(_id: string, params: any) {
        if (!params.query) throw new Error("query is required");
        const results = await core.recall({
          query: params.query,
          limit: params.limit
        });
        return {
          content: [{ type: "text", text: JSON.stringify(results.memories, null, 2) }],
          details: { results: results.memories }
        };
      }
    });

    api.registerTool({
      name: "memory_store",
      label: "Memory Store",
      description: "Save information to long-term memory",
      parameters: Type.Object({
        text: Type.String({ minLength: 1 }),
        category: Type.Optional(Type.String())
      }),
      async execute(_id: string, params: any) {
        await core.store({
          text: params.text,
          category: params.category
        });
        return { 
          content: [{ type: "text", text: "Memory stored." }],
          details: { status: "stored" }
        };
      }
    });

    if (config.autoCapture) {
      api.on("agent_end", async (event) => {
        if (!event.success || !Array.isArray(event.messages)) return;
        
        const content = config.consolidation
          ? core.consolidate(event.messages, config.consolidationThreshold ?? 4)
          : core.extractCandidate(event.messages);

        if (content) {
          await core.store({ text: content });
          api.logger.info("[Neural Nexus] Auto-captured memory from conversation");
        }
      });
    }
  }
};

export default neuralNexusPlugin;
