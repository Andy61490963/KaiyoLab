export type OrderSide = 'buy' | 'sell';
export type OrderCommand =
  | { type: 'limit'; id: string; side: OrderSide; price: number; quantity: number }
  | { type: 'market'; id: string; side: OrderSide; quantity: number }
  | { type: 'cancel'; id: string };

export interface RestingOrder {
  id: string;
  side: OrderSide;
  price: number;
  quantity: number;
  sequence: number;
}
export interface Trade {
  sequence: number;
  price: number;
  quantity: number;
  maker: string;
  taker: string;
  side: OrderSide;
}
export interface OrderResult {
  trades: Trade[];
  filled: number;
  resting: number;
  cancelled: number;
}
interface OrderNode extends RestingOrder {
  previous: OrderNode | null;
  next: OrderNode | null;
}
interface PriceLevel {
  head: OrderNode | null;
  tail: OrderNode | null;
  quantity: number;
  count: number;
}
export interface BookSnapshot {
  orders: RestingOrder[];
  sequence: number;
  tradeSequence: number;
}
export interface DepthLevel {
  price: number;
  quantity: number;
  orders: number;
  cumulative: number;
}

export const orderLimits = { price: 1_000_000_000, quantity: 1_000_000, active: 4096 } as const;

function positiveInteger(value: number, maximum: number) {
  return Number.isSafeInteger(value) && value > 0 && value <= maximum;
}

// 價格層以二分搜尋定位，每層以雙向鏈結維持 FIFO，取消透過 ID 索引定位
export class OrderBook {
  private levels = { buy: new Map<number, PriceLevel>(), sell: new Map<number, PriceLevel>() };
  private prices: Record<OrderSide, number[]> = { buy: [], sell: [] };
  private orders = new Map<string, OrderNode>();
  private sequence = 0;
  private tradeSequence = 0;

  get size() {
    return this.orders.size;
  }
  get bestBid(): number | null {
    return this.prices.buy.at(-1) ?? null;
  }
  get bestAsk(): number | null {
    return this.prices.sell[0] ?? null;
  }
  get spread(): number | null {
    return this.bestBid === null || this.bestAsk === null ? null : this.bestAsk - this.bestBid;
  }
  get mid(): number | null {
    return this.bestBid === null || this.bestAsk === null
      ? null
      : (this.bestBid + this.bestAsk) / 2;
  }

  has(id: string) {
    return this.orders.has(id);
  }
  ids(): string[] {
    return [...this.orders.keys()];
  }

  private priceIndex(side: OrderSide, price: number) {
    const prices = this.prices[side];
    let low = 0;
    let high = prices.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (prices[mid] < price) low = mid + 1;
      else high = mid;
    }
    return low;
  }

  private insert(order: RestingOrder) {
    let level = this.levels[order.side].get(order.price);
    if (!level) {
      level = { head: null, tail: null, quantity: 0, count: 0 };
      this.levels[order.side].set(order.price, level);
      this.prices[order.side].splice(this.priceIndex(order.side, order.price), 0, order.price);
    }
    const node: OrderNode = { ...order, previous: level.tail, next: null };
    if (level.tail) level.tail.next = node;
    else level.head = node;
    level.tail = node;
    level.quantity += node.quantity;
    level.count++;
    this.orders.set(node.id, node);
  }

  private remove(node: OrderNode) {
    const level = this.levels[node.side].get(node.price)!;
    if (node.previous) node.previous.next = node.next;
    else level.head = node.next;
    if (node.next) node.next.previous = node.previous;
    else level.tail = node.previous;
    level.quantity -= node.quantity;
    level.count--;
    this.orders.delete(node.id);
    if (!level.head) {
      this.levels[node.side].delete(node.price);
      this.prices[node.side].splice(this.priceIndex(node.side, node.price), 1);
    }
  }

  execute(command: OrderCommand): OrderResult {
    if (typeof command.id !== 'string' || !command.id.length || command.id.length > 80)
      throw new Error('invalid-id');
    if (command.type === 'cancel') {
      const node = this.orders.get(command.id);
      const cancelled = node?.quantity ?? 0;
      if (node) this.remove(node);
      return { trades: [], filled: 0, resting: 0, cancelled };
    }
    if (
      (command.type !== 'limit' && command.type !== 'market') ||
      (command.side !== 'buy' && command.side !== 'sell') ||
      !positiveInteger(command.quantity, orderLimits.quantity) ||
      (command.type === 'limit' && !positiveInteger(command.price, orderLimits.price))
    )
      throw new Error('invalid-order');
    if (this.orders.has(command.id)) throw new Error('duplicate-id');
    // 先驗證容量再撮合，拒單時不會留下部分成交的副作用
    if (command.type === 'limit' && this.orders.size >= orderLimits.active)
      throw new Error('book-capacity');
    const sequence = ++this.sequence;
    const opposite: OrderSide = command.side === 'buy' ? 'sell' : 'buy';
    let remaining = command.quantity;
    const trades: Trade[] = [];
    while (remaining > 0) {
      const price = opposite === 'buy' ? this.bestBid : this.bestAsk;
      if (price === null) break;
      if (
        command.type === 'limit' &&
        (command.side === 'buy' ? price > command.price : price < command.price)
      )
        break;
      const level = this.levels[opposite].get(price)!;
      const maker = level.head!;
      const quantity = Math.min(remaining, maker.quantity);
      trades.push({
        sequence: ++this.tradeSequence,
        price,
        quantity,
        maker: maker.id,
        taker: command.id,
        side: command.side,
      });
      remaining -= quantity;
      maker.quantity -= quantity;
      level.quantity -= quantity;
      if (maker.quantity === 0) this.remove(maker);
    }
    const resting = command.type === 'limit' ? remaining : 0;
    if (command.type === 'limit' && remaining > 0)
      this.insert({
        id: command.id,
        side: command.side,
        price: command.price,
        quantity: remaining,
        sequence,
      });
    return {
      trades,
      filled: command.quantity - remaining,
      resting,
      cancelled: command.type === 'market' ? remaining : 0,
    };
  }

  depth(side: OrderSide, count = 12): DepthLevel[] {
    const prices = side === 'buy' ? [...this.prices.buy].reverse() : this.prices.sell;
    let cumulative = 0;
    return prices.slice(0, count).map((price) => {
      const level = this.levels[side].get(price)!;
      cumulative += level.quantity;
      return { price, quantity: level.quantity, orders: level.count, cumulative };
    });
  }

  snapshot(): BookSnapshot {
    return {
      orders: [...this.orders.values()]
        .map(({ id, side, price, quantity, sequence }) => ({ id, side, price, quantity, sequence }))
        .sort((a, b) => a.sequence - b.sequence),
      sequence: this.sequence,
      tradeSequence: this.tradeSequence,
    };
  }

  static restore(snapshot: BookSnapshot): OrderBook {
    const book = new OrderBook();
    book.sequence = snapshot.sequence;
    book.tradeSequence = snapshot.tradeSequence;
    for (const order of snapshot.orders) book.insert(order);
    book.assertInvariants();
    return book;
  }

  assertInvariants() {
    if (this.bestBid !== null && this.bestAsk !== null && this.bestBid >= this.bestAsk)
      throw new Error('crossed-book');
    let count = 0;
    for (const side of ['buy', 'sell'] as const) {
      const prices = this.prices[side];
      for (let i = 0; i < prices.length; i++) {
        if (i && prices[i - 1] >= prices[i]) throw new Error('price-order');
        const level = this.levels[side].get(prices[i])!;
        let total = 0;
        let nodes = 0;
        let previous: OrderNode | null = null;
        for (let node = level.head; node; node = node.next) {
          if (
            !positiveInteger(node.quantity, orderLimits.quantity) ||
            node.previous !== previous ||
            node.side !== side ||
            node.price !== prices[i] ||
            this.orders.get(node.id) !== node ||
            (previous && previous.sequence >= node.sequence)
          )
            throw new Error('invalid-queue');
          total += node.quantity;
          nodes++;
          previous = node;
        }
        if (!nodes || nodes !== level.count || total !== level.quantity || previous !== level.tail)
          throw new Error('invalid-depth');
        count += nodes;
      }
    }
    if (count !== this.orders.size) throw new Error('invalid-index');
  }
}
