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
  userId?: string;
  category?: MemoryCategory;
  maxTokens?: number;
}

export interface RecallResponse {
  memories: MemoryEntry[];
}

export interface StoreRequest {
  text: string;
  category?: MemoryCategory;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface ReinforceRequest {
  memoryId: string;
  strengthAdjustment: number;
}
