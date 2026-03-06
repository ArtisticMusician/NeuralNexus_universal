import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DecayEngine } from '../src/core/DecayEngine.js';

describe('DecayEngine', () => {
  let decayEngine: DecayEngine;

  beforeEach(() => {
    decayEngine = new DecayEngine();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns original score * strength when lambda is 0', () => {
    const score = 0.8;
    const strength = 1.2;
    const result = decayEngine.calculateScore(score, Date.now() - 1000, 0, strength);
    expect(result).toBeCloseTo(score * strength);
  });

  it('applies exponential decay when lambda > 0', () => {
    const score = 1.0;
    const lastAccessed = Date.now() - 1000; // 1 second ago
    const lambda = 0.5;
    const strength = 1.0;
    
    // Formula: (originalScore * strength) * Math.exp(-lambda * deltaT)
    // deltaT is in ms, so 1000ms
    // score = 1 * exp(-0.5 * 1000) -> this lambda in the plugin is very small, 
    // let's check the plugin's index.ts for typical lambda values.
    // fact: 1e-10
    
    const result = decayEngine.calculateScore(score, lastAccessed, lambda, strength);
    expect(result).toBe(score * strength * Math.exp(-lambda * 1000));
  });

  it('uses default strength of 1 if not provided', () => {
    const score = 0.9;
    const lastAccessed = Date.now();
    const result = decayEngine.calculateScore(score, lastAccessed, 0);
    expect(result).toBe(0.9);
  });

  it('decays more over longer time', () => {
    const score = 1.0;
    const lambda = 1e-5;
    const now = Date.now();
    
    const score1 = decayEngine.calculateScore(score, now - 1000, lambda);
    const score2 = decayEngine.calculateScore(score, now - 2000, lambda);
    
    expect(score1).toBeGreaterThan(score2);
  });
});

