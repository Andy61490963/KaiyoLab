export type BezierCurve = readonly [number, number, number, number];

export const MOTION_PRESETS = [
  { id: 'ease', label: 'Ease', curve: [0.25, 0.1, 0.25, 1] },
  { id: 'linear', label: 'Linear', curve: [0, 0, 1, 1] },
  { id: 'ease-in-out', label: 'Ease in out', curve: [0.42, 0, 0.58, 1] },
  { id: 'snappy', label: 'Snappy', curve: [0.22, 1, 0.36, 1] },
  { id: 'anticipate', label: 'Anticipate', curve: [0.5, -0.4, 0.7, 1] },
  { id: 'overshoot', label: 'Overshoot', curve: [0.3, 1.5, 0.65, 1] },
] as const satisfies readonly { id: string; label: string; curve: BezierCurve }[];

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function coordinate(parameter: number, first: number, second: number): number {
  const inverse = 1 - parameter;
  return (
    3 * inverse * inverse * parameter * first +
    3 * inverse * parameter * parameter * second +
    parameter ** 3
  );
}

function derivative(parameter: number, first: number, second: number): number {
  return (
    3 * (1 - parameter) ** 2 * first +
    6 * (1 - parameter) * parameter * (second - first) +
    3 * parameter ** 2 * (1 - second)
  );
}

export function validCurve(curve: readonly number[]): curve is BezierCurve {
  return (
    curve.length === 4 &&
    curve.every(Number.isFinite) &&
    curve[0] >= 0 &&
    curve[0] <= 1 &&
    curve[2] >= 0 &&
    curve[2] <= 1 &&
    curve[1] >= -0.5 &&
    curve[1] <= 1.5 &&
    curve[3] >= -0.5 &&
    curve[3] <= 1.5
  );
}

// 時間對應 x 軸，必須先反解 Bx(t)；直接把時間代入 By(t) 不是 CSS easing
export function evaluateBezier(curve: BezierCurve, progress: number): number {
  if (!validCurve(curve) || !Number.isFinite(progress))
    throw new RangeError('Invalid motion input');
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  let parameter = progress;
  let low = 0;
  let high = 1;
  for (let index = 0; index < 48; index++) {
    const error = coordinate(parameter, curve[0], curve[2]) - progress;
    if (Math.abs(error) < 1e-13) break;
    if (error > 0) high = parameter;
    else low = parameter;
    const slope = derivative(parameter, curve[0], curve[2]);
    const next = Math.abs(slope) > 1e-8 ? parameter - error / slope : NaN;
    parameter = Number.isFinite(next) && next > low && next < high ? next : (low + high) / 2;
  }
  return coordinate(parameter, curve[1], curve[3]);
}

export function parseMotionInput(
  values: readonly string[],
  duration: string,
): { curve: BezierCurve; duration: number } | null {
  if (values.length !== 4 || [...values, duration].some((value) => !value.trim())) return null;
  const curve = values.map(Number);
  const milliseconds = Number(duration);
  return validCurve(curve) &&
    Number.isInteger(milliseconds) &&
    milliseconds >= 100 &&
    milliseconds <= 5000
    ? {
        curve: curve.map((value) => Number(value.toFixed(3))) as unknown as BezierCurve,
        duration: milliseconds,
      }
    : null;
}

export function formatCurve(curve: BezierCurve): string {
  return `cubic-bezier(${curve.map((value) => Number(value.toFixed(3))).join(', ')})`;
}

export function motionCss(curve: BezierCurve, duration: number): string {
  if (!validCurve(curve) || !Number.isInteger(duration) || duration < 100 || duration > 5000)
    throw new RangeError('Invalid motion export');
  return `.motion-demo {\n  --travel: 240px;\n  animation: move ${duration}ms ${formatCurve(curve)} both;\n}\n\n@keyframes move {\n  from { transform: translateX(0); }\n  to   { transform: translateX(var(--travel)); }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .motion-demo {\n    animation: none;\n    transform: translateX(var(--travel));\n  }\n}`;
}

export function setControlPoint(
  curve: BezierCurve,
  point: 0 | 1,
  x: number,
  y: number,
): BezierCurve {
  const next = [...curve];
  next[point * 2] = Number(clamp(x, 0, 1).toFixed(3));
  next[point * 2 + 1] = Number(clamp(y, -0.5, 1.5).toFixed(3));
  return next as unknown as BezierCurve;
}
