import { QdrantClient } from "@qdrant/js-client-rest";

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

  async find(vector: number[], limit: number, userId?: string, query?: string) {
    const filter = userId ? { must: [{ key: "userId", match: { value: userId } }] } : undefined;
    
    const vectorResults = await this.client.search(this.collection, { 
      vector, 
      limit, 
      filter, 
      with_payload: true 
    });

    if (!query) return vectorResults;

    const textFilter = {
      must: [
        ...(filter?.must || []),
        { key: "text", match: { text: query } }
      ]
    };

    const textResults = await this.client.scroll(this.collection, {
      filter: textFilter,
      limit,
      with_payload: true
    });

    const seenIds = new Set(vectorResults.map(r => r.id));
    const merged = [...vectorResults];

    for (const res of (textResults.points || [])) {
      if (!seenIds.has(res.id)) {
        merged.push({
          id: res.id,
          score: 0.5,
          payload: res.payload,
          version: 0
        } as any);
      }
    }

    return merged.slice(0, limit);
  }

  async scrollAll(userId?: string): Promise<any[]> {
    const filter = userId ? { must: [{ key: "userId", match: { value: userId } }] } : undefined;
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
