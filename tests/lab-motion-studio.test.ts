import { describe, expect, it } from 'vitest';
import {
  evaluateBezier,
  formatCurve,
  motionCss,
  MOTION_PRESETS,
  parseMotionInput,
  setControlPoint,
  validCurve,
  type BezierCurve,
} from '../src/lib/lab/motion-studio';

// 使用純二分反解做獨立參照，避免測試只重述 production Newton 路徑
function reference(curve: BezierCurve, time: number) {
  let lo = 0;
  let hi = 1;
  const axis = (t: number, a: number, b: number) =>
    (3 * a - 3 * b + 1) * t ** 3 + (-6 * a + 3 * b) * t ** 2 + 3 * a * t;
  for (let i = 0; i < 80; i++) {
    const middle = (lo + hi) / 2;
    const x = axis(middle, curve[0], curve[2]);
    if (x === time) return axis(middle, curve[1], curve[3]);
    if (x > time) hi = middle;
    else lo = middle;
  }
  return axis((lo + hi) / 2, curve[1], curve[3]);
}

describe('CSS Bézier 曲線工具', () => {
  it('反解時間座標，與獨立二分參照及 CSS ease 中點相符', () => {
    expect(evaluateBezier([0.25, 0.1, 0.25, 1], 0.5)).toBeCloseTo(0.8024033876, 8);
    const curves: BezierCurve[] = [
      ...MOTION_PRESETS.map((preset) => preset.curve),
      [0, -0.5, 0, 1.5],
      [1, 1.5, 1, -0.5],
      [1, 0, 0, 1],
    ];
    for (const curve of curves) {
      for (const time of [0.000000001, 0.0001, 0.1, 0.333, 0.49, 0.5, 0.501, 0.8, 0.9999]) {
        expect(evaluateBezier(curve, time)).toBeCloseTo(reference(curve, time), 6);
      }
    }
  });
  it('線性曲線不因參數速度而改變，端點完全一致', () => {
    for (let index = 0; index <= 100; index++)
      expect(evaluateBezier([0, 0, 1, 1], index / 100)).toBeCloseTo(index / 100, 10);
    expect(evaluateBezier(MOTION_PRESETS[3].curve, -1)).toBe(0);
    expect(evaluateBezier(MOTION_PRESETS[3].curve, 2)).toBe(1);
  });
  it('提前與超越曲線保留 0–1 以外的輸出', () => {
    expect(evaluateBezier(MOTION_PRESETS[4].curve, 0.1)).toBeLessThan(0);
    expect(evaluateBezier(MOTION_PRESETS[5].curve, 0.65)).toBeGreaterThan(1);
  });
  it('拒絕空白、非有限數值、非法座標與時間，接受合法邊界', () => {
    for (const values of [
      ['', '0', '1', '1'],
      ['1.1', '0', '1', '1'],
      ['0', '-0.51', '1', '1'],
      ['0', '0', 'Infinity', '1'],
      ['0', '0', '1', 'NaN'],
    ])
      expect(parseMotionInput(values, '1200')).toBeNull();
    for (const duration of ['', '99', '5001', '100.1', 'NaN'])
      expect(parseMotionInput(['0', '0', '1', '1'], duration)).toBeNull();
    expect(parseMotionInput(['0', '-0.5', '1', '1.5'], '100')).toEqual({
      curve: [0, -0.5, 1, 1.5],
      duration: 100,
    });
    expect(parseMotionInput(['0.123456', '0', '1', '1'], '5000')?.curve[0]).toBe(0.123);
    expect(validCurve([0, 0, 1])).toBe(false);
    expect(() => evaluateBezier([NaN, 0, 1, 1], 0.5)).toThrow();
    expect(() => evaluateBezier([0, 0, 1, 1], NaN)).toThrow();
  });
  it('拖曳與鍵盤操作限制座標而不改另一個控制點', () => {
    expect(setControlPoint([0.25, 0.1, 0.25, 1], 0, -10, 99)).toEqual([0, 1.5, 0.25, 1]);
    expect(setControlPoint([0.25, 0.1, 0.25, 1], 1, 0.7777, -99)).toEqual([0.25, 0.1, 0.778, -0.5]);
  });
  it('產出的 CSS 包含真實關鍵影格、目前曲線、長度與減少動態處理', () => {
    const curve: BezierCurve = [0.3, 1.5, 0.65, 1];
    const css = motionCss(curve, 1800);
    expect(formatCurve(curve)).toBe('cubic-bezier(0.3, 1.5, 0.65, 1)');
    expect(css).toContain('animation: move 1800ms cubic-bezier(0.3, 1.5, 0.65, 1) both');
    expect(css).toContain('to   { transform: translateX(var(--travel)); }');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(() => motionCss(curve, 1)).toThrow();
  });
});
