import { EmbeddingService } from "./EmbeddingService.js";
import { StorageService } from "./StorageService.js";
import { DecayEngine } from "./DecayEngine.js";
import { ReplacementAuditService } from "./ReplacementAuditService.js";
import { CategoryService } from "./CategoryService.js";
import { type MemoryConfig } from "./config.js";
import { IMemoryConsolidator, DefaultConsolidator } from "./MemoryConsolidator.js";
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
    private categoryService: CategoryService;
    private consolidator: IMemoryConsolidator;
    public lock: AsyncLock;

    constructor(public config: MemoryConfig) {
        this.embedding = new EmbeddingService(config.embedding.model, config.embedding.device);
        this.storage = new StorageService(config.qdrant.url, config.qdrant.collection, config.qdrant.apiKey);
        this.decay = new DecayEngine();
        this.audit = new ReplacementAuditService(config.replacementLog.enabled, config.replacementLog.sqlitePath);
        this.categoryService = new CategoryService();
        this.consolidator = new DefaultConsolidator(2000);
        this.lock = new AsyncLock();
    }

    public setConsolidator(consolidator: IMemoryConsolidator) {
        this.consolidator = consolidator;
    }

    public getEmbedding() {
        return this.embedding;
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
        const userId = request.userId || "anonymous";
        const vector = await this.embedding.createVector(request.query);
        const results = await this.storage.find(
            vector,
            request.limit || this.config.search.limit,
            userId,
            request.query,
            this.config.search.rrfK,
            this.config.search.hybridAlpha ?? 0.7
        );

        // Filter by recall threshold
        const countBeforeFiltering = results.length;
        const threshold = this.config.thresholds.recall;
        const validResults = results.filter(res => (res.score ?? 0) >= threshold);

        const memories: MemoryEntry[] = validResults.map((res: any) => {
            const payload = res.payload || {};
            const score = res.score ?? res.payload?._original_score ?? 0;
            const catParams = this.config.categoryParams || { other: { lambda: 1e-10 } };
            const params = catParams[payload.category] ?? catParams.other ?? { lambda: 1e-10 };
            const lambda = params.lambda;

            const decayedScore = this.decay.calculateScore(
                score,
                payload.last_accessed,
                lambda,
                payload.strength ?? 1,
                this.config.decay.timeUnit || "ms"
            );

            return {
                id: res.id.toString(),
                text: payload.text,
                category: payload.category,
                vector: res.vector ?? [],
                metadata: {
                    ...payload,
                    decayed_score: decayedScore,
                    search_score: score,
                    score_type: request.query ? "rrf" : "cosine"
                }
            };
        });

        memories.sort((a, b) => ((b.metadata.decayed_score as number) || 0) - ((a.metadata.decayed_score as number) || 0));

        const response: RecallResponse = {
            memories,
            metadata: {
                search_type: request.query ? "hybrid" : "vector",
                threshold_applied: threshold,
                countBeforeFiltering
            }
        };

        if (request.maxTokens) {
            return this.applyTokenBudget(memories, request.maxTokens);
        }

        return response;
    }

    /**
     * Store or Update a memory with semantic deduplication and atomic locking.
     */
    async store(request: StoreRequest): Promise<void> {
        const vector = await this.embedding.createVector(request.text);
        const userId = request.userId || request.userid || "anonymous";

        await this.lock.acquire(`store:${userId}`, async () => {
            const existing = await this.storage.find(vector, 1, userId);
            const threshold = this.config.thresholds.similarity;

            const match = existing[0];
            const similarity = match?.payload?._original_score ?? match?.score ?? 0;

            if (match && similarity >= threshold) {
                return this.handleMerge(match, request, userId, vector);
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

    async exportMemories(userId: string = "anonymous") {
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
            const points = chunk.map((m) => {
                const payload = { ...m.payload, userId: m.payload?.userId || "anonymous" };
                return {
                    id: m.id || uuidv4(),
                    vector: m.vector || [],
                    payload,
                };
            });
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
        return this.categoryService.detectCategory(text);
    }

    /**
     * Refines a list of retrieved memories against a chat history context
     * using the configured deduplication strategy (Jaccard, Cosine, or Substring).
     */
    public async refineContext(memories: MemoryEntry[], historyText: string): Promise<MemoryEntry[]> {
        const method = this.config.dedupMethod || "jaccard";
        const threshold = this.config.dedupThreshold ?? 0.5;
        const lowerHistory = historyText.toLowerCase();

        // Hoist expensive computations out of the per-memory loop
        let historyVector: number[] | undefined;
        if (method === "cosine") {
            historyVector = await this.embedding.createVector(historyText);
        }

        let historyTokens: Set<string> | undefined;
        if (method === "jaccard") {
            historyTokens = new Set(lowerHistory.split(/\s+/).filter((t: string) => t.length > 3));
        }

        const results = await Promise.all(memories.map(async (m: any) => {
            if (method === "substring") {
                return !lowerHistory.includes(m.text.toLowerCase()) ? m : null;
            }

            if (method === "jaccard") {
                const memoryTokens = new Set(m.text.toLowerCase().split(/\s+/).filter((t: string) => t.length > 3));
                let intersection = 0;
                memoryTokens.forEach(t => { if (historyTokens!.has(t)) intersection++; });
                const unionSize = new Set([...historyTokens!, ...memoryTokens]).size;
                const jaccard = unionSize === 0 ? 0 : intersection / unionSize;
                return jaccard < threshold ? m : null;
            }

            if (method === "cosine") {
                const similarity = this.embedding.cosineSimilarity(m.vector, historyVector!);
                return similarity < threshold ? m : null;
            }

            return m;
        }));

        return results.filter(m => m !== null) as MemoryEntry[];
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

    private async handleMerge(bestMatch: any, request: StoreRequest, userId: string, incomingVector: number[]) {
        const id = bestMatch.id.toString();
        const strategy = request.mergeStrategy || "recompute";

        let finalVector = incomingVector;
        let finalText = request.text;

        if (strategy === "average" && bestMatch.vector?.length === incomingVector.length) {
            finalVector = bestMatch.vector.map((val: number, i: number) => (val + incomingVector[i]) / 2);
            finalText = await this.consolidator.consolidate({
                oldText: bestMatch.payload.text,
                newText: request.text,
                category: request.category || bestMatch.payload.category
            });
        } else if (strategy === "replace") {
            // Use incomingVector and request.text (defaults)
        } else {
            // "recompute" strategy (default)
            finalText = await this.consolidator.consolidate({
                oldText: bestMatch.payload.text,
                newText: request.text,
                category: request.category || bestMatch.payload.category
            });
            finalVector = await this.embedding.createVector(finalText);
        }

        await this.storage.store(id, finalVector, {
            ...bestMatch.payload,
            text: finalText,
            category: request.category || bestMatch.payload.category,
            last_accessed: Date.now(),
            created_at: bestMatch.payload.created_at || Date.now(),
            strength: (bestMatch.payload.strength || 1) + 0.1,
            userId: userId,
            ...request.metadata
        });

        await this.audit.logReplacement({
            memoryId: id,
            category: request.category || bestMatch.payload.category,
            oldText: bestMatch.payload.text,
            newText: finalText,
            similarityScore: bestMatch.payload?._original_score ?? bestMatch.score,
            replacedAt: Date.now()
        });
    }
}
