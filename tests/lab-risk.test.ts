import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RISK,
  RISK_FREE,
  cholesky,
  createRiskSimulation,
  histogram,
  quantile,
  riskAssets,
  riskFrontier,
  riskMoments,
  seededNormal,
  setRiskWeight,
  tailRisk,
  validateRiskInput,
  type RiskInput,
} from '../src/lib/lab/risk';

const input = (overrides: Partial<RiskInput> = {}): RiskInput => ({
  ...DEFAULT_RISK,
  weights: [...DEFAULT_RISK.weights],
  correlation: DEFAULT_RISK.correlation.map((row) => [...row]),
  ...overrides,
});
function simulate(config: RiskInput, batch = 96) {
  const job = createRiskSimulation(config);
  while (job.completed < config.paths) job.batch(batch);
  return job.finish();
}

describe('投資組合風險模擬的數學與狀態', () => {
  it('配置調整始終合計 100%，包含全部投入單一資產後的再分配', () => {
    let weights = [0.6, 0.3, 0.1];
    for (const [index, percentage] of [
      [0, 100],
      [1, 100],
      [2, 0],
      [0, 57],
      [1, 0],
      [2, 100],
      [2, 33],
    ]) {
      weights = setRiskWeight(weights, index, percentage);
      expect(weights[index]).toBeCloseTo(percentage / 100, 12);
      expect(weights.reduce((a, b) => a + b)).toBeCloseTo(1, 12);
      expect(weights.every((value) => value >= 0 && value <= 1)).toBe(true);
    }
    expect(setRiskWeight([1, 0, 0], 0, 0)).toEqual([0, 0.5, 0.5]);
  });

  it('Cholesky 重建相關矩陣，接受完全共振的奇異矩陣並拒絕不一致的相關係數', () => {
    for (const matrix of [
      DEFAULT_RISK.correlation,
      [
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
      ],
      [
        [1, -1, 0],
        [-1, 1, 0],
        [0, 0, 1],
      ],
    ]) {
      const lower = cholesky(matrix);
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++)
          expect(lower[i].reduce((sum, value, k) => sum + value * lower[j][k], 0)).toBeCloseTo(
            matrix[i][j],
            10,
          );
    }
    for (const matrix of [
      [
        [1, 0.95, 0.95],
        [0.95, 1, -0.95],
        [0.95, -0.95, 1],
      ],
      [
        [1, 0.2, 0],
        [0.3, 1, 0],
        [0, 0, 1],
      ],
      [
        [1, 1.1, 0],
        [1.1, 1, 0],
        [0, 0, 1],
      ],
      [
        [1, 1, 0],
        [1, 1, 0.3],
        [0, 0.3, 1],
      ],
    ])
      expect(() => cholesky(matrix)).toThrow('CORRELATION');
  });

  it('固定種子高斯噪音具有可重現性，樣本均值、變異與相關性符合輸入', () => {
    const normal = seededNormal(42),
      same = seededNormal(42),
      other = seededNormal(43);
    const first = Array.from({ length: 12 }, normal);
    expect(Array.from({ length: 12 }, same)).toEqual(first);
    expect(Array.from({ length: 12 }, other)).not.toEqual(first);
    const lower = cholesky(DEFAULT_RISK.correlation),
      draws: number[][] = [[], [], []];
    const n = 40_000;
    for (let i = 0; i < n; i++) {
      const z = [normal(), normal(), normal()];
      for (let asset = 0; asset < 3; asset++)
        draws[asset].push(lower[asset].reduce((sum, value, j) => sum + value * z[j], 0));
    }
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(draws[i].reduce((sum, value) => sum + value, 0) / n)).toBeLessThan(0.02);
      for (let j = 0; j < 3; j++)
        expect(
          Math.abs(
            draws[i].reduce((sum, value, k) => sum + value * draws[j][k], 0) / n -
              DEFAULT_RISK.correlation[i][j],
          ),
        ).toBeLessThan(0.025);
    }
  });

  it('單一資產解析終值矩符合 GBM 對數常態公式，Sharpe 使用相同一年尺度', () => {
    const moments = riskMoments(input({ weights: [1, 0, 0] }));
    const asset = riskAssets('baseline')[0];
    const expected = Math.expm1(asset.mu);
    const volatility = Math.sqrt(Math.exp(2 * asset.mu) * Math.expm1(asset.sigma ** 2));
    expect(moments.expectedReturn).toBeCloseTo(expected, 12);
    expect(moments.volatility).toBeCloseTo(volatility, 12);
    expect(moments.sharpe).toBeCloseTo((expected - RISK_FREE) / volatility, 12);
    expect(riskMoments(input()).volatility).toBeLessThan(moments.volatility);
  });

  it('VaR 與 CVaR 採損失符號，分數尾端權重與全獲利情況不被截成零', () => {
    const returns = Array.from({ length: 100 }, (_, i) => -(i + 1) / 100);
    expect(tailRisk(returns).var95).toBe(0.95);
    expect(tailRisk(returns).cvar95).toBeCloseTo(0.98, 12);
    expect(tailRisk([0.1, 0.2]).var95).toBe(-0.1);
    expect(tailRisk([0.1, 0.2]).cvar95).toBeCloseTo(-0.1, 12);
    const partial = tailRisk(Array.from({ length: 21 }, (_, i) => -i));
    expect(partial.var95).toBe(19);
    expect(partial.cvar95).toBeCloseTo((20 + 19 * 0.05) / 1.05, 12);
    expect(() => tailRisk([])).toThrow('EMPTY');
  });

  it('分位数與直方圖完整保留樣本，包含同值及最大邊界', () => {
    expect(quantile([0, 10], 0.25)).toBe(2.5);
    expect(quantile([7], 0.95)).toBe(7);
    expect(() => quantile([], 0.5)).toThrow();
    for (const values of [
      [-0.2, 0, 0.3, 0.8],
      [0.1, 0.1, 0.1],
    ]) {
      const bins = histogram(values);
      expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(values.length);
      expect(bins[0].low).toBeLessThanOrEqual(Math.min(...values));
      expect(bins.at(-1)!.high).toBeGreaterThanOrEqual(Math.max(...values));
    }
  });

  it('不同批次大小得到相同路徑與結果，未完成工作不能產生假結果', () => {
    const config = input({ paths: 120, days: 28 });
    const job = createRiskSimulation(config);
    expect(() => job.finish()).toThrow('INCOMPLETE');
    expect(job.batch(17)).toBe(17);
    config.weights[0] = 0;
    while (job.completed < config.paths) job.batch(17);
    const result = job.finish();
    expect(result).toEqual(simulate(input({ paths: 120, days: 28 }), 1));
    expect(job.finish()).toBe(result);
    expect(result).not.toEqual(simulate(input({ paths: 120, days: 28, seed: 2027 })));
  });

  it('完整 10,000×252 模擬符合解析矩，分位帶、回撤與尾端統計保持不變式', () => {
    const result = simulate(input());
    expect(result.paths).toBe(10_000);
    expect(result.days).toBe(252);
    expect(result.samples).toHaveLength(12);
    expect(
      result.samples.every(
        (path) => path.length === 253 && path[0] === 1 && path.every((value) => value > 0),
      ),
    ).toBe(true);
    expect(Math.abs(result.meanReturn - result.moments.expectedReturn)).toBeLessThan(
      (5 * result.moments.volatility) / Math.sqrt(result.paths),
    );
    expect(Math.abs(result.volatility - result.moments.volatility)).toBeLessThan(0.006);
    expect(result.fan[0]).toEqual({ day: 0, p05: 1, p25: 1, p50: 1, p75: 1, p95: 1 });
    expect(result.fan.at(-1)!.day).toBe(252);
    for (const point of result.fan)
      expect([point.p05, point.p25, point.p50, point.p75, point.p95]).toEqual(
        [point.p05, point.p25, point.p50, point.p75, point.p95].sort((a, b) => a - b),
      );
    expect(result.var95).toBeLessThanOrEqual(result.cvar95);
    expect(result.medianDrawdown).toBeGreaterThanOrEqual(0);
    expect(result.drawdown95).toBeGreaterThanOrEqual(result.medianDrawdown);
    expect(result.worstDrawdown).toBeLessThan(1);
    expect(result.worstDrawdown).toBeGreaterThanOrEqual(result.drawdown95);
    expect(result.terminalHistogram.reduce((sum, bin) => sum + bin.count, 0)).toBe(10_000);
    expect(result.drawdownHistogram.reduce((sum, bin) => sum + bin.count, 0)).toBe(10_000);
    expect(simulate(input({ regime: 'stress', paths: 1000 })).meanReturn).toBeLessThan(
      result.meanReturn,
    );
  });

  it('有效前緣是 1,326 個合法網格配置的非支配集合', () => {
    const { frontier, candidates } = riskFrontier(input());
    expect(candidates).toHaveLength(1326);
    expect(frontier.length).toBeGreaterThan(10);
    for (const candidate of candidates) {
      expect(candidate.weights.reduce((a, b) => a + b)).toBeCloseTo(1, 12);
      expect(candidate.weights.every((weight) => weight >= 0)).toBe(true);
    }
    for (const point of frontier)
      expect(
        candidates.some(
          (candidate) =>
            candidate.volatility < point.volatility - 1e-10 &&
            candidate.expectedReturn >= point.expectedReturn - 1e-10,
        ),
      ).toBe(false);
    for (let i = 1; i < frontier.length; i++) {
      expect(frontier[i].expectedReturn).toBeGreaterThan(frontier[i - 1].expectedReturn);
      expect(frontier[i].volatility).toBeGreaterThanOrEqual(frontier[i - 1].volatility);
    }
  });

  it('拒絕不合法的路徑量、種子與配置，避免無上限背景工作', () => {
    for (const overrides of [
      { paths: 10001 },
      { paths: 0 },
      { days: 253 },
      { days: 0 },
      { seed: NaN },
      { seed: 1.5 },
      { seed: -1 },
      { seed: 0x1_0000_0000 },
      { weights: [0.5, 0.5, 0.5] },
      { weights: [1.1, -0.1, 0] },
    ])
      expect(() => validateRiskInput(input(overrides))).toThrow();
    expect(() => validateRiskInput(input({ seed: 0 }))).not.toThrow();
    expect(() => validateRiskInput(input({ seed: 0xffff_ffff }))).not.toThrow();
  });
});
