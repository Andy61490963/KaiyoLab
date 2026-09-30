export const STORY_DURATION = 60;
export const storyChapters = [
  {
    time: 0,
    zh: '平衡',
    en: 'Balance',
    detailZh: '買賣委託在狹窄價差內等待，流動性看似充足',
    detailEn: 'Orders rest across a narrow spread. Liquidity appears abundant.',
  },
  {
    time: 9,
    zh: '撤單',
    en: 'Withdrawal',
    detailZh: '價格尚未大幅變動，願意承接的委託卻先離開',
    detailEn: 'Price has barely moved, but the orders willing to absorb a sale are leaving.',
  },
  {
    time: 18,
    zh: '價差擴大',
    en: 'Separation',
    detailZh: '最佳買價與賣價分離，同樣的訂單開始穿越更多價格層',
    detailEn: 'Bid and ask separate. The same order now walks through more price levels.',
  },
  {
    time: 27,
    zh: '衝擊',
    en: 'Impact',
    detailZh: '賣壓碰上稀薄的買方深度，成交價格快速下移',
    detailEn: 'Selling pressure meets a thin bid side. Executions move sharply lower.',
  },
  {
    time: 36,
    zh: '暫停',
    en: 'Halt',
    detailZh: '敘事模型暫停成交，價格不再更新，留下重新報價的時間',
    detailEn: 'Trading pauses in this narrative model. Price stops while participants reassess.',
  },
  {
    time: 44,
    zh: '重新報價',
    en: 'Reprice',
    detailZh: '委託逐步回來，價差縮小，價格仍未回到事件之前',
    detailEn: 'Orders return and the spread narrows. Price has not returned to its starting point.',
  },
] as const;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const smooth = (x: number) => x * x * (3 - 2 * x);
const knots = [0, 9, 18, 27, 36, 44, 60];
const prices = [100, 100.4, 99.4, 95.6, 78, 78, 91.5];
const depths = [1, 0.96, 0.62, 0.24, 0.065, 0.11, 0.72];

function interpolate(values: number[], time: number) {
  const index = Math.min(
    knots.length - 2,
    Math.max(
      0,
      knots.findIndex((value, i) => i < knots.length - 1 && time >= value && time <= knots[i + 1]),
    ),
  );
  const fraction = clamp((time - knots[index]) / (knots[index + 1] - knots[index]), 0, 1);
  return values[index] + (values[index + 1] - values[index]) * smooth(fraction);
}

export function storyAt(input: number) {
  const time = clamp(Number.isFinite(input) ? input : 0, 0, STORY_DURATION);
  const depth = interpolate(depths, time);
  const halted = time >= 36 && time < 44;
  const envelope = Math.sin((Math.PI * (time % 9)) / 9) ** 2;
  const reopen = time >= 44 ? smooth(clamp((time - 44) / 2, 0, 1)) : 1;
  const price =
    interpolate(prices, time) + (halted ? 0 : 0.16 * Math.sin(time * 2.1) * envelope * reopen);
  const spread = 0.08 + (1 - depth) ** 2 * 3.7;
  const chapter = Math.max(
    0,
    storyChapters.findLastIndex((item) => time >= item.time),
  );
  const levels = Array.from({ length: 7 }, (_, index) => ({
    bid: price - spread / 2 - index * 0.16,
    ask: price + spread / 2 + index * 0.16,
    bidQuantity: Math.round(
      (30 + index * 13) * depth * (1 + 0.22 * Math.sin(index * 2.3 + time * 0.12)),
    ),
    askQuantity: Math.round(
      (30 + index * 13) *
        Math.min(1, depth * (time > 18 && time < 36 ? 2.9 : 1.12)) *
        (1 + 0.18 * Math.cos(index * 1.9 + time * 0.12)),
    ),
  }));
  return { time, price, depth, spread, halted, chapter, levels };
}

// 指數阻尼在任何更新頻率下都保持相同的收斂速度
export function damp(current: number, target: number, elapsed: number, rate = 9) {
  return target + (current - target) * Math.exp(-Math.max(0, elapsed) * rate);
}

export const storyPricePath = Array.from({ length: 241 }, (_, index) => storyAt(index / 4).price);
