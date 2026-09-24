import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readOperation } from '../src/lib/operations';

describe('維運紀錄僅顯示可驗證的完成時間', () => {
  it('區分未設定、缺少、有效、未來與損毀的紀錄', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'kaiyo-operations-'));
    try {
      expect((await readOperation(undefined, 'backup')).status).toBe('unconfigured');
      expect((await readOperation(directory, 'backup')).status).toBe('missing');
      const file = path.join(directory, '.last-backup.json');
      await writeFile(
        file,
        JSON.stringify({ operation: 'backup', completedAt: '2026-01-01T00:00:00Z' }),
      );
      expect(await readOperation(directory, 'backup')).toEqual({
        status: 'recorded',
        completedAt: '2026-01-01T00:00:00.000Z',
      });
      for (const value of [
        '{',
        JSON.stringify({ operation: 'restore', completedAt: '2026-01-01' }),
        JSON.stringify({ operation: 'backup', completedAt: '3000-01-01' }),
        JSON.stringify({ operation: 'backup', completedAt: '123' }),
        JSON.stringify({ operation: 'backup', completedAt: '2026-02-30T12:00:00Z' }),
        'x'.repeat(1025),
      ]) {
        await writeFile(file, value);
        expect((await readOperation(directory, 'backup')).status).toBe('invalid');
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
