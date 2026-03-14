export type MemoryCategory = "preference" | "fact" | "decision" | "entity" | "other";

export interface MemoryEntry {
  id: string;
  text: string;
  category: MemoryCategory;
  vector: number[];
  metadata: {
    last_accessed: number;
    created_at: number;
    strength: number;
    source?: string;
    [key: string]: any;
  };
}

export interface RecallRequest {
  query: string;
  limit?: number;
  userid?: string;
  category?: MemoryCategory;
  maxTokens?: number;
}

export interface RecallResponse {
  memories: MemoryEntry[];
  metadata?: {
    search_type: "hybrid" | "vector";
    threshold_applied: number;
    countBeforeFiltering: number;
  };
}

export type MergeStrategy = "recompute" | "average" | "replace";

export interface StoreRequest {
  text: string;
  category?: MemoryCategory;
  userid?: string;
  metadata?: Record<string, any>;
  mergeStrategy?: MergeStrategy;
}

export interface ReinforceRequest {
  memoryId: string;
  strengthAdjustment: number;
}
