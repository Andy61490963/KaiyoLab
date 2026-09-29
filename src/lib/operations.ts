import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export interface OperationRecord {
  status: 'recorded' | 'missing' | 'unconfigured' | 'invalid';
  completedAt: string | null;
}

export interface BackupRecord extends OperationRecord {
  health?: 'ok' | 'overdue' | 'failed' | 'unknown';
  dueAt?: string | null;
  maxAgeHours?: number;
  lastFailureAt?: string | null;
}

export async function readBackupStatus(
  directory: string | undefined,
  maxAgeHours = 36,
  now = Date.now(),
): Promise<BackupRecord> {
  const record = await readOperation(directory, 'backup');
  const hours =
    Number.isFinite(maxAgeHours) && maxAgeHours >= 1 && maxAgeHours <= 8760 ? maxAgeHours : 36;
  const completed = record.completedAt ? Date.parse(record.completedAt) : null;
  const dueAt = completed === null ? null : new Date(completed + hours * 3_600_000).toISOString();
  let lastFailureAt: string | null = null;
  if (directory) {
    try {
      const file = path.join(directory, '.last-backup-failure.json');
      if ((await stat(file)).size <= 1024) {
        const value = JSON.parse(await readFile(file, 'utf8'));
        const failure = Date.parse(value.failedAt);
        if (
          value.operation === 'backup' &&
          typeof value.failedAt === 'string' &&
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value.failedAt) &&
          Number.isFinite(failure) &&
          failure <= now + 60_000 &&
          new Date(failure).toISOString().slice(0, 19) === value.failedAt.slice(0, 19)
        ) {
          lastFailureAt = new Date(failure).toISOString();
        }
      }
    } catch {
      /* 缺少失敗紀錄不代表最近一次備份失敗 */
    }
  }
  const failed =
    lastFailureAt !== null && (completed === null || Date.parse(lastFailureAt) >= completed);
  const health = failed
    ? 'failed'
    : dueAt === null
      ? 'unknown'
      : now > Date.parse(dueAt)
        ? 'overdue'
        : 'ok';
  return { ...record, health, dueAt, maxAgeHours: hours, lastFailureAt };
}

export async function readOperation(
  directory: string | undefined,
  operation: 'backup' | 'restore',
): Promise<OperationRecord> {
  if (!directory) return { status: 'unconfigured', completedAt: null };
  try {
    const file = path.join(directory, `.last-${operation}.json`);
    if ((await stat(file)).size > 1024) return { status: 'invalid', completedAt: null };
    const value = JSON.parse(await readFile(file, 'utf8'));
    const date = new Date(value.completedAt);
    if (
      value.operation !== operation ||
      typeof value.completedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value.completedAt) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 19) !== value.completedAt.slice(0, 19) ||
      date.getTime() > Date.now() + 60_000
    ) {
      return { status: 'invalid', completedAt: null };
    }
    return { status: 'recorded', completedAt: date.toISOString() };
  } catch (error) {
    return {
      status: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'invalid',
      completedAt: null,
    };
  }
}

export interface SystemReport {
  checkedAt: string;
  revision: string;
  runtime: string;
  database: { available: boolean; latencyMs: number };
  storage: { writable: boolean; images: number | null; bytes: number | null };
  backup: BackupRecord;
  restore: OperationRecord;
}
