import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock NeuralNexusCore BEFORE importing index.js
vi.mock('../src/core/NeuralNexusCore.js', () => {
  const MockCore = vi.fn();
  MockCore.prototype.initialize = vi.fn().mockResolvedValue(undefined);
  MockCore.prototype.recall = vi.fn().mockResolvedValue({ memories: [] });
  MockCore.prototype.store = vi.fn().mockResolvedValue(undefined);
  MockCore.prototype.consolidate = vi.fn().mockReturnValue('consolidated text');
  MockCore.prototype.extractCandidate = vi.fn().mockReturnValue('extracted text');
  
  // Return the mock constructor
  return {
    NeuralNexusCore: MockCore
  };
});

// Mock Audit Service to avoid sqlite3 issues
vi.mock('../src/core/ReplacementAuditService.js', () => ({
  ReplacementAuditService: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    logReplacement: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

import neuralNexusPlugin from '../index.js';
import { NeuralNexusCore } from '../src/core/NeuralNexusCore.js';

describe('Neural Nexus Plugin (OpenClaw Adapter)', () => {
  let mockApi: any;
  let mockCore: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi = {
      pluginConfig: {
        autoCapture: true,
        consolidation: true
      },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      registerTool: vi.fn(),
      registerService: vi.fn(),
      on: vi.fn(),
    };
    
    // Trigger register to instantiate core
    neuralNexusPlugin.register(mockApi);
    mockCore = vi.mocked(NeuralNexusCore).mock.instances[0];
  });

  it('registers tool, service and event listener', async () => {
    expect(mockApi.registerTool).toHaveBeenCalledWith(expect.objectContaining({ name: 'memory_recall' }));
    expect(mockApi.registerTool).toHaveBeenCalledWith(expect.objectContaining({ name: 'memory_store' }));
    expect(mockApi.registerService).toHaveBeenCalledWith(expect.objectContaining({ id: 'neural_nexus' }));
    expect(mockApi.on).toHaveBeenCalledWith('agent_end', expect.any(Function));
  });

  describe('memory_recall tool', () => {
    it('executes recall successfully', async () => {
      const tool = mockApi.registerTool.mock.calls.find((call: any) => call[0].name === 'memory_recall')[0];
      mockCore.recall.mockResolvedValue({ 
        memories: [{ text: 'remembered fact', category: 'fact', metadata: {} }] 
      });

      const result = await tool.execute('call-id', { query: 'test query', limit: 5 });

      expect(mockCore.recall).toHaveBeenCalledWith({ query: 'test query', limit: 5 });
      expect(result.details.results[0].text).toBe('remembered fact');
    });

    it('rejects empty query', async () => {
      const tool = mockApi.registerTool.mock.calls.find((call: any) => call[0].name === 'memory_recall')[0];
      await expect(tool.execute('call-id', { query: '', limit: 5 })).rejects.toThrow('query is required');
    });
  });

  describe('memory_store tool', () => {
    it('executes store successfully', async () => {
      const tool = mockApi.registerTool.mock.calls.find((call: any) => call[0].name === 'memory_store')[0];
      const result = await tool.execute('call-id', { text: 'new info', category: 'fact' });

      expect(mockCore.store).toHaveBeenCalledWith({ text: 'new info', category: 'fact' });
      expect(result.details.status).toBe('stored');
    });
  });

  describe('auto-capture', () => {
    it('captures new memory on agent_end', async () => {
      const onAgentEnd = mockApi.on.mock.calls.find((call: any) => call[0] === 'agent_end')[1];
      const event = {
        success: true,
        messages: [{ role: 'user', content: 'test message' }]
      };

      await onAgentEnd(event);

      expect(mockCore.consolidate).toHaveBeenCalled();
      expect(mockCore.store).toHaveBeenCalledWith({ text: 'consolidated text' });
      expect(mockApi.logger.info).toHaveBeenCalledWith(expect.stringContaining('Auto-captured'));
    });
  });

  describe('service lifecycle', () => {
    it('initializes core on start', async () => {
      const service = mockApi.registerService.mock.calls.find((call: any) => call[0].id === 'neural_nexus')[0];
      await service.start({ logger: mockApi.logger });

      expect(mockCore.initialize).toHaveBeenCalled();
      expect(mockApi.logger.info).toHaveBeenCalledWith(expect.stringContaining('initialized'));
    });
  });
});
