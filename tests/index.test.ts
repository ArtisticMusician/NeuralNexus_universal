import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import neuralNexusPlugin from '../index.js';
import { EmbeddingService } from '../src/core/EmbeddingService.js';
import { StorageService } from '../src/core/StorageService.js';
import { ReplacementAuditService } from '../src/core/ReplacementAuditService.js';
import { NeuralNexusCore as NeuralNexus } from '../src/core/NeuralNexusCore.js';

const { mocks } = vi.hoisted(() => ({
    mocks: {
        embeddings: {
            initialize: vi.fn().mockResolvedValue(undefined),
            getDim: vi.fn().mockReturnValue(128),
            createVector: vi.fn().mockResolvedValue(new Array(128).fill(0.1)),
        },
        storage: {
            initialize: vi.fn().mockResolvedValue(undefined),
            find: vi.fn().mockResolvedValue([]),
            store: vi.fn().mockResolvedValue(undefined),
            updatePayload: vi.fn().mockResolvedValue(undefined),
        },
        audit: {
            initialize: vi.fn().mockResolvedValue(undefined),
            logReplacement: vi.fn().mockResolvedValue(undefined),
            close: vi.fn().mockResolvedValue(undefined),
        },
        nexus: {
            consolidate: vi.fn().mockReturnValue('consolidated text'),
            extractCandidate: vi.fn().mockReturnValue('extracted text'),
            detectCategory: vi.fn().mockReturnValue('fact'),
        }
    }
}));

// Mock the modules by returning objects that match the exported shape
vi.mock('../src/core/EmbeddingService.js', () => ({
    EmbeddingService: function() { return mocks.embeddings; }
}));
vi.mock('../src/core/StorageService.js', () => ({
    StorageService: function() { return mocks.storage; }
}));
vi.mock('../src/core/ReplacementAuditService.js', () => ({
    ReplacementAuditService: function() { return mocks.audit; }
}));
vi.mock('../src/core/NeuralNexusCore.js', () => ({
    NeuralNexusCore: function() { return mocks.nexus; }
}));

describe('Neural Nexus Plugin Integration', () => {
  let mockApi: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockApi = {
      pluginConfig: {},
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      registerTool: vi.fn(),
      registerService: vi.fn(),
      on: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('registers tool, service and event listener', async () => {
    await neuralNexusPlugin.register(mockApi);

    expect(mockApi.registerTool).toHaveBeenCalledWith(expect.objectContaining({ name: 'memory_recall' }));
    expect(mockApi.registerService).toHaveBeenCalledWith(expect.objectContaining({ id: 'neural_nexus' }));
    expect(mockApi.on).toHaveBeenCalledWith('agent_end', expect.any(Function));
  });

  describe('memory_recall tool', () => {
    it('executes recall successfully and applies reinforcement', async () => {
      await neuralNexusPlugin.register(mockApi);
      const tool = mockApi.registerTool.mock.calls.find((call: any) => call[0].name === 'memory_recall')[0];

      const now = Date.now();
      vi.setSystemTime(now);

      mocks.storage.find.mockResolvedValue([
        {
          id: '1',
          score: 0.9,
          payload: { text: 'remembered fact', category: 'fact', strength: 1, lambda: 1e-10, last_accessed: now - 1000 }
        }
      ]);

      const result = await tool.execute('call-id', { query: 'test query', limit: 5 });

      expect(mocks.storage.find).toHaveBeenCalled();
      expect(result.details.results[0].text).toBe('remembered fact');
      
      // Reinforcement check
      expect(mocks.storage.updatePayload).toHaveBeenCalledWith('1', expect.objectContaining({
        strength: 1.05,
        lambda: 1e-10 * 0.98,
        last_accessed: now
      }));
    });

    it('rejects empty query', async () => {
        await neuralNexusPlugin.register(mockApi);
        const tool = mockApi.registerTool.mock.calls.find((call: any) => call[0].name === 'memory_recall')[0];
  
        await expect(tool.execute('call-id', { query: '', limit: 5 })).rejects.toThrow('query is required');
    });

    it('filters results by threshold and decay', async () => {
        await neuralNexusPlugin.register(mockApi);
        const tool = mockApi.registerTool.mock.calls.find((call: any) => call[0].name === 'memory_recall')[0];

        const now = Date.now();
        vi.setSystemTime(now);

        mocks.storage.find.mockResolvedValue([
            { id: 'fresh', score: 0.5, payload: { text: 'fresh', category: 'fact', lambda: 0, last_accessed: now } },
            { id: 'stale', score: 0.9, payload: { text: 'stale', category: 'fact', lambda: 1, last_accessed: now - 100000 } }
        ]);

        const result = await tool.execute('call-id', { query: 'test', limit: 5 });
        expect(result.details.results).toHaveLength(1);
        expect(result.details.results[0].text).toBe('fresh');
    });
  });

  describe('auto-capture', () => {
    it('captures new memory on agent_end', async () => {
      await neuralNexusPlugin.register(mockApi);
      const onAgentEnd = mockApi.on.mock.calls.find((call: any) => call[0] === 'agent_end')[1];

      const event = {
        success: true,
        messages: [{ role: 'user', content: 'test' }]
      };

      mocks.nexus.consolidate.mockReturnValue('consolidated content');
      mocks.nexus.detectCategory.mockReturnValue('fact');

      await onAgentEnd(event);

      expect(mocks.storage.store).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({ 
            text: 'consolidated content', 
            category: 'fact'
        })
      );
    });

    it('ignores failed agent_end events', async () => {
        await neuralNexusPlugin.register(mockApi);
        const onAgentEnd = mockApi.on.mock.calls.find((call: any) => call[0] === 'agent_end')[1];
  
        const event = {
          success: false,
          messages: [{ role: 'user', content: 'test' }]
        };
  
        await onAgentEnd(event);
        expect(mocks.storage.store).not.toHaveBeenCalled();
    });

    it('overwrites preference if similar one exists', async () => {
        await neuralNexusPlugin.register(mockApi);
        const onAgentEnd = mockApi.on.mock.calls.find((call: any) => call[0] === 'agent_end')[1];
  
        const event = {
          success: true,
          messages: [{ role: 'user', content: 'test' }]
        };

        mocks.nexus.consolidate.mockReturnValue('new preference');
        mocks.nexus.detectCategory.mockReturnValue('preference');
  
        mocks.storage.find.mockResolvedValue([
          {
            id: 'pref-1',
            score: 0.95,
            payload: { text: 'old preference', category: 'preference' }
          }
        ]);
  
        await onAgentEnd(event);
  
        expect(mocks.storage.store).toHaveBeenCalledWith(
          'pref-1',
          expect.any(Array),
          expect.objectContaining({ text: 'new preference', category: 'preference' })
        );
        expect(mocks.audit.logReplacement).toHaveBeenCalled();
      });
  });

  describe('service lifecycle', () => {
    it('initializes services on start', async () => {
        await neuralNexusPlugin.register(mockApi);
        const service = mockApi.registerService.mock.calls.find((call: any) => call[0].id === 'neural_nexus')[0];
        
        const mockCtx = { logger: mockApi.logger };
        await service.start(mockCtx);

        expect(mocks.embeddings.initialize).toHaveBeenCalled();
        expect(mocks.storage.initialize).toHaveBeenCalledWith(128);
        expect(mocks.audit.initialize).toHaveBeenCalled();
        expect(mockApi.logger.info).toHaveBeenCalledWith('Neural Nexus plugin active');
    });

    it('closes audit service on stop', async () => {
        await neuralNexusPlugin.register(mockApi);
        const service = mockApi.registerService.mock.calls.find((call: any) => call[0].id === 'neural_nexus')[0];
        
        await service.stop();
        expect(mocks.audit.close).toHaveBeenCalled();
    });
  });
});
