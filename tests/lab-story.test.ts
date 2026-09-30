import { describe, expect, it } from 'vitest';
import { damp, storyAt, storyPricePath } from '../src/lib/lab/story';

describe('市場敘事時間模型', () => {
  it('倒轉時間仍得到完全相同的價格、章節與深度', () => {
    const original = storyAt(28.5);
    storyAt(60);
    storyAt(0);
    expect(storyAt(28.5)).toEqual(original);
    expect(original.chapter).toBe(3);
    expect(original.depth).toBeLessThan(storyAt(9).depth);
    expect(original.spread).toBeGreaterThan(storyAt(9).spread);
  });
  it('熔斷期間凍結價格而且買賣價格永不交叉', () => {
    expect(storyAt(36).price).toBe(storyAt(43).price);
    expect(storyAt(44).halted).toBe(false);
    expect(storyAt(44).chapter).toBe(5);
    expect(storyAt(44.000001).price).toBeCloseTo(storyAt(43.999999).price, 8);
    for (let time = 0; time <= 60; time += 0.1) {
      const state = storyAt(time);
      expect(state.price).toBeGreaterThan(0);
      expect(state.levels[0].bid).toBeLessThan(state.levels[0].ask);
      for (const level of state.levels) {
        expect(level.bidQuantity).toBeGreaterThanOrEqual(0);
        expect(level.askQuantity).toBeGreaterThanOrEqual(0);
      }
    }
  });
  it('時間邊界與圖表取樣保持一致', () => {
    expect(storyAt(-10)).toEqual(storyAt(0));
    expect(storyAt(NaN)).toEqual(storyAt(0));
    expect(storyAt(80)).toEqual(storyAt(60));
    expect(storyPricePath).toHaveLength(241);
    expect(storyPricePath.at(-1)).toBe(storyAt(60).price);
  });
  it('解析阻尼不依賴畫面更新率', () => {
    let slow = 0;
    let fast = 0;
    for (let i = 0; i < 30; i++) slow = damp(slow, 1, 1 / 30);
    for (let i = 0; i < 120; i++) fast = damp(fast, 1, 1 / 120);
    expect(slow).toBeCloseTo(fast, 12);
    expect(damp(5, 8, -1)).toBe(5);
  });
});
