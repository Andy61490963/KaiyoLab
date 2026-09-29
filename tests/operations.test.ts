import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readOperation, readBackupStatus } from '../src/lib/operations';

describe('維運紀錄僅顯示可驗證的完成時間', () => {
  it('備份期限與失敗提示保留最後成功時間，後續成功解除失敗狀態', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'kaiyo-backup-status-'));
    try {
      const now = Date.now();
      const success = new Date(now - 37 * 3_600_000).toISOString();
      await writeFile(
        path.join(directory, '.last-backup.json'),
        JSON.stringify({ operation: 'backup', completedAt: success }),
      );
      expect((await readBackupStatus(directory, 36, now)).health).toBe('overdue');
      expect((await readBackupStatus(directory, 48, now)).health).toBe('ok');
      await writeFile(
        path.join(directory, '.last-backup-failure.json'),
        JSON.stringify({ operation: 'backup', failedAt: new Date(now - 1000).toISOString() }),
      );
      expect(await readBackupStatus(directory, 36, now)).toMatchObject({
        health: 'failed',
        completedAt: success,
      });
      await writeFile(
        path.join(directory, '.last-backup.json'),
        JSON.stringify({ operation: 'backup', completedAt: new Date(now).toISOString() }),
      );
      expect((await readBackupStatus(directory, 36, now)).health).toBe('ok');
      expect((await readBackupStatus(directory, -1, now)).maxAgeHours).toBe(36);
      expect((await readBackupStatus(undefined, 36, now)).health).toBe('unknown');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
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
