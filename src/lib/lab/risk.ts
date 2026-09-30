export type RiskRegime = 'baseline' | 'stress' | 'recovery';
export interface RiskAsset {
  key: string;
  mu: number;
  sigma: number;
}
export interface RiskInput {
  weights: number[];
  correlation: number[][];
  regime: RiskRegime;
  seed: number;
  paths: number;
  days: number;
}
export interface RiskPoint {
  volatility: number;
  expectedReturn: number;
  weights: number[];
}
export interface RiskMoments {
  expectedReturn: number;
  volatility: number;
  sharpe: number | null;
}
export interface RiskBin {
  low: number;
  high: number;
  count: number;
}
export interface RiskResult {
  paths: number;
  days: number;
  seed: number;
  meanReturn: number;
  volatility: number;
  var95: number;
  cvar95: number;
  lossProbability: number;
  medianDrawdown: number;
  drawdown95: number;
  worstDrawdown: number;
  terminalQuantiles: number[];
  terminalHistogram: RiskBin[];
  drawdownHistogram: RiskBin[];
  fan: { day: number; p05: number; p25: number; p50: number; p75: number; p95: number }[];
  samples: number[][];
  moments: RiskMoments;
  frontier: RiskPoint[];
  candidates: RiskPoint[];
}
export const RISK_FREE = 0.025;
export const DEFAULT_RISK: RiskInput = {
  weights: [0.6, 0.3, 0.1],
  correlation: [
    [1, 0.15, 0.05],
    [0.15, 1, 0.1],
    [0.05, 0.1, 1],
  ],
  regime: 'baseline',
  seed: 2026,
  paths: 10_000,
  days: 252,
};
export function riskAssets(regime: RiskRegime): RiskAsset[] {
  const profiles: Record<RiskRegime, number[][]> = {
    baseline: [
      [0.08, 0.2],
      [0.035, 0.07],
      [0.05, 0.16],
    ],
    stress: [
      [-0.18, 0.38],
      [-0.02, 0.12],
      [0.04, 0.25],
    ],
    recovery: [
      [0.16, 0.26],
      [0.04, 0.08],
      [0.03, 0.18],
    ],
  };
  const profile = profiles[regime];
  if (!profile) throw new Error('REGIME');
  return ['equity', 'bonds', 'gold'].map((key, i) => ({
    key,
    mu: profile[i][0],
    sigma: profile[i][1],
  }));
}

export function setRiskWeight(weights: number[], index: number, percentage: number): number[] {
  if (
    weights.length !== 3 ||
    !Number.isInteger(index) ||
    index < 0 ||
    index > 2 ||
    !Number.isFinite(percentage)
  )
    throw new Error('WEIGHTS');
  const selected = Math.max(0, Math.min(100, Math.round(percentage)));
  const others = [0, 1, 2].filter((i) => i !== index);
  const remaining = 100 - selected;
  const otherTotal = weights[others[0]] + weights[others[1]];
  const first = Math.round(remaining * (otherTotal > 0 ? weights[others[0]] / otherTotal : 0.5));
  const result = [...weights];
  result[index] = selected / 100;
  result[others[0]] = first / 100;
  result[others[1]] = (remaining - first) / 100;
  return result;
}

export function cholesky(matrix: number[][]): number[][] {
  const n = matrix.length;
  if (n !== 3 || matrix.some((row) => row.length !== n)) throw new Error('CORRELATION');
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const value = matrix[i][j];
      if (
        !Number.isFinite(value) ||
        Math.abs(value) > 1 ||
        Math.abs(value - matrix[j][i]) > 1e-10 ||
        (i === j && Math.abs(value - 1) > 1e-10)
      )
        throw new Error('CORRELATION');
    }
  const lower = Array.from({ length: n }, () => Array(n).fill(0) as number[]);
  for (let i = 0; i < n; i++)
    for (let j = 0; j <= i; j++) {
      let value = matrix[i][j];
      for (let k = 0; k < j; k++) value -= lower[i][k] * lower[j][k];
      if (i === j) {
        if (value < -1e-10) throw new Error('CORRELATION');
        lower[i][j] = Math.sqrt(Math.max(0, value));
      } else if (lower[j][j] > 1e-10) lower[i][j] = value / lower[j][j];
      else if (Math.abs(value) > 1e-10) throw new Error('CORRELATION');
    }
  return lower;
}

export function validateRiskInput(input: RiskInput) {
  if (
    input.weights.length !== 3 ||
    input.weights.some((w) => !Number.isFinite(w) || w < 0 || w > 1) ||
    Math.abs(input.weights.reduce((a, b) => a + b, 0) - 1) > 1e-9
  )
    throw new Error('WEIGHTS');
  if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 0xffff_ffff)
    throw new Error('SEED');
  if (
    !Number.isInteger(input.paths) ||
    input.paths < 1 ||
    input.paths > 10_000 ||
    !Number.isInteger(input.days) ||
    input.days < 1 ||
    input.days > 252
  )
    throw new Error('LIMITS');
  riskAssets(input.regime);
  cholesky(input.correlation);
}

export function seededNormal(seed: number): () => number {
  let state = seed >>> 0;
  let spare: number | undefined;
  const uniform = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => {
    if (spare !== undefined) {
      const value = spare;
      spare = undefined;
      return value;
    }
    const radius = Math.sqrt(-2 * Math.log(1 - uniform()));
    const angle = 2 * Math.PI * uniform();
    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
}

// 買入持有的終值矩：E[Sᵢ]=exp(μᵢT)，Cov(Sᵢ,Sⱼ)=exp((μᵢ+μⱼ)T)·expm1(ρᵢⱼσᵢσⱼT)
export function riskMoments(input: RiskInput): RiskMoments {
  const assets = riskAssets(input.regime);
  const years = input.days / 252;
  let mean = 0,
    variance = 0;
  for (let i = 0; i < 3; i++) {
    mean += input.weights[i] * Math.exp(assets[i].mu * years);
    for (let j = 0; j < 3; j++)
      variance +=
        input.weights[i] *
        input.weights[j] *
        Math.exp((assets[i].mu + assets[j].mu) * years) *
        Math.expm1(input.correlation[i][j] * assets[i].sigma * assets[j].sigma * years);
  }
  const volatility = Math.sqrt(Math.max(0, variance));
  const expectedReturn = mean - 1;
  return {
    expectedReturn,
    volatility,
    sharpe:
      volatility > 1e-12
        ? (expectedReturn - Math.expm1(Math.log1p(RISK_FREE) * years)) / volatility
        : null,
  };
}

export function riskFrontier(input: RiskInput, steps = 50) {
  if (!Number.isInteger(steps) || steps < 1 || steps > 100) throw new Error('LIMITS');
  const candidates: RiskPoint[] = [];
  for (let i = 0; i <= steps; i++)
    for (let j = 0; j <= steps - i; j++) {
      const weights = [i / steps, j / steps, (steps - i - j) / steps];
      const result = riskMoments({ ...input, weights });
      candidates.push({
        weights,
        volatility: result.volatility,
        expectedReturn: result.expectedReturn,
      });
    }
  const sorted = [...candidates].sort(
    (a, b) => a.volatility - b.volatility || b.expectedReturn - a.expectedReturn,
  );
  const frontier: RiskPoint[] = [];
  let best = -Infinity;
  for (const candidate of sorted)
    if (candidate.expectedReturn > best + 1e-12) {
      frontier.push(candidate);
      best = candidate.expectedReturn;
    }
  return { candidates, frontier };
}

export function quantile(sorted: ArrayLike<number>, probability: number) {
  if (!sorted.length || probability < 0 || probability > 1) throw new Error('QUANTILE');
  const at = (sorted.length - 1) * probability;
  const lower = Math.floor(at),
    upper = Math.ceil(at);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (at - lower);
}

export function tailRisk(returns: ArrayLike<number>) {
  if (!returns.length) throw new Error('EMPTY');
  const losses = Array.from(returns, (r) => -r).sort((a, b) => a - b);
  const var95 = losses[Math.ceil(losses.length * 0.95) - 1];
  const mass = losses.length * 0.05;
  let remaining = mass,
    total = 0;
  for (let i = losses.length - 1; remaining > 1e-12; i--) {
    const portion = Math.min(1, remaining);
    total += losses[i] * portion;
    remaining -= portion;
  }
  return { var95, cvar95: total / mass };
}

export function histogram(values: ArrayLike<number>, count = 30): RiskBin[] {
  if (!values.length || !Number.isInteger(count) || count < 1 || count > 100)
    throw new Error('HISTOGRAM');
  let low = Infinity,
    high = -Infinity;
  for (let i = 0; i < values.length; i++) {
    low = Math.min(low, values[i]);
    high = Math.max(high, values[i]);
  }
  if (low === high) {
    low -= 0.005;
    high += 0.005;
  }
  const step = (high - low) / count;
  const bins = Array.from({ length: count }, (_, i) => ({
    low: low + step * i,
    high: low + step * (i + 1),
    count: 0,
  }));
  for (let i = 0; i < values.length; i++)
    bins[Math.min(count - 1, Math.floor((values[i] - low) / step))].count++;
  return bins;
}

// 只保留每 7 個交易日的分位數樣本與 12 條展示路徑，不把 756 萬資產價格傳回主執行緒
export function createRiskSimulation(raw: RiskInput) {
  validateRiskInput(raw);
  const input: RiskInput = {
    ...raw,
    weights: [...raw.weights],
    correlation: raw.correlation.map((row) => [...row]),
  };
  const assets = riskAssets(input.regime),
    lower = cholesky(input.correlation),
    normal = seededNormal(input.seed);
  const terminals = new Float64Array(input.paths),
    drawdowns = new Float64Array(input.paths);
  const checkpoints = [
    0,
    ...Array.from({ length: Math.floor(input.days / 7) }, (_, i) => (i + 1) * 7),
  ];
  if (checkpoints.at(-1) !== input.days) checkpoints.push(input.days);
  const checkpointSamples = checkpoints.map(() => new Float64Array(input.paths));
  const samples: number[][] = [];
  const drifts = assets.map((asset) => (asset.mu - (asset.sigma * asset.sigma) / 2) / 252);
  const sigmas = assets.map((asset) => asset.sigma / Math.sqrt(252));
  let completed = 0;
  let finalResult: RiskResult | undefined;
  return {
    get completed() {
      return completed;
    },
    batch(size = 96) {
      if (!Number.isInteger(size) || size < 1 || size > 10_000) throw new Error('LIMITS');
      const until = Math.min(input.paths, completed + size);
      for (; completed < until; completed++) {
        let p0 = 1,
          p1 = 1,
          p2 = 1,
          peak = 1,
          maxDrawdown = 0,
          value = 1,
          checkpoint = 1;
        const sample = completed < 12 ? [1] : null;
        checkpointSamples[0][completed] = 1;
        for (let day = 1; day <= input.days; day++) {
          const z0 = normal(),
            z1 = normal(),
            z2 = normal();
          p0 *= Math.exp(drifts[0] + sigmas[0] * lower[0][0] * z0);
          p1 *= Math.exp(drifts[1] + sigmas[1] * (lower[1][0] * z0 + lower[1][1] * z1));
          p2 *= Math.exp(
            drifts[2] + sigmas[2] * (lower[2][0] * z0 + lower[2][1] * z1 + lower[2][2] * z2),
          );
          value = input.weights[0] * p0 + input.weights[1] * p1 + input.weights[2] * p2;
          peak = Math.max(peak, value);
          maxDrawdown = Math.max(maxDrawdown, 1 - value / peak);
          if (sample) sample.push(value);
          if (day === checkpoints[checkpoint]) checkpointSamples[checkpoint++][completed] = value;
        }
        terminals[completed] = value - 1;
        drawdowns[completed] = maxDrawdown;
        if (sample) samples.push(sample);
      }
      return completed;
    },
    finish(): RiskResult {
      if (completed !== input.paths) throw new Error('INCOMPLETE');
      if (finalResult) return finalResult;
      const ordered = terminals.slice().sort(),
        orderedDrawdown = drawdowns.slice().sort();
      const meanReturn = terminals.reduce((sum, value) => sum + value, 0) / input.paths;
      const variance =
        terminals.reduce((sum, value) => sum + (value - meanReturn) ** 2, 0) /
        Math.max(1, input.paths - 1);
      const fan = checkpointSamples.map((values, i) => {
        values.sort();
        return {
          day: checkpoints[i],
          p05: quantile(values, 0.05),
          p25: quantile(values, 0.25),
          p50: quantile(values, 0.5),
          p75: quantile(values, 0.75),
          p95: quantile(values, 0.95),
        };
      });
      finalResult = {
        paths: input.paths,
        days: input.days,
        seed: input.seed,
        meanReturn,
        volatility: Math.sqrt(variance),
        ...tailRisk(terminals),
        lossProbability: terminals.filter((value) => value < 0).length / input.paths,
        medianDrawdown: quantile(orderedDrawdown, 0.5),
        drawdown95: quantile(orderedDrawdown, 0.95),
        worstDrawdown: orderedDrawdown.at(-1)!,
        terminalQuantiles: [0.05, 0.25, 0.5, 0.75, 0.95].map((p) => quantile(ordered, p)),
        terminalHistogram: histogram(terminals),
        drawdownHistogram: histogram(drawdowns),
        fan,
        samples,
        moments: riskMoments(input),
        ...riskFrontier(input),
      };
      return finalResult;
    },
  };
}

export type RiskWorkerRequest =
  { type: 'run'; id: number; input: RiskInput } | { type: 'cancel'; id: number };
export type RiskWorkerResponse =
  | { type: 'progress'; id: number; completed: number; total: number }
  | { type: 'result'; id: number; result: RiskResult; elapsed: number }
  | { type: 'error'; id: number; error: string };
