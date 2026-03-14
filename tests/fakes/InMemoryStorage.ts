export class InMemoryStorageFake {
  private points: any[] = [];

  constructor() {
    this.points = [];
  }

  // --- Helper Methods (Internal) ---

  private cosineSim(v1: number[], v2: number[]) {
    if (!v1 || !v2 || v1.length !== v2.length) return 0;
    let dot = 0, m1 = 0, m2 = 0;
    for(let i=0; i<v1.length; i++) {
      dot += v1[i]*v2[i];
      m1 += v1[i]*v1[i];
      m2 += v2[i]*v2[i];
    }
    if (m1 === 0 || m2 === 0) return 0;
    return dot / (Math.sqrt(m1) * Math.sqrt(m2));
  }

  // --- StorageService Interface (For NeuralNexusCore tests) ---

  async initialize(dim: number) {}

  async store(id: string, vector: number[], payload: any) {
    this.points = this.points.filter(p => p.id !== id);
    this.points.push({ id, vector, payload });
  }

  async storeBatch(batch: any[]) {
    for (const p of batch) {
      await this.store(p.id, p.vector, p.payload);
    }
  }

  async getPoint(id: string) {
    return this.points.find(p => p.id === id) || null;
  }

  async find(vector: number[], limit: number, userid: string = "anonymous", query?: string, rrfK: number = 60) {
    let filtered = this.points.filter(p => p.payload.userid === userid);

    const vectorPass = filtered.map(p => ({
      ...p,
      score: this.cosineSim(vector, p.vector)
    })).sort((a, b) => b.score - a.score);

    let keywordPass: any[] = [];
    if (query) {
      const q = query.toLowerCase();
      keywordPass = filtered.filter(p => 
        (p.payload.text || "").toLowerCase().includes(q)
      ).map(p => ({
        ...p,
        score: 1.0 
      }));
    }

    const scores: Record<string, { score: number; point: any }> = {};
    const applyRRF = (results: any[]) => {
      results.forEach((res, index) => {
        const id = res.id;
        if (!scores[id]) {
          const pointWithOriginal = JSON.parse(JSON.stringify(res));
          if (pointWithOriginal.payload._original_score === undefined) {
            pointWithOriginal.payload._original_score = res.score;
          }
          scores[id] = { score: 0, point: pointWithOriginal };
        }
        scores[id].score += (1 / (rrfK + index + 1));
      });
    };

    applyRRF(vectorPass);
    if (query) applyRRF(keywordPass);

    return Object.values(scores)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => ({ ...s.point, score: s.score }));
  }

  async scrollAll(userid: string) {
    return this.points.filter(p => p.payload.userid === userid);
  }

  async updatePayload(id: string, partial: any) {
    const p = this.points.find(p => p.id === id);
    if (p) p.payload = { ...p.payload, ...partial };
  }

  async updateAccessTime(id: string) {
      await this.updatePayload(id, { last_accessed: Date.now() });
  }

  // --- Qdrant Client Interface (For StorageService tests) ---

  async getCollections() { return { collections: [] }; }
  async getCollection() { return { config: { params: { vectors: { size: 384 } } } }; }
  async createCollection() {}
  async createPayloadIndex() {}
  async upsert(collection: string, options: any) {
    for (const p of options.points) {
        await this.store(p.id, p.vector, p.payload);
    }
  }
  async retrieve(collection: string, options: { ids: string[] }) {
      return this.points.filter(p => options.ids.includes(p.id));
  }
  async search(collection: string, options: any) {
    const userid = options.filter?.must?.find((m: any) => m.key === 'userid')?.match?.value || "anonymous";
    // For raw search, we don't want RRF, just the vector result
    return (this.points.filter(p => p.payload.userid === userid).map(p => ({
        ...p,
        score: this.cosineSim(options.vector, p.vector)
    })).sort((a, b) => b.score - a.score).slice(0, options.limit));
  }
  async scroll(collection: string, options: any) {
      const userid = options.filter?.must?.find((m: any) => m.key === 'userid')?.match?.value || "anonymous";
      const textQuery = options.filter?.must?.find((m: any) => m.key === 'text')?.match?.text;
      let points = this.points.filter(p => p.payload.userid === userid);
      if (textQuery) {
          points = points.filter(p => (p.payload.text || "").toLowerCase().includes(textQuery.toLowerCase()));
      }
      return { points: points.slice(0, options.limit || 100), next_page_offset: null };
  }
  async setPayload(collection: string, options: any) {
      for (const id of options.points) {
          await this.updatePayload(id, options.payload);
      }
  }
}
