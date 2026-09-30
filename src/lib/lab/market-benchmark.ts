import { OrderBook, type OrderCommand } from './order-book';
import { seededRandom } from './market-simulation';

export interface BenchmarkMetrics {
  operations: number;
  matches: number;
  milliseconds: number;
  maximumBatch: number;
  activeOrders: number;
  finished: boolean;
}

// 壓力測試使用獨立且有界的委託簿，不混入使用者正在回放的行情
export class MatchingBenchmark {
  readonly book = new OrderBook();
  private random = seededRandom(6149);
  private operations = 0;
  private matches = 0;
  private milliseconds = 0;
  private maximumBatch = 0;
  readonly target = 50_000;

  get metrics(): BenchmarkMetrics {
    return {
      operations: this.operations,
      matches: this.matches,
      milliseconds: this.milliseconds,
      maximumBatch: this.maximumBatch,
      activeOrders: this.book.size,
      finished: this.operations === this.target,
    };
  }

  runBatch(now: () => number = () => performance.now(), maximumOperations = 128, budget = 4) {
    if (
      !Number.isInteger(maximumOperations) ||
      maximumOperations < 1 ||
      maximumOperations > 512 ||
      !Number.isFinite(budget) ||
      budget <= 0 ||
      budget > 16
    )
      throw new Error('invalid-batch');
    const started = now();
    let batch = 0;
    do {
      if (this.operations >= this.target) break;
      const side = this.random() < 0.5 ? 'buy' : 'sell';
      const chance = this.random();
      const ids = this.book.ids();
      let command: OrderCommand;
      if ((chance < 0.18 || this.book.size > 300) && ids.length)
        command = { type: 'cancel', id: ids[Math.floor(this.random() * ids.length)] };
      else if (chance < 0.5)
        command = {
          type: 'market',
          id: `b${this.operations}`,
          side,
          quantity: 1 + Math.floor(this.random() * 100),
        };
      else
        command = {
          type: 'limit',
          id: `b${this.operations}`,
          side,
          price: 10_000 + (side === 'buy' ? -1 : 1) * (1 + Math.floor(this.random() * 24)),
          quantity: 1 + Math.floor(this.random() * 100),
        };
      this.matches += this.book.execute(command).trades.length;
      this.operations++;
      batch++;
    } while (batch < maximumOperations && now() - started < budget);
    const elapsed = Math.max(0, now() - started);
    this.milliseconds += elapsed;
    this.maximumBatch = Math.max(this.maximumBatch, elapsed);
    return this.metrics;
  }
}
