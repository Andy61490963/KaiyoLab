export type SvgPoint = { x: number; y: number };
export type SvgCurve = {
  start: SvgPoint;
  segments: Array<{ c1: SvgPoint; c2: SvgPoint; end: SvgPoint }>;
};
export type SvgStyle = { fill: string; stroke: string; strokeWidth: number };

export const SVG_SIZE = 600;
export const SVG_POINT_MIN = 30;
export const SVG_POINT_MAX = 570;

function finite(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) throw new Error('座標與參數必須是有限數值');
  return Math.min(maximum, Math.max(minimum, value));
}

export function clampSvgPoint(point: SvgPoint): SvgPoint {
  return {
    x: finite(point.x, SVG_POINT_MIN, SVG_POINT_MAX),
    y: finite(point.y, SVG_POINT_MIN, SVG_POINT_MAX),
  };
}

export function generateSvgPoints(seed: number, count: number, irregularity: number): SvgPoint[] {
  if (!Number.isSafeInteger(seed)) throw new Error('種子必須是整數');
  if (!Number.isInteger(count) || count < 3 || count > 16)
    throw new Error('節點數必須介於 3 與 16');
  const strength = finite(irregularity, 0, 1);
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
    const radius = 205 * (1 - strength * 0.66 * random());
    return { x: 300 + Math.cos(angle) * radius, y: 300 + Math.sin(angle) * radius };
  });
}

export function svgCurve(points: SvgPoint[], smoothing: number): SvgCurve {
  if (points.length < 3 || points.length > 16) throw new Error('形狀需要 3 至 16 個節點');
  const amount = finite(smoothing, 0, 1) / 6;
  const safe = points.map(clampSvgPoint);
  return {
    start: safe[0],
    segments: safe.map((point, index) => {
      const previous = safe[(index - 1 + safe.length) % safe.length];
      const next = safe[(index + 1) % safe.length];
      const following = safe[(index + 2) % safe.length];
      // 控制柄也限制在畫布內，利用 Bézier 凸包性質避免輸出被 viewBox 裁切
      const control = (value: SvgPoint) => ({
        x: finite(value.x, 12, 588),
        y: finite(value.y, 12, 588),
      });
      return {
        c1: control({
          x: point.x + (next.x - previous.x) * amount,
          y: point.y + (next.y - previous.y) * amount,
        }),
        c2: control({
          x: next.x - (following.x - point.x) * amount,
          y: next.y - (following.y - point.y) * amount,
        }),
        end: next,
      };
    }),
  };
}

export function mixSvgCurves(from: SvgCurve, to: SvgCurve, progress: number): SvgCurve {
  if (from.segments.length !== to.segments.length) throw new Error('變形前後必須有相同節點數');
  const ratio = finite(progress, 0, 1);
  const mix = (a: SvgPoint, b: SvgPoint) => ({
    x: a.x + (b.x - a.x) * ratio,
    y: a.y + (b.y - a.y) * ratio,
  });
  return {
    start: mix(from.start, to.start),
    segments: from.segments.map((segment, index) => ({
      c1: mix(segment.c1, to.segments[index].c1),
      c2: mix(segment.c2, to.segments[index].c2),
      end: mix(segment.end, to.segments[index].end),
    })),
  };
}

export function svgPath(curve: SvgCurve): string {
  const point = ({ x, y }: SvgPoint) => {
    // 即使不是從生成器輸入的曲線，也不接受 NaN、Infinity 或越界數值
    const format = (value: number) => Number(finite(value, 0, SVG_SIZE).toFixed(2));
    return `${format(x)} ${format(y)}`;
  };
  return `M ${point(curve.start)} ${curve.segments.map(({ c1, c2, end }) => `C ${point(c1)} ${point(c2)} ${point(end)}`).join(' ')} Z`;
}

export function exportSvg(curve: SvgCurve, style: SvgStyle): string {
  const color = (value: string) => {
    if (value === 'none' || /^#[0-9a-f]{6}$/i.test(value)) return value;
    throw new Error('色彩必須是六位十六進位色碼或 none');
  };
  const width = finite(style.strokeWidth, 0, 12);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">\n  <path d="${svgPath(curve)}" fill="${color(style.fill)}" stroke="${color(style.stroke)}" stroke-width="${width}" stroke-linejoin="round"/>\n</svg>`;
}
