const widths = [480, 960, 1600] as const;
export function mediaPresentation(url: string, position?: { x: number; y: number }) {
  const managed = /^\/media\/[a-f0-9-]{36}\.webp$/.test(url);
  const coordinate = (n: unknown) =>
    typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50;
  return {
    src: managed ? `${url}?w=960` : url,
    srcset: managed ? widths.map((w) => `${url}?w=${w} ${w}w`).join(', ') : undefined,
    style: `object-position: ${coordinate(position?.x)}% ${coordinate(position?.y)}%`,
  };
}
export function mediaWidth(value: string | null) {
  if (value === null) return null;
  const width = Number(value);
  return widths.some((w) => w === width) && String(width) === value ? width : false;
}
