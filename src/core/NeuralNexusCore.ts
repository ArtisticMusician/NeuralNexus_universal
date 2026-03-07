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
 * Refactored for privacy enforcement, improved search merging, 
 * and configurable lifecycle management.
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

  async initialize() {
    await this.embedding.initialize();
    const dim = this.embedding.getDim();
    if (dim === null) throw new Error("Could not determine embedding dimension.");
    await this.storage.initialize(dim);
    await this.audit.initialize();
  }

  /**
   * Recall memories using Hybrid Search + RRF + Decay scoring.
   * Strictly partitioned by userId.
   */
  async recall(request: RecallRequest): Promise<RecallResponse> {
    const userId = request.userId || "anonymous";
    const vector = await this.embedding.createVector(request.query);
    
    // Find points with strict userId partition and RRF merging
    const results = await this.storage.find(
      vector, 
      request.limit || this.config.search.limit, 
      userId, 
      request.query,
      this.config.search.rrfK
    );

    const memories: MemoryEntry[] = results.map((res: any) => {
      const payload = res.payload;
      const score = res.score;
      const decayedScore = this.decay.calculateScore(
        score,
        payload.last_accessed,
        this.config.decay.defaultLambda, 
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

    // Sort by decayed score and apply threshold
    memories.sort((a, b) => (b.metadata.decayed_score as number) - (a.metadata.decayed_score as number));
    const filtered = memories.filter(m => (m.metadata.decayed_score as number) >= this.config.thresholds.recall);

    if (request.maxTokens) {
      return this.applyTokenBudget(filtered, request.maxTokens);
    }

    return { memories: filtered };
  }

  /**
   * Store or merge memory with strict userId enforcement.
   */
  async store(request: StoreRequest): Promise<void> {
    const userId = request.userId || "anonymous";
    const vector = await this.embedding.createVector(request.text);

    await this.lock.acquire(`store:${userId}`, async () => {
      // Deduplicate ONLY within the user's partition
      const existing = await this.storage.find(vector, 1, userId);
      const threshold = this.config.thresholds.similarity;

      if (existing.length > 0 && existing[0].score >= threshold) {
        return this.handleMerge(existing[0], request);
      }

      const id = uuidv4();
      const payload = {
        text: request.text,
        category: request.category || this.detectCategory(request.text),
        last_accessed: Date.now(),
        created_at: Date.now(),
        strength: 1,
        userId: userId,
        ...request.metadata
      };

      await this.storage.store(id, vector, payload);
    });
  }

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

  async exportMemories(userId: string = "anonymous") {
    const points = await this.storage.scrollAll(userId);
    return points.map(p => ({
      id: p.id,
      vector: p.vector,
      payload: p.payload,
    }));
  }

  async importMemories(memories: any[]) {
    if (!Array.isArray(memories)) throw new Error("Invalid import format");
    const points = memories.map(m => ({
      id: m.id || uuidv4(),
      vector: m.vector || [], 
      payload: { ...m.payload, userId: m.payload?.userId || "anonymous" },
    }));
    await this.storage.storeBatch(points);
  }

  public detectCategory(text: string): MemoryCategory {
    const lower = text.toLowerCase();
    // Improved keyword detection
    const prefKeys = ["prefer", "like", "love", "hate", "dislike", "favorite", "hobby", "habit"];
    const decKeys = ["decided", "chose", "selected", "plan", "scheduled", "instead of", "going to"];
    const entityKeys = ["is a", "called", "named", "located", "works at", "member of"];

    if (prefKeys.some(k => lower.includes(k))) return "preference";
    if (decKeys.some(k => lower.includes(k))) return "decision";
    if (entityKeys.some(k => lower.includes(k))) return "entity";
    
    return "fact";
  }

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

  public extractCandidate(messages: any[]): string | null {
    // Simple logic to get last user message
    const userMsg = messages.filter(m => m.role === "user").pop();
    if (!userMsg || !userMsg.content) return null;
    return typeof userMsg.content === "string" ? userMsg.content : null;
  }

  public consolidate(messages: any[], threshold: number): string | null {
    const userMsgs = messages.filter(m => m.role === "user");
    if (userMsgs.length < threshold) return this.extractCandidate(messages);
    return userMsgs.map(m => m.content).join("\n").slice(0, 2000);
  }
}
