import { OrderBook, type OrderCommand } from './order-book';

export const marketScenarios = [
  'bull',
  'bear',
  'sideways',
  'volatile',
  'crash',
  'recovery',
] as const;
export type MarketScenario = (typeof marketScenarios)[number];
export interface MarketEvent {
  time: number;
  command: OrderCommand;
  source: 'simulation' | 'user';
}
export const marketLimits = {
  events: 4096,
  checkpoint: 64,
  interval: 1000,
  candle: 15_000,
  initialPrice: 10_000,
} as const;

// 可重現的整數 PRNG，不依賴系統時鐘或 Math.random
export function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = Math.imul(value ^ (value >>> 15), value | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateMarket(scenario: MarketScenario, seed = 6149, rounds = 360): MarketEvent[] {
  if (
    !marketScenarios.includes(scenario) ||
    !Number.isSafeInteger(seed) ||
    seed < 0 ||
    seed > 0xffffffff ||
    !Number.isInteger(rounds) ||
    rounds < 20 ||
    rounds > 480
  )
    throw new Error('invalid-scenario');
  const random = seededRandom(seed);
  const book = new OrderBook();
  const events: MarketEvent[] = [];
  let id = 0;
  const emit = (command: OrderCommand, time: number) => {
    if (events.length >= marketLimits.events) throw new Error('event-capacity');
    book.execute(command);
    events.push({ command, time, source: 'simulation' });
  };
  let fair = marketLimits.initialPrice as number;
  let previousFair = fair;
  let velocity = 0;
  // 起始十二個價位各有兩筆委託，讓同價 FIFO 可直接觀察
  for (let level = 1; level <= 6; level++) {
    for (const side of ['buy', 'sell'] as const) {
      for (let queue = 0; queue < 2; queue++)
        emit(
          {
            type: 'limit',
            id: `s${++id}`,
            side,
            price: fair + (side === 'buy' ? -level : level) * 3,
            quantity: 12 + Math.floor(random() * 28),
          },
          0,
        );
    }
  }
  for (let round = 0; round < rounds; round++) {
    const progress = round / rounds;
    const volatility =
      scenario === 'volatile'
        ? 9
        : scenario === 'crash' && progress > 0.46 && progress < 0.6
          ? 12
          : 2.5;
    const drift =
      scenario === 'bull'
        ? 0.85
        : scenario === 'bear'
          ? -0.85
          : scenario === 'recovery'
            ? progress < 0.28
              ? -1.8
              : 1.8
            : scenario === 'crash'
              ? progress > 0.46 && progress < 0.6
                ? -13
                : 0.25
              : 0;
    const reversion = scenario === 'sideways' ? (marketLimits.initialPrice - fair) * 0.035 : 0;
    const shock = (random() + random() + random() - 1.5) * volatility;
    velocity = velocity * 0.35 + shock;
    fair = Math.max(100, Math.round(fair + drift + velocity + reversion));
    const time = (round + 1) * marketLimits.interval;
    const thin = scenario === 'crash' && progress > 0.44 && progress < 0.63;
    // 過期報價與最舊委託撤回，維持 bounded book，不憑空製造成交
    const stale = book
      .snapshot()
      .orders.filter((order) => Math.abs(order.price - fair) > (thin ? 18 : 45));
    const oldest = book.ids();
    const cancel = stale.slice(0, 3).map((order) => order.id);
    if (book.size > 100 && oldest[0] && !cancel.includes(oldest[0])) cancel.push(oldest[0]);
    if (cancel.length === 0 && random() < 0.32 && oldest.length > 0)
      cancel.push(oldest[Math.floor(random() * oldest.length)]);
    for (const orderId of cancel) emit({ type: 'cancel', id: orderId }, time);
    const halfSpread = thin ? 8 : scenario === 'volatile' ? 4 : 2;
    for (const side of ['buy', 'sell'] as const) {
      const price = fair + (side === 'buy' ? -1 : 1) * (halfSpread + Math.floor(random() * 7));
      emit(
        {
          type: 'limit',
          id: `s${++id}`,
          side,
          price,
          quantity: (thin ? 3 : 12) + Math.floor(random() * (thin ? 10 : 40)),
        },
        time,
      );
    }
    const pressure = Math.max(0.12, Math.min(0.88, 0.5 + (fair - previousFair) * 0.045));
    const side = random() < pressure ? 'buy' : 'sell';
    emit(
      {
        type: 'market',
        id: `s${++id}`,
        side,
        quantity: 3 + Math.floor(random() * (thin ? 45 : 28)),
      },
      time,
    );
    previousFair = fair;
  }
  return events;
}
