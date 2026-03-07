import { QdrantClient } from "@qdrant/js-client-rest";

/**
 * StorageService handles interaction with the Qdrant Vector Database.
 * It implements Hybrid Search (Vector + BM25) and RRF (Reciprocal Rank Fusion).
 */
export class StorageService {
  private client: QdrantClient;

  constructor(private url: string, private collection: string, apiKey?: string) {
    this.client = new QdrantClient({ url, apiKey });
  }

  async initialize(vectorSize: number) {
    const collections = await this.client.getCollections();
    if (!collections.collections.some(c => c.name === this.collection)) {
      await this.client.createCollection(this.collection, {
        vectors: { size: vectorSize, distance: "Cosine" },
      });
      
      await this.client.createPayloadIndex(this.collection, {
        field_name: "userId",
        field_schema: "keyword",
      });

      await this.client.createPayloadIndex(this.collection, {
        field_name: "text",
        field_schema: "text",
      });
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
   * Combines Vector search and Keyword (Full-text) search results.
   */
  async find(vector: number[], limit: number, userId: string, query?: string, rrfK: number = 60) {
    // Strict userId filtering is enforced here
    const filter = { must: [{ key: "userId", match: { value: userId } }] };
    
    // 1. Vector Search
    const vectorResults = await this.client.search(this.collection, { 
      vector, 
      limit: limit * 2, 
      filter, 
      with_payload: true 
    });

    if (!query) return vectorResults.slice(0, limit);

    // 2. Keyword (BM25) Search
    const textFilter = {
      must: [
        ...filter.must,
        { key: "text", match: { text: query } }
      ]
    };

    const textResults = await this.client.scroll(this.collection, {
      filter: textFilter,
      limit: limit * 2,
      with_payload: true
    });

    // 3. Reciprocal Rank Fusion (RRF)
    // Formula: score = sum( 1 / (k + rank) )
    const scores: Record<string, { score: number; point: any }> = {};

    const applyRRF = (results: any[], weight: number = 1.0) => {
      results.forEach((res, index) => {
        const id = res.id.toString();
        const rank = index + 1;
        if (!scores[id]) {
          scores[id] = { score: 0, point: res };
        }
        scores[id].score += weight * (1 / (rrfK + rank));
      });
    };

    applyRRF(vectorResults);
    applyRRF(textResults.points || []);

    const merged = Object.values(scores)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => ({
        ...s.point,
        score: s.score // New RRF score
      }));

    return merged;
  }

  async scrollAll(userId: string): Promise<any[]> {
    const filter = { must: [{ key: "userId", match: { value: userId } }] };
    const allPoints: any[] = [];
    let nextOffset: any = undefined;

    do {
      const response: any = await this.client.scroll(this.collection, {
        filter,
        limit: 100,
        with_payload: true,
        offset: nextOffset,
      });
      allPoints.push(...response.points);
      nextOffset = response.next_page_offset;
    } while (nextOffset);

    return allPoints;
  }

  async storeBatch(points: any[]) {
    await this.client.upsert(this.collection, { points });
  }

  async updatePayload(id: string, partialPayload: Record<string, unknown>) {
    await this.client.setPayload(this.collection, {
      payload: partialPayload,
      points: [id]
    });
  }
}
