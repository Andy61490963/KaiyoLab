import { describe, expect, it } from 'vitest';
import {
  clampSvgPoint,
  exportSvg,
  generateSvgPoints,
  mixSvgCurves,
  svgCurve,
  svgPath,
} from '../src/lib/lab/svg-studio';

describe('SVG 生成、連續變形與安全輸出', () => {
  it('相同種子完整重現，換種子才改變輪廓', () => {
    expect(generateSvgPoints(287, 8, 0.65)).toEqual(generateSvgPoints(287, 8, 0.65));
    expect(generateSvgPoints(287, 8, 0.65)).not.toEqual(generateSvgPoints(911, 8, 0.65));
    expect(generateSvgPoints(0, 16, 1)).toHaveLength(16);
  });

  it('零不規則度形成等角等半徑的節點，各個種子一致', () => {
    const circle = generateSvgPoints(287, 8, 0);
    expect(circle).toEqual(generateSvgPoints(911, 8, 0));
    for (const point of circle) expect(Math.hypot(point.x - 300, point.y - 300)).toBeCloseTo(205);
  });

  it('拒絕無效生成參數並限制拖拉座標', () => {
    expect(() => generateSvgPoints(Infinity, 8, 1)).toThrow();
    expect(() => generateSvgPoints(1, 17, 1)).toThrow();
    expect(() => generateSvgPoints(1, 8, NaN)).toThrow();
    expect(clampSvgPoint({ x: -100, y: 2000 })).toEqual({ x: 30, y: 570 });
    expect(() => clampSvgPoint({ x: NaN, y: 300 })).toThrow();
  });

  it('每個輪廓都是閉合且同數量的 cubic，零平滑度保留直邊', () => {
    const points = generateSvgPoints(1, 8, 1);
    const curve = svgCurve(points, 0);
    expect(curve.segments).toHaveLength(8);
    expect(curve.segments.at(-1)!.end).toEqual(curve.start);
    for (let index = 0; index < points.length; index++) {
      expect(curve.segments[index].c1).toEqual(points[index]);
      expect(curve.segments[index].c2).toEqual(curve.segments[index].end);
    }
    expect(svgPath(curve).match(/ C /g)).toHaveLength(8);
    expect(svgPath(curve)).toMatch(/^M .+ Z$/);
  });

  it('極端拖拉後 Bézier 控制點仍位於有邊界餘裕的 viewBox', () => {
    const curve = svgCurve(
      [
        { x: 30, y: 30 },
        { x: 570, y: 30 },
        { x: 30, y: 570 },
        { x: 570, y: 570 },
      ],
      1,
    );
    for (const segment of curve.segments) {
      for (const point of [segment.c1, segment.c2, segment.end]) {
        expect(point.x).toBeGreaterThanOrEqual(12);
        expect(point.y).toBeGreaterThanOrEqual(12);
        expect(point.x).toBeLessThanOrEqual(588);
        expect(point.y).toBeLessThanOrEqual(588);
      }
    }
  });

  it('A、B 端點精確還原，中點逐個座標取平均且前後連續', () => {
    const a = svgCurve(generateSvgPoints(287, 8, 0.65), 0.9);
    const b = svgCurve(generateSvgPoints(911, 8, 0.65), 0.9);
    expect(mixSvgCurves(a, b, 0)).toEqual(a);
    expect(svgPath(mixSvgCurves(a, b, 1))).toEqual(svgPath(b));
    const middle = mixSvgCurves(a, b, 0.5);
    for (let index = 0; index < a.segments.length; index++) {
      expect(middle.segments[index].c1.x).toBeCloseTo(
        (a.segments[index].c1.x + b.segments[index].c1.x) / 2,
      );
      expect(middle.segments[index].c2.y).toBeCloseTo(
        (a.segments[index].c2.y + b.segments[index].c2.y) / 2,
      );
    }
    const before = mixSvgCurves(a, b, 0.5 - 1e-8);
    const after = mixSvgCurves(a, b, 0.5 + 1e-8);
    expect(Math.abs(before.segments[2].end.x - after.segments[2].end.x)).toBeLessThan(0.00001);
    expect(() => mixSvgCurves(a, svgCurve(generateSvgPoints(9, 9, 0.5), 0.9), 0.5)).toThrow();
  });

  it('匯出只有當下的路徑與外觀，沒有控制 UI、動畫或外部資源', () => {
    const curve = svgCurve(generateSvgPoints(287, 8, 0.65), 0.9);
    const output = exportSvg(curve, { fill: '#b44269', stroke: '#40393b', strokeWidth: 2 });
    expect(output).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(output).toContain('viewBox="0 0 600 600"');
    expect(output).toContain(`d="${svgPath(curve)}"`);
    expect(output).not.toMatch(/<(?:script|animate|g|text|image)\b/);
    expect(output).not.toContain('NaN');
    expect(exportSvg(curve, { fill: 'none', stroke: '#000000', strokeWidth: 0 })).toContain(
      'fill="none"',
    );
  });

  it('輸出拒絕屬性插入、遠端色彩及非有限數字', () => {
    const curve = svgCurve(generateSvgPoints(287, 8, 0.65), 0.9);
    for (const fill of [
      'red" onload="alert(1)',
      'url(https://example.com)',
      'javascript:alert(1)',
      '#abc',
    ]) {
      expect(() => exportSvg(curve, { fill, stroke: '#000000', strokeWidth: 2 })).toThrow();
    }
    expect(() =>
      exportSvg(curve, { fill: '#ffffff', stroke: '#000000', strokeWidth: NaN }),
    ).toThrow();
    curve.start.x = Infinity;
    expect(() => svgPath(curve)).toThrow();
  });
});
