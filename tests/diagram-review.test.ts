import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const workers = vi.hoisted(
  () =>
    [] as {
      terminate: ReturnType<typeof vi.fn>;
      emit: (event: string, value?: unknown) => boolean;
    }[],
);
vi.mock('node:worker_threads', () => ({
  Worker: class extends EventEmitter {
    terminate = vi.fn(async () => 0);
    constructor() {
      super();
      workers.push(this);
    }
  },
}));
import { checkDiagramSyntax } from '../src/lib/diagram-review';

describe('隔離圖表檢查的資源界線', () => {
  beforeEach(() => {
    workers.length = 0;
    vi.useRealTimers();
  });
  it('拒絕超過數量與長度的輸入，不啟動 worker', async () => {
    expect(await checkDiagramSyntax(Array(21).fill('flowchart TD\nA-->B'))).toBeNull();
    expect(await checkDiagramSyntax(['a'.repeat(12001)])).toBeNull();
    expect(workers).toHaveLength(0);
  });
  it('最多同時執行兩個，八秒後終止並釋放名額', async () => {
    vi.useFakeTimers();
    const first = checkDiagramSyntax(['flowchart TD\nA-->B']);
    const second = checkDiagramSyntax(['flowchart TD\nA-->B']);
    expect(await checkDiagramSyntax(['flowchart TD\nA-->B'])).toBeNull();
    expect(workers).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await first).toBeNull();
    expect(await second).toBeNull();
    expect(workers.every((worker) => worker.terminate.mock.calls.length === 1)).toBe(true);
    const retry = checkDiagramSyntax(['flowchart TD\nA-->B']);
    workers[2].emit('message', { results: [null] });
    expect(await retry).toEqual([null]);
    vi.useRealTimers();
  });
});
