import {
  OrderBook,
  type BookSnapshot,
  type OrderCommand,
  type OrderResult,
  type Trade,
} from './order-book';
import { marketLimits, type MarketEvent } from './market-simulation';

export interface MarketTrade extends Trade {
  time: number;
}
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades: number;
}
export interface MarketIndicators {
  sma: number | null;
  ema: number | null;
  vwap: number | null;
  rsi: number | null;
}
interface ReplayState {
  book: OrderBook;
  candles: Candle[];
  trades: MarketTrade[];
  volume: number;
  notional: number;
  tradeCount: number;
  lastResult: OrderResult | null;
}
interface Checkpoint extends Omit<ReplayState, 'book'> {
  book: BookSnapshot;
}

function initialState(): ReplayState {
  return {
    book: new OrderBook(),
    candles: [],
    trades: [],
    volume: 0,
    notional: 0,
    tradeCount: 0,
    lastResult: null,
  };
}

export function candleIndicators(
  candles: readonly Candle[],
  volume: number,
  notional: number,
): MarketIndicators {
  const period = 14;
  if (!candles.length) return { sma: null, ema: null, vwap: null, rsi: null };
  const closes = candles.map((candle) => candle.close);
  let ema = closes[0];
  const alpha = 2 / (period + 1);
  for (const close of closes.slice(1)) ema += alpha * (close - ema);
  const recent = closes.slice(-period);
  let rsi: number | null = null;
  if (closes.length > period) {
    let gain = 0;
    let loss = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      const delta = closes[i] - closes[i - 1];
      gain += Math.max(0, delta);
      loss += Math.max(0, -delta);
    }
    rsi = gain === 0 && loss === 0 ? 50 : loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return {
    sma:
      recent.length === period ? recent.reduce((total, value) => total + value, 0) / period : null,
    ema,
    vwap: volume ? notional / volume : null,
    rsi,
  };
}

function apply(state: ReplayState, event: MarketEvent) {
  const result = state.book.execute(event.command);
  state.lastResult = result;
  const bucket = Math.floor(event.time / marketLimits.candle) * marketLimits.candle;
  // 無成交區間延續前一個收盤價，成交量為零
  const previous = state.candles.at(-1);
  if (previous) {
    for (
      let time = previous.time + marketLimits.candle;
      time <= bucket;
      time += marketLimits.candle
    ) {
      state.candles.push({
        time,
        open: previous.close,
        high: previous.close,
        low: previous.close,
        close: previous.close,
        volume: 0,
        trades: 0,
      });
    }
  }
  for (const trade of result.trades) {
    const current = state.candles.at(-1);
    if (!current || current.time !== bucket) {
      state.candles.push({
        time: bucket,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: trade.quantity,
        trades: 1,
      });
    } else {
      if (current.volume === 0) current.open = current.high = current.low = trade.price;
      current.high = Math.max(current.high, trade.price);
      current.low = Math.min(current.low, trade.price);
      current.close = trade.price;
      current.volume += trade.quantity;
      current.trades++;
    }
    state.volume += trade.quantity;
    state.notional += trade.price * trade.quantity;
    state.tradeCount++;
    state.trades.push({ ...trade, time: event.time });
  }
  if (state.trades.length > 60) state.trades.splice(0, state.trades.length - 60);
}

function capture(state: ReplayState): Checkpoint {
  return {
    ...state,
    book: state.book.snapshot(),
    candles: state.candles.map((candle) => ({ ...candle })),
    trades: state.trades.map((trade) => ({ ...trade })),
  };
}
function restore(checkpoint: Checkpoint): ReplayState {
  return {
    ...checkpoint,
    book: OrderBook.restore(checkpoint.book),
    candles: checkpoint.candles.map((candle) => ({ ...candle })),
    trades: checkpoint.trades.map((trade) => ({ ...trade })),
  };
}

// 所有公開視圖共用事件游標，checkpoint 只加速尋找，不另建行情來源
export class MarketReplay {
  readonly events: MarketEvent[];
  private checkpoints = new Map<number, Checkpoint>();
  private state = initialState();
  cursor = 0;

  constructor(events: readonly MarketEvent[]) {
    if (events.length > marketLimits.events) throw new Error('event-capacity');
    this.events = events.map((event) => ({ ...event, command: { ...event.command } }));
    const state = initialState();
    this.checkpoints.set(0, capture(state));
    let previousTime = 0;
    events.forEach((event, index) => {
      if (
        !Number.isSafeInteger(event.time) ||
        event.time < previousTime ||
        event.time - previousTime > 60_000
      )
        throw new Error('invalid-time');
      previousTime = event.time;
      apply(state, event);
      if ((index + 1) % marketLimits.checkpoint === 0)
        this.checkpoints.set(index + 1, capture(state));
    });
  }

  get length() {
    return this.events.length;
  }
  get book() {
    return this.state.book;
  }
  get candles(): readonly Candle[] {
    return this.state.candles;
  }
  get trades(): readonly MarketTrade[] {
    return this.state.trades;
  }
  get volume() {
    return this.state.volume;
  }
  get tradeCount() {
    return this.state.tradeCount;
  }
  get lastResult() {
    return this.state.lastResult;
  }
  get time() {
    return this.cursor ? this.events[this.cursor - 1].time : 0;
  }
  get indicators() {
    return candleIndicators(this.candles, this.state.volume, this.state.notional);
  }

  seek(cursor: number) {
    if (!Number.isInteger(cursor) || cursor < 0 || cursor > this.length)
      throw new Error('invalid-cursor');
    const checkpointCursor = Math.floor(cursor / marketLimits.checkpoint) * marketLimits.checkpoint;
    if (cursor < this.cursor || cursor - this.cursor > marketLimits.checkpoint) {
      this.state = restore(this.checkpoints.get(checkpointCursor)!);
      this.cursor = checkpointCursor;
    }
    while (this.cursor < cursor) apply(this.state, this.events[this.cursor++]);
    return this;
  }

  append(command: OrderCommand) {
    if (this.cursor >= marketLimits.events) throw new Error('event-capacity');
    // 先在副本驗證，無效輸入不截斷未來事件或改動目前狀態
    OrderBook.restore(this.book.snapshot()).execute(command);
    this.events.splice(this.cursor);
    for (const cursor of this.checkpoints.keys())
      if (cursor > this.cursor) this.checkpoints.delete(cursor);
    const event: MarketEvent = { time: this.time + 1000, command: { ...command }, source: 'user' };
    this.events.push(event);
    apply(this.state, event);
    this.cursor++;
    if (this.cursor % marketLimits.checkpoint === 0)
      this.checkpoints.set(this.cursor, capture(this.state));
    return this.state.lastResult!;
  }
}
