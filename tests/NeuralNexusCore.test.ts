import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NeuralNexusCore as NeuralNexus } from '../src/core/NeuralNexusCore.js';
import { normalizeMemoryConfig } from '../src/core/config.js';

vi.mock('../src/core/EmbeddingService.js', () => {
  return {
    EmbeddingService: vi.fn().mockImplementation(function() {
      return {
        initialize: vi.fn().mockResolvedValue(undefined),
        getDim: vi.fn().mockReturnValue(128),
        createVector: vi.fn().mockResolvedValue([0.1, 0.2]),
        countTokens: vi.fn().mockImplementation((text: string) => Promise.resolve(text.split(' ').length)),
      };
    }),
  };
});

vi.mock('../src/core/StorageService.js', () => {
  return {
    StorageService: vi.fn().mockImplementation(function() {
      return {
        initialize: vi.fn().mockResolvedValue(undefined),
        find: vi.fn().mockResolvedValue([
          { id: '1', score: 0.9, payload: { text: 'memory one', last_accessed: Date.now() } },
          { id: '2', score: 0.8, payload: { text: 'memory two is longer', last_accessed: Date.now() } },
          { id: '3', score: 0.7, payload: { text: 'three', last_accessed: Date.now() } },
        ]),
        store: vi.fn().mockResolvedValue(undefined),
        updatePayload: vi.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

vi.mock('../src/core/ReplacementAuditService.js', () => {
  return {
    ReplacementAuditService: vi.fn().mockImplementation(function() {
      return {
        initialize: vi.fn().mockResolvedValue(undefined),
        getLogs: vi.fn().mockResolvedValue([]),
      };
    }),
  };
});

describe('NeuralNexusCore', () => {
  let neuralNexus: NeuralNexus;

  beforeEach(() => {
    vi.clearAllMocks();
    neuralNexus = new NeuralNexus(normalizeMemoryConfig({}));
  });

  describe('recall', () => {
    it('returns all memories if no maxTokens is specified', async () => {
      const result = await neuralNexus.recall({ query: 'test' });
      expect(result.memories).toHaveLength(3);
    });

    it('applies token budget (maxTokens)', async () => {
      // 'memory one' -> 2 tokens
      // 'memory two is longer' -> 4 tokens
      // 'three' -> 1 token
      
      const result = await neuralNexus.recall({ query: 'test', maxTokens: 3 });
      
      // Should include 'memory one' (2 tokens). 
      // Next is 'memory two is longer' (4 tokens) -> exceeds budget (2+4=6 > 3).
      // So it should only have 1 memory.
      expect(result.memories).toHaveLength(1);
      expect(result.memories[0].text).toBe('memory one');
    });

    it('respects exact token limit', async () => {
      const result = await neuralNexus.recall({ query: 'test', maxTokens: 6 });
      // 'memory one' (2) + 'memory two is longer' (4) = 6.
      expect(result.memories).toHaveLength(2);
    });
  });

  describe('normalizeWhitespace', () => {
    it('removes extra whitespace and trims', () => {
      const input = '  This   is    a test  \n\n  ';
      const result = (neuralNexus as any).constructor.normalizeWhitespace(input);
      expect(result).toBe('This is a test');
    });
  });

  describe('extractCandidate', () => {
    it('extracts the last user message text', () => {
      const messages = [
        { role: 'user', content: 'Hello there' },
        { role: 'assistant', content: 'Hi! How can I help?' },
        { role: 'user', content: 'Tell me a long fact about space, at least twenty-five characters long.' },
      ];
      const result = neuralNexus.extractCandidate(messages);
      expect(result).toBe('Tell me a long fact about space, at least twenty-five characters long.');
    });

    it('returns null if last user message is too short', () => {
      const messages = [{ role: 'user', content: 'Short' }];
      const result = neuralNexus.extractCandidate(messages);
      expect(result).toBeNull();
    });

    it('truncates message if it is too long', () => {
      const longMessage = 'A'.repeat(2000);
      const messages = [{ role: 'user', content: longMessage }];
      const result = neuralNexus.extractCandidate(messages);
      expect(result?.length).toBe(1200);
    });

    it('handles content as array of objects', () => {
      const messages = [
        { role: 'user', content: [{ type: 'text', text: 'Multi-part message that should be long enough.' }] },
      ];
      const result = neuralNexus.extractCandidate(messages);
      expect(result).toBe('Multi-part message that should be long enough.');
    });
  });

  describe('consolidate', () => {
    it('consolidates multiple user messages', () => {
      const messages = [
        { role: 'user', content: 'First message that is long enough.' },
        { role: 'assistant', content: 'Acknowledged' },
        { role: 'user', content: 'Second message that is also long.' },
      ];
      // threshold is 2, so it should consolidate
      const result = neuralNexus.consolidate(messages, 2);
      expect(result).toBe('First message that is long enough. Second message that is also long.');
    });

    it('returns single extractCandidate result if under threshold', () => {
      const messages = [
        { role: 'user', content: 'First message that is long enough.' },
        { role: 'assistant', content: 'Acknowledged' },
        { role: 'user', content: 'Second message that is also long.' },
      ];
      // threshold is 10, so it shouldn't consolidate
      const result = neuralNexus.consolidate(messages, 10);
      expect(result).toBe('Second message that is also long.');
    });

    it('deduplicates messages', () => {
      const messages = [
        { role: 'user', content: 'Repeated message that is long enough.' },
        { role: 'user', content: 'Repeated message that is long enough.' },
      ];
      const result = neuralNexus.consolidate(messages, 2);
      expect(result).toBe('Repeated message that is long enough.');
    });
  });

  describe('detectCategory', () => {
    it('detects "preference" based on keywords', () => {
      expect(neuralNexus.detectCategory('I prefer apples')).toBe('preference');
      expect(neuralNexus.detectCategory('I like coding')).toBe('preference');
      expect(neuralNexus.detectCategory('I dislike noise')).toBe('preference');
    });

    it('detects "decision" based on keywords', () => {
      expect(neuralNexus.detectCategory('I decided to go home')).toBe('decision');
      expect(neuralNexus.detectCategory('I chose the blue one')).toBe('decision');
      expect(neuralNexus.detectCategory('Instead of coffee, I took tea')).toBe('decision');
    });

    it('detects "entity" based on keywords', () => {
      expect(neuralNexus.detectCategory('This is a test')).toBe('entity');
      expect(neuralNexus.detectCategory('The project is called Neural Nexus')).toBe('entity');
    });

    it('defaults to "fact"', () => {
      expect(neuralNexus.detectCategory('The earth is round')).toBe('fact');
    });
  });
});
