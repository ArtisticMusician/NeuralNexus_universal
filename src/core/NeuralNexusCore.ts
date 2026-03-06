import { EmbeddingService } from "./EmbeddingService.js";
import { StorageService } from "./StorageService.js";
import { DecayEngine } from "./DecayEngine.js";
import { ReplacementAuditService } from "./ReplacementAuditService.js";
import { type MemoryConfig } from "./config.js";
import { 
  type MemoryCategory, 
  type MemoryEntry, 
  type RecallRequest, 
  type RecallResponse, 
  type StoreRequest, 
  type ReinforceRequest 
} from "./types.js";
import { v4 as uuidv4 } from "uuid";
import AsyncLock from "async-lock";

/**
 * NeuralNexusCore: The central Orchestration Layer.
 * It coordinates between Embedding, Storage, Decay, and Audit services.
 * It enforces Atomic Locking and Semantic Deduplication.
 */
export class NeuralNexusCore {
  private embedding: EmbeddingService;
  private storage: StorageService;
  private decay: DecayEngine;
  private audit: ReplacementAuditService;
  private lock: AsyncLock;

  constructor(private config: MemoryConfig) {
    this.embedding = new EmbeddingService(config.embedding.model, config.embedding.device);
    this.storage = new StorageService(config.qdrant.url, config.qdrant.collection, config.qdrant.apiKey);
    this.decay = new DecayEngine();
    this.audit = new ReplacementAuditService(config.replacementLog.enabled, config.replacementLog.sqlitePath);
    this.lock = new AsyncLock();
  }

  /**
   * Initialize all sub-services.
   */
  async initialize() {
    await this.embedding.initialize();
    const dim = this.embedding.getDim();
    if (dim === null) {
      throw new Error("NeuralNexusCore: Could not determine embedding dimension.");
    }
    await this.storage.initialize(dim);
    await this.audit.initialize();
  }

  /**
   * Recall relevant memories using Hybrid Search (Vector + Keyword) and Decay scoring.
   */
  async recall(request: RecallRequest): Promise<RecallResponse> {
    const vector = await this.embedding.createVector(request.query);
    const results = await this.storage.find(vector, request.limit ?? 10, request.userId, request.query);

    const memories: MemoryEntry[] = results.map((res: any) => {
      const payload = res.payload;
      const score = res.score;
      const decayedScore = this.decay.calculateScore(
        score,
        payload.last_accessed,
        0.0000001, 
        payload.strength ?? 1
      );

      return {
        id: res.id.toString(),
        text: payload.text,
        category: payload.category,
        vector: res.vector ?? [],
        metadata: {
          ...payload,
          decayed_score: decayedScore
        }
      };
    });

    memories.sort((a, b) => (b.metadata.decayed_score as number) - (a.metadata.decayed_score as number));

    if (request.maxTokens) {
      return this.applyTokenBudget(memories, request.maxTokens);
    }

    return { memories };
  }

  /**
   * Store or Update a memory with semantic deduplication and atomic locking.
   */
  async store(request: StoreRequest): Promise<void> {
    const vector = await this.embedding.createVector(request.text);
    const userId = request.userId || "anonymous";

    await this.lock.acquire(`store:${userId}`, async () => {
      const existing = await this.storage.find(vector, 1, request.userId);
      const similarityThreshold = 0.95;

      if (existing.length > 0 && existing[0].score >= similarityThreshold) {
        return this.handleMerge(existing[0], request);
      }

      const id = uuidv4();
      const payload = {
        text: request.text,
        category: request.category || this.detectCategory(request.text),
        last_accessed: Date.now(),
        created_at: Date.now(),
        strength: 1,
        userId: request.userId,
        ...request.metadata
      };

      await this.storage.store(id, vector, payload);
    });
  }

  /**
   * Reinforce a memory's strength atomically.
   */
  async reinforce(request: ReinforceRequest): Promise<void> {
    await this.lock.acquire(`reinforce:${request.memoryId}`, async () => {
      const point = await this.storage.getPoint(request.memoryId);
      if (!point) return;

      const currentStrength = (point.payload as any).strength || 1;
      await this.storage.updatePayload(request.memoryId, {
        strength: currentStrength + (request.strengthAdjustment || 0.05),
        last_accessed: Date.now()
      });
    });
  }

  async getAuditLogs(limit?: number) {
    return await this.audit.getLogs(limit);
  }

  async exportMemories(userId?: string) {
    const points = await this.storage.scrollAll(userId);
    return points.map((p) => ({
      id: p.id,
      vector: p.vector,
      payload: p.payload,
    }));
  }

  async importMemories(memories: any[]) {
    if (!Array.isArray(memories)) throw new Error("Invalid import format");
    
    const CHUNK_SIZE = 50;
    for (let i = 0; i < memories.length; i += CHUNK_SIZE) {
      const chunk = memories.slice(i, i + CHUNK_SIZE);
      const points = chunk.map((m) => ({
        id: m.id || uuidv4(),
        vector: m.vector || [], 
        payload: m.payload || {},
      }));
      await this.storage.storeBatch(points);
    }
  }

  // --- Public Helper Logic (Used by adapters and for testing) ---

  public async applyTokenBudget(memories: MemoryEntry[], maxTokens: number): Promise<RecallResponse> {
    const budgeted: MemoryEntry[] = [];
    let currentCount = 0;
    for (const m of memories) {
      const tokens = await this.embedding.countTokens(m.text);
      if (currentCount + tokens <= maxTokens) {
        budgeted.push(m);
        currentCount += tokens;
      } else break;
    }
    return { memories: budgeted };
  }

  public detectCategory(text: string): MemoryCategory {
    const lower = text.toLowerCase();
    if (lower.includes("prefer") || lower.includes("like") || lower.includes("dislike")) return "preference";
    if (lower.includes("decided") || lower.includes("chose") || lower.includes("instead of")) return "decision";
    if (lower.includes("is a") || lower.includes("called")) return "entity";
    return "fact";
  }

  public static normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, " ").trim();
  }

  public extractText(content: unknown): string | null {
    if (typeof content === "string") {
      const normalized = NeuralNexusCore.normalizeWhitespace(content);
      return normalized.length > 0 ? normalized : null;
    }

    if (Array.isArray(content)) {
      const parts: string[] = [];
      for (const part of content) {
        if (!part || typeof part !== "object") {
          continue;
        }
        const maybeText = (part as { text?: unknown }).text;
        if (typeof maybeText === "string" && maybeText.trim()) {
          parts.push(maybeText.trim());
        }
      }
      if (parts.length > 0) {
        return NeuralNexusCore.normalizeWhitespace(parts.join(" "));
      }
    }

    return null;
  }

  public userMessages(messages: unknown[]): string[] {
    const texts: string[] = [];

    for (const msg of messages) {
      if (!msg || typeof msg !== "object") {
        continue;
      }

      const typed = msg as any;
      if (typed.role !== "user") {
        continue;
      }

      const text = this.extractText(typed.content);
      if (text) {
        texts.push(text);
      }
    }

    return texts;
  }

  public extractCandidate(messages: unknown[]): string | null {
    const userTexts = this.userMessages(messages);
    const last = userTexts[userTexts.length - 1];
    if (!last || last.length < 25) {
      return null;
    }
    return last.slice(0, 1200);
  }

  public consolidate(messages: unknown[], threshold: number): string | null {
    const userTexts = this.userMessages(messages);
    if (userTexts.length === 0) {
      return null;
    }

    if (userTexts.length < threshold) {
      return this.extractCandidate(messages);
    }

    const deduped: string[] = [];
    const seen = new Set<string>();

    for (const text of userTexts.slice(-12)) {
      if (text.length < 10) {
        continue;
      }
      const key = text.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      deduped.push(text);
    }

    if (deduped.length === 0) {
      return null;
    }

    return NeuralNexusCore.normalizeWhitespace(deduped.join(" ")).slice(0, 1200);
  }

  // --- Internal Logic ---

  private async handleMerge(bestMatch: any, request: StoreRequest) {
    const id = bestMatch.id.toString();
    await this.storage.updatePayload(id, {
      text: request.text,
      category: request.category || bestMatch.payload.category,
      last_accessed: Date.now(),
      strength: (bestMatch.payload.strength || 1) + 0.1
    });

    await this.audit.logReplacement({
      memoryId: id,
      category: request.category || bestMatch.payload.category,
      oldText: bestMatch.payload.text,
      newText: request.text,
      similarityScore: bestMatch.score,
      replacedAt: Date.now()
    });
  }
}
