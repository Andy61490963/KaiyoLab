import { Worker } from 'node:worker_threads';
import path from 'node:path';

export const DIAGRAM_REVIEW_LIMIT = 20;
let running = 0;

// 已先通過 diagramProblem 的短文字才送進隔離 worker，超時即終止
export async function checkDiagramSyntax(sources: string[]): Promise<(string | null)[] | null> {
  if (!sources.length) return [];
  if (
    sources.length > DIAGRAM_REVIEW_LIMIT ||
    sources.some((source) => source.length > 12000) ||
    running >= 2
  )
    return null;
  running++;
  try {
    return await new Promise((resolve) => {
      const worker = new Worker(path.resolve('scripts/check-diagrams.mjs'), {
        workerData: { sources },
        execArgv: [],
        resourceLimits: { maxOldGenerationSizeMb: 128 },
      });
      let settled = false;
      const finish = (value: (string | null)[] | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        void worker.terminate().then(
          () => resolve(value),
          () => resolve(null),
        );
      };
      const timer = setTimeout(() => finish(null), 8000);
      worker.once('message', (message) =>
        finish(
          Array.isArray(message.results) && message.results.length === sources.length
            ? message.results
            : null,
        ),
      );
      worker.once('error', () => finish(null));
      worker.once('exit', () => finish(null));
    });
  } catch {
    return null;
  } finally {
    running--;
  }
}
