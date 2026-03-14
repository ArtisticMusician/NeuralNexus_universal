import { QdrantClient } from "@qdrant/js-client-rest";

export class StorageService {
    private client: QdrantClient;

    constructor(private url: string, private collection: string, apiKey?: string) {
        this.client = new QdrantClient({ url, apiKey, checkCompatibility: false });
    }

    async initialize(vectorSize: number) {
        const collections = await this.client.getCollections();
        if (!collections.collections.some(c => c.name === this.collection)) {
            await this.client.createCollection(this.collection, {
                vectors: { size: vectorSize, distance: "Cosine" },
            });

            await this.client.createPayloadIndex(this.collection, {
                field_name: "userid",
                field_schema: "keyword",
            });

            // Full-text index for the "text" field
            await this.client.createPayloadIndex(this.collection, {
                field_name: "text",
                field_schema: {
                    type: "text",
                    tokenizer: "word",
                    min_token_len: 2,
                    max_token_len: 20,
                    lowercase: true
                },
            });
        } else {
            // Verify dimensions
            const info = await this.client.getCollection(this.collection);
            const existingSize = (info.config.params.vectors as any).size;
            if (existingSize !== vectorSize) {
                throw new Error(`[StorageService] Dimension mismatch: Collection '${this.collection}' has size ${existingSize}, but model requires ${vectorSize}.`);
            }
        }
    }

    async store(id: string, vector: number[], payload: any) {
        await this.client.upsert(this.collection, { points: [{ id, vector, payload }] });
    }

    async getPoint(id: string) {
        const points = await this.client.retrieve(this.collection, { ids: [id], with_payload: true });
        return points.length > 0 ? points[0] : null;
    }

    /**
     * Hybrid Search using Reciprocal Rank Fusion (RRF).
     * Pass 1: Semantic Vector Search
     * Pass 2: Native Full-Text Search (BM25-like via Qdrant)
     */
    async find(vector: number[], limit: number, userid: string = "anonymous", query?: string, rrfK: number = 60, alpha: number = 0.7) {
        try {
            const filter = { must: [{ key: "userid", match: { value: userid } }] };

            // Pass 1: Vector (semantic similarity)
            const vectorPromise = this.client.search(this.collection, {
                vector, limit: limit * 2, filter, with_payload: true
            });

            // Pass 2: Keyword (Native Qdrant Text Search)
            let textPromise: Promise<any[]> = Promise.resolve([]);
            
            if (query) {
                // We use the 'scroll' API with a text filter to simulate a keyword search 
                // since Qdrant doesn't have a dedicated "rank by text relevance" endpoint 
                // without vectors, but we can filter by it.
                // 
                // HOWEVER, for true hybrid search in Qdrant without using a second vector model (sparse vectors),
                // we rely on the fact that we can filter. To get a "score", we unfortunately still have to 
                // do some client-side work OR use sparse vectors. 
                //
                // Given the constraints (no sparse model loaded), we will perform a search
                // using the vector but heavily filtered by text, OR just scroll with text match.
                //
                // Qdrant 'scroll' does not return scores. 
                // To get a "score" for text match without sparse vectors, we must use the client-side scoring 
                // we had before, BUT we must rely on Qdrant to do the heavy lifting of *filtering*.
                
                const textFilter = {
                    must: [
                        { key: "userid", match: { value: userid } },
                        { key: "text", match: { text: query } } // Native full-text match
                    ]
                };

                // We fetch more candidates from the text-match side
                textPromise = this.client.scroll(this.collection, {
                    filter: textFilter,
                    limit: limit * 2,
                    with_payload: true
                }).then(res => res.points);
            }

            const [vectorResults, textResults] = await Promise.all([vectorPromise, textPromise]);

            // Preserve original cosine scores from vector search
            vectorResults.forEach((res: any) => {
                res.payload = res.payload || {};
                res.payload._original_score = res.score;
            });

            // Score the text results (Synthetic TF)
            // Since Qdrant scroll doesn't return a score, we calculate a basic overlap score.
            // This is much faster now because we only process items that ALREADY matched the index.
            if (query && textResults.length > 0) {
                const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
                textResults.forEach((res: any) => {
                    const text = (res.payload?.text || "").toLowerCase();
                    let hitCount = 0;
                    queryTerms.forEach(term => { if (text.includes(term)) hitCount++; });
                    
                    const synthetic = hitCount / (queryTerms.length || 1);
                    res._local_score = synthetic;
                    
                    // Store original score for metadata
                    res.payload = res.payload || {};
                    res.payload._original_score = synthetic;
                });
                // Sort by our synthetic score
                textResults.sort((a: any, b: any) => b._local_score - a._local_score);
            }

            // Hybrid Fusion Logic (RRF)
            const fusionLimit = limit * 2;
            const scores: Record<string, { score: number; point: any }> = {};

            const applyRRF = (results: any[], weight: number) => {
                results.slice(0, fusionLimit).forEach((res, index) => {
                    const id = res.id.toString();
                    const rank = index + 1;
                    const rrfScore = weight * (1.0 / (rrfK + rank));
                    if (!scores[id]) {
                        scores[id] = { score: 0, point: res };
                    }
                    scores[id].score += rrfScore;
                });
            };

            applyRRF(vectorResults, alpha);
            if (query && textResults.length > 0) {
                applyRRF(textResults, 1 - alpha);
            }

            const maxTheoretical = alpha * (1 / (rrfK + 1)) + (1 - alpha) * (1 / (rrfK + 1));

            return Object.values(scores)
                .sort((a, b) => b.score - a.score)
                .slice(0, limit)
                .map(s => {
                    const point = { ...s.point, score: s.score / maxTheoretical };
                    if (point.payload) {
                        point.payload._original_score = point.payload._original_score ?? point.score;
                    } 
                    return point;
                });

        } catch (err) {
            console.error(`[StorageService] Search failed: ${err}`);
            return [];
        }
    }

    async scrollAll(userid: string = "anonymous"): Promise<any[]> {
        const filter = { must: [{ key: "userid", match: { value: userid } }] };
        const allPoints: any[] = [];
        let nextOffset: string | number | Record<string, unknown> | null | undefined = undefined;

        do {
            const response: any = await this.client.scroll(this.collection, {
                filter,
                limit: 100,
                with_payload: true,
                offset: nextOffset ?? undefined,
            });
            allPoints.push(...response.points);
            nextOffset = response.next_page_offset;
        } while (nextOffset);

        return allPoints;
    }

    async storeBatch(points: { id: string, vector: number[], payload: any }[]) {
        await this.client.upsert(this.collection, { points });
    }

    async updatePayload(id: string, partialPayload: Record<string, unknown>) {
        await this.client.setPayload(this.collection, {
            payload: partialPayload,
            points: [id]
        });
    }

    async updateAccessTime(id: string) {
        await this.updatePayload(id, { last_accessed: Date.now() });
    }
}