import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReplacementAuditService } from '../src/core/ReplacementAuditService.js';

vi.mock("sqlite", () => ({
  open: vi.fn(),
}));

vi.mock("sqlite3", () => ({
  default: {
    Database: vi.fn(),
  },
}));

describe('ReplacementAuditService', () => {
  let service: ReplacementAuditService;
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = {
      exec: vi.fn(),
      run: vi.fn(),
      close: vi.fn(),
      all: vi.fn().mockResolvedValue([]),
    };
    service = new ReplacementAuditService(true, './test.sqlite');
  });

  it('does nothing on initialize when disabled', async () => {
    const disabled = new ReplacementAuditService(false, './test.sqlite');
    await expect(disabled.initialize()).resolves.toBeUndefined();
    expect((disabled as any).db).toBeNull();
  });

  it('logs replacement to database when db is initialized', async () => {
    (service as any).db = mockDb;
    const record = {
      memoryId: 'mem-123',
      category: 'preference',
      oldText: 'I like apples',
      newText: 'I like oranges',
      similarityScore: 0.95,
      replacedAt: 123456789,
    };

    await service.logReplacement(record);

    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO memory_replacements'),
      record.memoryId,
      record.category,
      record.oldText,
      record.newText,
      record.similarityScore,
      record.replacedAt,
    );
  });

  it('does not log when disabled', async () => {
    const disabled = new ReplacementAuditService(false, './test.sqlite');
    (disabled as any).db = mockDb;

    await disabled.logReplacement({
      memoryId: '1',
      category: 'fact',
      oldText: 'old',
      newText: 'new',
      similarityScore: 0.95,
      replacedAt: Date.now(),
    });

    expect(mockDb.run).not.toHaveBeenCalled();
  });

  it('closes database connection', async () => {
    (service as any).db = mockDb;
    await service.close();
    expect(mockDb.close).toHaveBeenCalled();
    expect((service as any).db).toBeNull();
  });
});
