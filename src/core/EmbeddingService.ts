import { pipeline, FeatureExtractionPipeline, AutoTokenizer } from "@xenova/transformers";

export class EmbeddingService {
  private model: FeatureExtractionPipeline | null = null;
  private tokenizer: any = null;
  private dimension: number | null = null;

  constructor(
    private modelName: string, 
    private device: "cuda" | "cpu"
  ) {}

  async initialize() {
    try {
      this.model = await pipeline("feature-extraction", this.modelName, {
        device: this.device === "cuda" ? "cuda:0" : "cpu",
      } as any);
      
      this.tokenizer = await AutoTokenizer.from_pretrained(this.modelName);

      // Verification pass to get dimensions
      const testText = this.prepareText("initialization test");
      const dummy = await this.model!(testText, { pooling: "mean", normalize: true });
      this.dimension = dummy.data.length;
      
    } catch (err) {
      throw new Error(`EmbeddingService: Initialization failed for ${this.modelName}. ${err}`);
    }
  }

  private prepareText(text: string): string {
    const isE5 = this.modelName.toLowerCase().includes("e5");
    if (isE5 && !text.startsWith("query: ")) {
      return `query: ${text}`;
    }
    return text;
  }

  async createVector(text: string): Promise<number[]> {
    if (!this.model) {
      throw new Error("EmbeddingService: createVector called before initialization.");
    }

    try {
      const formattedText = this.prepareText(text);
      const result = await this.model!(formattedText, { 
        pooling: "mean", 
        normalize: true 
      });
      
      return Array.from(result.data) as number[];
    } catch (err) {
      console.error(`EmbeddingService: Vector generation failed: ${err}`);
      throw err;
    }
  }

  async countTokens(text: string): Promise<number> {
    if (!this.tokenizer) {
      await this.initialize();
    }
    const { input_ids } = await this.tokenizer(text);
    return input_ids.size;
  }

  getDim() {
    return this.dimension;
  }
}
