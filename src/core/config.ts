import "dotenv/config";

export type MemoryCategory = "preference" | "fact" | "decision" | "entity" | "other";

export interface MemoryConfig {
  embedding: {
    model: string;
    device: "cuda" | "cpu";
  };
  qdrant: {
    url: string;
    collection: string;
    apiKey?: string;
  };
  replacementLog: {
    enabled: boolean;
    sqlitePath: string;
  };
  apiKey?: string;
  // --- Standard Logic Tunables ---
  thresholds: {
    similarity: number;   
    recall: number;       
  };
  decay: {
    defaultLambda: number; 
  };
  search: {
    limit: number;
    rrfK: number;         
  };
  // --- Legacy / Adapter specific (preserved for index.ts compatibility) ---
  autoCapture?: boolean;
  autoRecall?: boolean;
  consolidation?: boolean;
  consolidationThreshold?: number;
}

export const MEMORY_CATEGORIES = ["preference", "fact", "decision", "entity", "other"] as const;

const DEFAULT_REPLACEMENT_LOG_PATH = "./data/replacements.sqlite";

function resolveEnvVars(value: string): string {
  return value.replace(/\${(\w+)}/g, (_, name) => process.env[name] || "");
}

export function normalizeMemoryConfig(cfg: any): MemoryConfig {
  const replacementLog = cfg.replacementLog || {};
  const rawSqlitePath = replacementLog.sqlitePath ? resolveEnvVars(replacementLog.sqlitePath) : undefined;

  return {
    embedding: {
      model: cfg.embedding?.model || process.env.EMBEDDING_MODEL || "Xenova/bge-small-en-v1.5",
      device: (cfg.embedding?.device || process.env.EMBEDDING_DEVICE) === "cuda" ? "cuda" : "cpu",
    },
    qdrant: {
      url: cfg.qdrant?.url || process.env.QDRANT_URL || "http://localhost:6333",
      collection: cfg.qdrant?.collection || process.env.QDRANT_COLLECTION || "neural_nexus_universal",
      apiKey: cfg.qdrant?.apiKey || process.env.QDRANT_API_KEY,
    },
    replacementLog: {
      enabled: replacementLog.enabled !== false,
      sqlitePath: rawSqlitePath || DEFAULT_REPLACEMENT_LOG_PATH,
    },
    apiKey: typeof cfg.apiKey === "string" ? resolveEnvVars(cfg.apiKey).trim() : (process.env.NEXUS_API_KEY || undefined),
    thresholds: {
      similarity: cfg.thresholds?.similarity ?? parseFloat(process.env.SIMILARITY_THRESHOLD || "0.95"),
      recall: cfg.thresholds?.recall ?? parseFloat(process.env.RECALL_THRESHOLD || "0.1"),
    },
    decay: {
      defaultLambda: cfg.decay?.defaultLambda ?? parseFloat(process.env.DECAY_LAMBDA || "1e-10"), 
    },
    search: {
      limit: cfg.search?.limit ?? parseInt(process.env.SEARCH_LIMIT || "10"),
      rrfK: cfg.search?.rrfK ?? parseInt(process.env.RRF_K || "60"),
    },
    autoCapture: cfg.autoCapture !== false,
    autoRecall: cfg.autoRecall !== false,
    consolidation: cfg.consolidation !== false,
    consolidationThreshold: cfg.consolidationThreshold || 4
  };
}
