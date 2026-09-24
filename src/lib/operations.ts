import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export interface OperationRecord {
  status: 'recorded' | 'missing' | 'unconfigured' | 'invalid';
  completedAt: string | null;
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
  backup: OperationRecord;
  restore: OperationRecord;
}
