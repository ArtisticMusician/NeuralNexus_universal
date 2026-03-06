import { type MemoryCategory } from "./types.js";

export type MemoryConfig = {
  embedding: {
    model: string;
    device: "cuda" | "cpu";
  };
  qdrant: {
    url: string;
    collection: string;
    apiKey?: string;
  };
  autoCapture?: boolean;
  autoRecall?: boolean;
  consolidation?: boolean;
  consolidationThreshold?: number;
  replacementLog: {
    enabled: boolean;
    sqlitePath: string;
  };
  apiKey?: string;
};

export const MEMORY_CATEGORIES = ["preference", "fact", "decision", "entity", "other"] as const;

const DEFAULT_MODEL = "Xenova/bge-small-en-v1.5";
const DEFAULT_QDRANT_URL = "http://localhost:6333";
const DEFAULT_COLLECTION = "openclaw_memories";
const DEFAULT_REPLACEMENT_LOG_PATH = "./data/neural_nexus_replacements.sqlite";

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, envVar) => process.env[envVar] ?? "");
}

export function normalizeMemoryConfig(input: unknown): MemoryConfig {
  const cfg = asObject(input) ?? {};
  const embedding = asObject(cfg.embedding) ?? {};
  const qdrant = asObject(cfg.qdrant) ?? {};
  const replacementLog = asObject(cfg.replacementLog) ?? {};

  const rawModel = typeof embedding.model === "string" ? embedding.model.trim() : "";
  const rawUrl = typeof qdrant.url === "string" ? resolveEnvVars(qdrant.url).trim() : "";
  const rawCollection = typeof qdrant.collection === "string" ? qdrant.collection.trim() : "";
  const rawApiKey = typeof qdrant.apiKey === "string" ? resolveEnvVars(qdrant.apiKey).trim() : "";
  const rawSqlitePath =
    typeof replacementLog.sqlitePath === "string"
      ? resolveEnvVars(replacementLog.sqlitePath).trim()
      : "";

  return {
    embedding: {
      model: rawModel || DEFAULT_MODEL,
      device: embedding.device === "cpu" ? "cpu" : "cuda",
    },
    qdrant: {
      url: rawUrl || DEFAULT_QDRANT_URL,
      collection: rawCollection || DEFAULT_COLLECTION,
      apiKey: rawApiKey || undefined,
    },
    autoCapture: cfg.autoCapture !== false,
    autoRecall: cfg.autoRecall !== false,
    consolidation: cfg.consolidation !== false,
    consolidationThreshold:
      typeof cfg.consolidationThreshold === "number" && cfg.consolidationThreshold > 0
        ? Math.floor(cfg.consolidationThreshold)
        : 4,
    replacementLog: {
      enabled: replacementLog.enabled !== false,
      sqlitePath: rawSqlitePath || DEFAULT_REPLACEMENT_LOG_PATH,
    },
    apiKey: typeof cfg.apiKey === "string" ? resolveEnvVars(cfg.apiKey).trim() : undefined,
  };
}
