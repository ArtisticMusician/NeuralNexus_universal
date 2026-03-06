import crypto from "node:crypto";
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import { normalizeMemoryConfig } from "./src/core/config.js";
import type { MemoryCategory } from "./src/core/types.js";
import { EmbeddingService } from "./src/core/EmbeddingService.js";
import { StorageService } from "./src/core/StorageService.js";
import { NeuralNexusCore as NeuralNexus } from "./src/core/NeuralNexusCore.js";
import { DecayEngine } from "./src/core/DecayEngine.js";
import { ReplacementAuditService } from "./src/core/ReplacementAuditService.js";

export const CATEGORY_PARAMS: Record<MemoryCategory, { lambda: number; reinforce: boolean }> = {
  preference: { lambda: 0, reinforce: false },
  fact: { lambda: 1e-10, reinforce: true },
  entity: { lambda: 5e-11, reinforce: true },
  decision: { lambda: 2e-10, reinforce: true },
  other: { lambda: 5e-10, reinforce: false },
};

type MemoryPoint = {
  id: string | number;
  score: number;
  payload?: {
    text?: unknown;
    category?: unknown;
    lambda?: unknown;
    strength?: unknown;
    last_accessed?: unknown;
    [key: string]: unknown;
  };
};

type MemoryPointWithDecay = MemoryPoint & { adjustedScore: number };

const neuralNexusPlugin = {
  id: "neural_nexus",
  name: "Neural Nexus",
  description: "Qdrant-backed long-term memory plugin",
  kind: "memory" as const,

  async register(api: OpenClawPluginApi): Promise<void> {
    const cfg = normalizeMemoryConfig(api.pluginConfig);

    const embeddings = new EmbeddingService(cfg.embedding.model, cfg.embedding.device);
    const storage = new StorageService(cfg.qdrant.url, cfg.qdrant.collection, cfg.qdrant.apiKey);
    const neuralNexus = new NeuralNexus(cfg);
    const decay = new DecayEngine();
    const replacementAudit = new ReplacementAuditService(
      cfg.replacementLog.enabled,
      cfg.replacementLog.sqlitePath,
    );

    let initialized = false;
    const ensureInitialized = async (): Promise<boolean> => {
      if (initialized) {
        return true;
      }

      try {
        await embeddings.initialize();
        const dim = embeddings.getDim();
        if (!dim) {
          api.logger.error("[Neural Nexus] Embedding model returned invalid dimension");
          return false;
        }
        await storage.initialize(dim);
        await replacementAudit.initialize();
        initialized = true;
        return true;
      } catch (err) {
        api.logger.error(`[Neural Nexus] Setup failed: ${String(err)}`);
        return false;
      }
    };

    const recallWithDecay = async (
      query: string,
      limit: number,
      threshold: number,
    ): Promise<MemoryPointWithDecay[]> => {
      if (!(await ensureInitialized())) {
        return [];
      }

      const vector = await embeddings.createVector(query);
      const hits = (await storage.find(vector, limit * 2)) as MemoryPoint[];

      return hits
        .map((hit) => {
          const payload = hit.payload ?? {};
          const category =
            typeof payload.category === "string" && payload.category in CATEGORY_PARAMS
              ? (payload.category as MemoryCategory)
              : "other";

          const lambda =
            typeof payload.lambda === "number" ? payload.lambda : CATEGORY_PARAMS[category].lambda;
          const strength = typeof payload.strength === "number" ? payload.strength : 1;
          const lastAccessed =
            typeof payload.last_accessed === "number" ? payload.last_accessed : Date.now();

          return {
            ...hit,
            adjustedScore: decay.calculateScore(hit.score, lastAccessed, lambda, strength),
          };
        })
        .filter((hit) => hit.adjustedScore >= threshold)
        .sort((a, b) => b.adjustedScore - a.adjustedScore)
        .slice(0, limit);
    };

    if (cfg.autoRecall) {
      api.registerTool({
        name: "memory_recall",
        label: "Memory Recall",
        description: "Search long-term memory",
        parameters: Type.Object({
          query: Type.String({ minLength: 1 }),
          limit: Type.Optional(Type.Number({ minimum: 1, maximum: 20, default: 5 })),
        }),
        async execute(_id: string, params: Record<string, unknown>) {
          const query = typeof params.query === "string" ? params.query.trim() : "";
          if (!query) {
            throw new Error("query is required");
          }

          const limit =
            typeof params.limit === "number" && Number.isFinite(params.limit)
              ? Math.max(1, Math.min(20, Math.floor(params.limit)))
              : 5;

          const results = await recallWithDecay(query, limit, 0.3);
          for (const result of results) {
            const resultPayload = result.payload ?? {};
            const category =
              typeof resultPayload.category === "string" && resultPayload.category in CATEGORY_PARAMS
                ? (resultPayload.category as MemoryCategory)
                : "other";
            const categoryParams = CATEGORY_PARAMS[category] ?? CATEGORY_PARAMS.other;

            const updates: Record<string, unknown> = { last_accessed: Date.now() };
            if (categoryParams.reinforce) {
              const currentStrength =
                typeof resultPayload.strength === "number" ? resultPayload.strength : 1;
              updates.strength = currentStrength + 0.05;

              if (typeof resultPayload.lambda === "number") {
                updates.lambda = resultPayload.lambda * 0.98;
              }
            }

            await storage.updatePayload(String(result.id), updates);
          }

          const payload = results.map((result) => ({
            text: typeof result.payload?.text === "string" ? result.payload.text : "",
            score: result.adjustedScore,
          }));

          return {
            content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
            details: { results: payload },
          };
        },
      });
    }

    if (cfg.autoCapture) {
      api.on("agent_end", async (event) => {
        if (!event.success || !Array.isArray(event.messages)) {
          return;
        }
        if (!(await ensureInitialized())) {
          return;
        }

        try {
          const content = cfg.consolidation
            ? neuralNexus.consolidate(event.messages, cfg.consolidationThreshold ?? 4)
            : neuralNexus.extractCandidate(event.messages);

          if (!content) {
            return;
          }

          const category = neuralNexus.detectCategory(content);
          const params = CATEGORY_PARAMS[category] ?? CATEGORY_PARAMS.other;
          const vector = await embeddings.createVector(content);

          if (category === "preference") {
            const existing = await recallWithDecay(content, 3, 0.92);
            const existingPref = existing.find((memory) => memory.payload?.category === "preference");

            if (existingPref) {
              const oldText =
                typeof existingPref.payload?.text === "string" ? existingPref.payload.text : "";

              await storage.store(String(existingPref.id), vector, {
                ...(existingPref.payload ?? {}),
                text: content,
                category,
                lambda: 0,
                strength: 1,
                last_accessed: Date.now(),
              });

              try {
                await replacementAudit.logReplacement({
                  memoryId: String(existingPref.id),
                  category,
                  oldText,
                  newText: content,
                  similarityScore:
                    typeof existingPref.adjustedScore === "number" ? existingPref.adjustedScore : null,
                  replacedAt: Date.now(),
                });
              } catch (err) {
                api.logger.warn(`[Neural Nexus] Replacement audit failed: ${String(err)}`);
              }

              return;
            }

            await storage.store(crypto.randomUUID(), vector, {
              text: content,
              category,
              lambda: 0,
              strength: 1,
              last_accessed: Date.now(),
            });
            return;
          }

          const existing = await recallWithDecay(content, 1, 0.92);
          if (existing.length > 0) {
            return;
          }

          await storage.store(crypto.randomUUID(), vector, {
            text: content,
            category,
            lambda: params.lambda,
            strength: 1,
            last_accessed: Date.now(),
          });
        } catch (err) {
          api.logger.warn(`[Neural Nexus] Auto-capture failed: ${String(err)}`);
        }
      });
    }

    api.registerService({
      id: "neural_nexus",
      start: async (ctx) => {
        const ok = await ensureInitialized();
        if (ok) {
          ctx.logger.info("Neural Nexus plugin active");
        }
      },
      stop: async () => {
        await replacementAudit.close();
      },
    });
  },
};

export default neuralNexusPlugin;


