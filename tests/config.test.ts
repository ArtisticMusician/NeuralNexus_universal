import { describe, it, expect } from "vitest";
import { normalizeMemoryConfig } from "../src/core/config.js";

describe("normalizeMemoryConfig", () => {
  it("uses defaults for empty config", () => {
    const config = normalizeMemoryConfig({});
    expect(config.embedding.model).toBe("Xenova/bge-small-en-v1.5");
    expect(config.thresholds.similarity).toBe(0.95);
    expect(config.decay.defaultLambda).toBe(1e-10);
    expect(config.search.rrfK).toBe(60);
  });

  it("overrides values from input", () => {
    const config = normalizeMemoryConfig({
      thresholds: { similarity: 0.8 },
      decay: { defaultLambda: 1e-5 },
      search: { rrfK: 10 }
    });
    expect(config.thresholds.similarity).toBe(0.8);
    expect(config.decay.defaultLambda).toBe(1e-5);
    expect(config.search.rrfK).toBe(10);
  });
});
