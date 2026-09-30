import { describe, expect, it } from 'vitest';
import { OrderBook, type OrderCommand } from '../src/lib/lab/order-book';
import { generateMarket, marketScenarios, seededRandom } from '../src/lib/lab/market-simulation';
import { MarketReplay, candleIndicators } from '../src/lib/lab/market-replay';
import { MatchingBenchmark } from '../src/lib/lab/market-benchmark';

const limit = (
  id: string,
  side: 'buy' | 'sell',
  price: number,
  quantity: number,
): OrderCommand => ({ type: 'limit', id, side, price, quantity });
const market = (id: string, side: 'buy' | 'sell', quantity: number): OrderCommand => ({
  type: 'market',
  id,
  side,
  quantity,
});

describe('委託簿撮合', () => {
  it('先取最佳價格，再依同價抵達先後成交，部分成交不改排隊順位', () => {
    const book = new OrderBook();
    book.execute(limit('expensive', 'sell', 102, 5));
    book.execute(limit('first', 'sell', 101, 6));
    book.execute(limit('second', 'sell', 101, 8));
    expect(book.execute(market('take1', 'buy', 4)).trades).toMatchObject([
      { maker: 'first', quantity: 4, price: 101 },
    ]);
    expect(book.execute(market('take2', 'buy', 12)).trades).toMatchObject([
      { maker: 'first', quantity: 2, price: 101 },
      { maker: 'second', quantity: 8, price: 101 },
      { maker: 'expensive', quantity: 2, price: 102 },
    ]);
    expect(book.depth('sell')).toEqual([{ price: 102, quantity: 3, orders: 1, cumulative: 3 }]);
    book.assertInvariants();
  });

  it('限價跨多層後以原限價留下餘量，市場單未成交量取消而不入簿', () => {
    const book = new OrderBook();
    book.execute(limit('sell', 'sell', 105, 10));
    const fill = book.execute(limit('buy', 'buy', 106, 15));
    expect(fill).toMatchObject({ filled: 10, resting: 5, cancelled: 0 });
    expect(book.bestBid).toBe(106);
    expect(book.execute(market('sell-now', 'sell', 9))).toMatchObject({
      filled: 5,
      resting: 0,
      cancelled: 4,
    });
    expect(book.size).toBe(0);
    expect(book.spread).toBeNull();
    book.assertInvariants();
  });

  it('取消隊首、隊中及隊尾後維持 FIFO 與深度，未知 ID 撤單不改狀態', () => {
    const book = new OrderBook();
    for (const id of ['a', 'b', 'c', 'd']) book.execute(limit(id, 'buy', 100, 5));
    expect(book.execute({ type: 'cancel', id: 'b' }).cancelled).toBe(5);
    book.execute({ type: 'cancel', id: 'a' });
    book.execute({ type: 'cancel', id: 'd' });
    expect(book.depth('buy')[0]).toMatchObject({ orders: 1, quantity: 5 });
    expect(book.execute({ type: 'cancel', id: 'missing' }).cancelled).toBe(0);
    expect(book.execute(market('taker', 'sell', 5)).trades[0].maker).toBe('c');
    book.assertInvariants();
  });

  it('無效數量、價格與重複 ID 在成交前拒絕，不留下副作用', () => {
    const book = new OrderBook();
    book.execute(limit('sell', 'sell', 100, 10));
    const before = book.snapshot();
    for (const quantity of [0, -1, 1.2, Infinity, NaN, 1_000_001])
      expect(() => book.execute(market('bad', 'buy', quantity))).toThrow('invalid-order');
    for (const price of [0, -1, 1.5, Infinity, 1_000_000_001])
      expect(() => book.execute(limit('bad', 'buy', price, 10))).toThrow('invalid-order');
    expect(() => book.execute(market('sell', 'buy', 5))).toThrow('duplicate-id');
    expect(book.snapshot()).toEqual(before);
  });

  it('快照還原保留隊列先後與成交序號', () => {
    const book = new OrderBook();
    book.execute(limit('a', 'sell', 100, 10));
    book.execute(limit('b', 'sell', 100, 20));
    book.execute(market('one', 'buy', 3));
    const restored = OrderBook.restore(book.snapshot());
    expect(restored.execute(market('two', 'buy', 12))).toEqual(
      book.execute(market('two', 'buy', 12)),
    );
    expect(restored.snapshot()).toEqual(book.snapshot());
  });

  it('大量混合事件始終保持非負量、總量一致且買賣價格不交叉', () => {
    const random = seededRandom(84);
    const book = new OrderBook();
    let submitted = 0;
    let filled = 0;
    let cancelled = 0;
    for (let i = 0; i < 2500; i++) {
      const side = random() < 0.5 ? 'buy' : 'sell';
      const ids = book.ids();
      let command: OrderCommand;
      if (i % 5 === 0 && ids.length)
        command = { type: 'cancel', id: ids[Math.floor(random() * ids.length)] };
      else {
        const quantity = 1 + Math.floor(random() * 40);
        submitted += quantity;
        command =
          i % 3 === 0
            ? market(`o${i}`, side, quantity)
            : limit(`o${i}`, side, 90 + Math.floor(random() * 20), quantity);
      }
      const result = book.execute(command);
      filled += result.filled;
      cancelled += result.cancelled;
      book.assertInvariants();
      const resting = book.snapshot().orders.reduce((total, order) => total + order.quantity, 0);
      expect(resting + filled * 2 + cancelled).toBe(submitted);
    }
  });
});

describe('事件回放與行情指標', () => {
  it('固定情境確實呈現趨勢、流動性急跌及復甦，高波動區間大於均值回歸', () => {
    const candles = Object.fromEntries(
      marketScenarios.map((scenario) => {
        const replay = new MarketReplay(generateMarket(scenario));
        replay.seek(replay.length);
        return [scenario, replay.candles];
      }),
    );
    expect(candles.bull.at(-1)!.close).toBeGreaterThan(10100);
    expect(candles.bear.at(-1)!.close).toBeLessThan(9900);
    expect(Math.min(...candles.crash.map((candle) => candle.low))).toBeLessThan(9700);
    expect(
      candles.recovery.at(-1)!.close - Math.min(...candles.recovery.map((candle) => candle.low)),
    ).toBeGreaterThan(150);
    const range = (items: typeof candles.bull) =>
      Math.max(...items.map((candle) => candle.high)) -
      Math.min(...items.map((candle) => candle.low));
    expect(range(candles.volatile)).toBeGreaterThan(range(candles.sideways) * 1.5);
  });

  it('事件、種子及時間資源上限會拒絕越界輸入', () => {
    const event = {
      time: 0,
      source: 'simulation' as const,
      command: { type: 'cancel' as const, id: 'none' },
    };
    expect(() => new MarketReplay(Array.from({ length: 4097 }, () => event))).toThrow(
      'event-capacity',
    );
    expect(() => new MarketReplay([{ ...event, time: -1 }])).toThrow('invalid-time');
    expect(() => new MarketReplay([{ ...event, time: 60001 }])).toThrow('invalid-time');
    expect(() => generateMarket('bull', NaN)).toThrow('invalid-scenario');
    expect(() => generateMarket('bull', -1)).toThrow('invalid-scenario');
    expect(() => generateMarket('bull', 1, 481)).toThrow('invalid-scenario');
    const book = new OrderBook();
    for (let i = 0; i < 4096; i++) book.execute(limit(`q${i}`, 'sell', 100, 1));
    const before = book.snapshot();
    expect(() => book.execute(limit('over', 'buy', 100, 1))).toThrow('book-capacity');
    expect(book.snapshot()).toEqual(before);
    expect(book.execute(market('reduce', 'buy', 1)).filled).toBe(1);
    book.assertInvariants();
  });

  it.each(marketScenarios)('%s 情境由固定種子重現，每筆成交都來自有效撮合', (scenario) => {
    const events = generateMarket(scenario, 6149);
    expect(events).toEqual(generateMarket(scenario, 6149));
    expect(events.length).toBeLessThanOrEqual(4096);
    const book = new OrderBook();
    let trades = 0;
    for (const event of events) {
      trades += book.execute(event.command).trades.length;
      book.assertInvariants();
    }
    expect(trades).toBeGreaterThan(200);
    expect(generateMarket(scenario, 6150)).not.toEqual(events);
  });

  it('任意往返游標與逐筆重播產生完全相同的委託簿、OHLC、量及指標', () => {
    const events = generateMarket('crash', 19);
    const replay = new MarketReplay(events);
    for (const cursor of [0, 1, 63, 64, 65, 701, events.length, 164, 0, events.length - 1]) {
      replay.seek(cursor);
      const sequential = new MarketReplay(events.slice(0, cursor)).seek(cursor);
      expect(replay.book.snapshot()).toEqual(sequential.book.snapshot());
      expect(replay.candles).toEqual(sequential.candles);
      expect(replay.trades).toEqual(sequential.trades);
      expect(replay.indicators).toEqual(sequential.indicators);
      expect(replay.volume).toEqual(sequential.volume);
      expect(replay.tradeCount).toEqual(sequential.tradeCount);
    }
  });

  it('自訂下單只替換游標後事件，無效輸入不改未來紀錄，分支仍可完整回放', () => {
    const replay = new MarketReplay(generateMarket('sideways')).seek(24);
    const oldEvents = JSON.stringify(replay.events);
    expect(() => replay.append(market('bad', 'buy', -1))).toThrow();
    expect(JSON.stringify(replay.events)).toBe(oldEvents);
    const result = replay.append(market('custom', 'buy', 15));
    expect(result.filled).toBe(15);
    expect(replay.length).toBe(25);
    expect(replay.cursor).toBe(25);
    expect(replay.events.at(-1)?.source).toBe('user');
    const before = replay.book.snapshot();
    replay.seek(0).seek(25);
    expect(replay.book.snapshot()).toEqual(before);
    expect(() => replay.seek(-1)).toThrow('invalid-cursor');
    expect(() => replay.seek(26)).toThrow('invalid-cursor');
  });

  it('OHLC 以實際成交組成，空區間量為零，VWAP 與成交量守恆', () => {
    const replay = new MarketReplay([
      { time: 0, source: 'simulation', command: limit('ask1', 'sell', 100, 10) },
      { time: 0, source: 'simulation', command: limit('ask2', 'sell', 110, 10) },
      { time: 1000, source: 'simulation', command: market('buy', 'buy', 15) },
      { time: 31_000, source: 'simulation', command: { type: 'cancel', id: 'missing' } },
    ]).seek(4);
    expect(replay.candles).toEqual([
      { time: 0, open: 100, high: 110, low: 100, close: 110, volume: 15, trades: 2 },
      { time: 15_000, open: 110, high: 110, low: 110, close: 110, volume: 0, trades: 0 },
      { time: 30_000, open: 110, high: 110, low: 110, close: 110, volume: 0, trades: 0 },
    ]);
    expect(replay.indicators.vwap).toBeCloseTo(1550 / 15);
    expect(replay.candles.reduce((sum, candle) => sum + candle.volume, 0)).toBe(replay.volume);
    expect(replay.indicators.rsi).toBeNull();
  });

  it('指標對平盤及單向走勢有明確邊界，SMA 要有十四根資料才顯示', () => {
    const candles = Array.from({ length: 16 }, (_, i) => ({
      time: i * 15000,
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      volume: 1,
      trades: 1,
    }));
    expect(candleIndicators(candles, 16, 1600)).toEqual({ sma: 100, ema: 100, vwap: 100, rsi: 50 });
    expect(candleIndicators(candles.slice(0, 13), 13, 1300).sma).toBeNull();
    expect(
      candleIndicators(
        candles.map((candle, i) => ({ ...candle, close: 100 + i })),
        16,
        1600,
      ).rsi,
    ).toBe(100);
    expect(candleIndicators([], 0, 0)).toEqual({ sma: null, ema: null, vwap: null, rsi: null });
  });

  it('壓力模式限制單批操作數與時間，維持有限委託簿並確實成交', () => {
    const benchmark = new MatchingBenchmark();
    let clock = 0;
    const first = benchmark.runBatch(() => ++clock, 128, 4);
    expect(first.operations).toBeLessThanOrEqual(4);
    expect(first.maximumBatch).toBeGreaterThan(0);
    while (!benchmark.metrics.finished) benchmark.runBatch(() => 0, 512, 4);
    expect(benchmark.metrics.operations).toBe(50_000);
    expect(benchmark.metrics.matches).toBeGreaterThan(10_000);
    expect(benchmark.metrics.activeOrders).toBeLessThanOrEqual(301);
    benchmark.book.assertInvariants();
    expect(() => benchmark.runBatch(() => 0, 513)).toThrow('invalid-batch');
  });
});
