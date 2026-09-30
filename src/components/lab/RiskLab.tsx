import { useEffect, useMemo, useRef, useState } from 'react';
import { useLabEnvironment } from './useLabEnvironment';
import {
  DEFAULT_RISK,
  RISK_FREE,
  riskAssets,
  riskMoments,
  setRiskWeight,
  validateRiskInput,
  type RiskBin,
  type RiskInput,
  type RiskRegime,
  type RiskResult,
  type RiskWorkerResponse,
} from '../../lib/lab/risk';
import '../../styles/lab-risk.css';

type Translate = (zh: string, en: string) => string;
type Status = 'waiting' | 'running' | 'complete' | 'cancelled' | 'hidden' | 'error' | 'invalid';
const pct = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`;
const assetName = (index: number, t: Translate) =>
  [t('股票', 'Equity'), t('債券', 'Bonds'), t('黃金', 'Gold')][index];
const W = 720,
  H = 280,
  LEFT = 64,
  RIGHT = 16,
  TOP = 18,
  BOTTOM = 34;
const line = (points: number[][]) =>
  points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

function FanChart({ result, t }: { result: RiskResult; t: Translate }) {
  const [mode, setMode] = useState<'fan' | 'sample'>('fan');
  const [at, setAt] = useState(result.fan.length - 1);
  const selected = result.fan[Math.min(at, result.fan.length - 1)];
  const bounds = mode === 'fan' ? result.fan.flatMap((p) => [p.p05, p.p95]) : result.samples.flat();
  const low = Math.min(...bounds) * 0.97,
    high = Math.max(...bounds) * 1.03;
  const x = (day: number) => LEFT + ((W - LEFT - RIGHT) * day) / result.days;
  const y = (value: number) => TOP + ((H - TOP - BOTTOM) * (high - value)) / (high - low);
  const band = (lower: 'p05' | 'p25', upper: 'p75' | 'p95') =>
    line([
      ...result.fan.map((p) => [x(p.day), y(p[upper])]),
      ...[...result.fan].reverse().map((p) => [x(p.day), y(p[lower])]),
    ]) + ' Z';
  return (
    <section className="lab-panel risk-fan" aria-labelledby="risk-fan-title">
      <div className="risk-section-title">
        <div>
          <span className="risk-index">01 / MONTE CARLO</span>
          <h3 id="risk-fan-title">
            {t('一年後，不只一種結果', 'One year. More than one outcome.')}
          </h3>
        </div>
        <div
          className="risk-view-switch"
          role="group"
          aria-label={t('路徑圖模式', 'Path chart mode')}
        >
          <button type="button" aria-pressed={mode === 'fan'} onClick={() => setMode('fan')}>
            {t('分位帶', 'Fan chart')}
          </button>
          <button type="button" aria-pressed={mode === 'sample'} onClick={() => setMode('sample')}>
            {t('12 條路徑', '12 paths')}
          </button>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={t('投資組合指數路徑，起點為 100', 'Portfolio index paths, starting at 100')}
        className="risk-chart"
      >
        {[0, 1, 2, 3].map((i) => {
          const value = low + ((high - low) * i) / 3;
          return (
            <g key={i}>
              <line x1={LEFT} x2={W - RIGHT} y1={y(value)} y2={y(value)} className="risk-grid" />
              <text x={LEFT - 8} y={y(value) + 4} textAnchor="end">
                {(value * 100).toFixed(0)}
              </text>
            </g>
          );
        })}
        {mode === 'fan' ? (
          <>
            <path d={band('p05', 'p95')} className="risk-band outer" />
            <path d={band('p25', 'p75')} className="risk-band inner" />
            <path d={line(result.fan.map((p) => [x(p.day), y(p.p50)]))} className="risk-median" />
          </>
        ) : (
          result.samples.map((path, i) => (
            <path
              key={i}
              d={line(path.map((value, day) => [x(day), y(value)]))}
              className={`risk-sample sample-${i % 3}`}
            />
          ))
        )}
        <line
          x1={x(selected.day)}
          x2={x(selected.day)}
          y1={TOP}
          y2={H - BOTTOM}
          className="risk-inspector"
        />
        <circle cx={x(selected.day)} cy={y(selected.p50)} r="4" className="risk-selected" />
        {[0, 63, 126, 189, 252]
          .filter((day) => day <= result.days)
          .map((day) => (
            <text
              key={day}
              className={day === 63 || day === 189 ? 'risk-minor-tick' : undefined}
              x={x(day)}
              y={H - 9}
              textAnchor={day === 0 ? 'start' : day === 252 ? 'end' : 'middle'}
            >
              {day}
            </text>
          ))}
      </svg>
      <div className="risk-chart-meta">
        <span>{t('投資組合指數 · 起點 100', 'Portfolio index · starts at 100')}</span>
        <span>{t('交易日', 'Trading days')}</span>
      </div>
      <label className="risk-inspect-control">
        <span>
          {t('檢視交易日', 'Inspect trading day')} <strong>{selected.day}</strong>
        </span>
        <input
          type="range"
          min="0"
          max={result.fan.length - 1}
          value={Math.min(at, result.fan.length - 1)}
          onChange={(event) => setAt(Number(event.target.value))}
          aria-label={t('檢視交易日', 'Inspect trading day')}
        />
      </label>
      <dl className="risk-quantiles">
        {(['p05', 'p25', 'p50', 'p75', 'p95'] as const).map((key) => (
          <div key={key}>
            <dt>{key.replace('p', 'P')}</dt>
            <dd>{(selected[key] * 100).toFixed(1)}</dd>
          </div>
        ))}
      </dl>
      <p className="lab-note">
        {t(
          '分位帶來自全部 10,000 條路徑，每 7 個交易日取一次截面，深色為 P25–P75，外層為 P05–P95；它不是單一路徑的上下界',
          'Bands sample all 10,000 paths every 7 trading days: inner P25–P75, outer P05–P95. They are not bounds on individual paths.',
        )}
      </p>
    </section>
  );
}

function Histogram({
  bins,
  marker,
  title,
  t,
}: {
  bins: RiskBin[];
  marker?: number;
  title: string;
  t: Translate;
}) {
  const low = bins[0].low,
    high = bins.at(-1)!.high,
    max = Math.max(...bins.map((bin) => bin.count));
  const x = (value: number) => LEFT + ((W - LEFT - RIGHT) * (value - low)) / (high - low);
  const bottom = H - BOTTOM;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={title}
      className="risk-chart risk-histogram"
    >
      {[0, 0.5, 1].map((n) => (
        <g key={n}>
          <line
            x1={LEFT}
            x2={W - RIGHT}
            y1={bottom - n * (bottom - TOP)}
            y2={bottom - n * (bottom - TOP)}
            className="risk-grid"
          />
          <text x={LEFT - 8} y={bottom - n * (bottom - TOP) + 4} textAnchor="end">
            {Math.round(max * n)}
          </text>
        </g>
      ))}
      {bins.map((bin, index) => {
        const height = ((bottom - TOP) * bin.count) / Math.max(1, max);
        return (
          <rect
            key={index}
            x={x(bin.low) + 0.6}
            y={bottom - height}
            width={Math.max(0, x(bin.high) - x(bin.low) - 1.2)}
            height={height}
            className={marker !== undefined && bin.high <= marker ? 'risk-tail-bar' : 'risk-bar'}
          >
            <title>
              {pct(bin.low)} – {pct(bin.high)}: {bin.count} {t('條路徑', 'paths')}
            </title>
          </rect>
        );
      })}
      {[low, (low + high) / 2, high].map((value, i) => (
        <text
          key={i}
          x={x(value)}
          y={H - 9}
          textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
        >
          {pct(value, 0)}
        </text>
      ))}
      {marker !== undefined && marker >= low && marker <= high && (
        <>
          <line x1={x(marker)} x2={x(marker)} y1={TOP} y2={bottom} className="risk-inspector" />
          <text x={x(marker) + 5} y={TOP + 10}>
            VaR
          </text>
        </>
      )}
    </svg>
  );
}

function Frontier({
  result,
  onSelect,
  t,
}: {
  result: RiskResult;
  onSelect: (weights: number[]) => void;
  t: Translate;
}) {
  const points = result.candidates;
  const low = Math.min(...points.map((p) => p.expectedReturn)) - 0.01,
    high = Math.max(...points.map((p) => p.expectedReturn)) + 0.01;
  const maxVol = Math.max(...points.map((p) => p.volatility)) * 1.08;
  const x = (value: number) => LEFT + ((W - LEFT - RIGHT) * value) / maxVol;
  const y = (value: number) => TOP + ((H - TOP - BOTTOM) * (high - value)) / (high - low);
  const minRisk = points.reduce((a, b) => (a.volatility < b.volatility ? a : b));
  const bestSharpe = points.reduce((a, b) =>
    (a.expectedReturn - RISK_FREE) / a.volatility > (b.expectedReturn - RISK_FREE) / b.volatility
      ? a
      : b,
  );
  return (
    <section className="lab-panel risk-frontier">
      <div className="risk-section-title">
        <div>
          <span className="risk-index">04 / ALLOCATION SPACE</span>
          <h3>{t('報酬與風險之間', 'The risk–return trade-off')}</h3>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={t(
          '離散有效前緣與目前配置',
          'Discrete efficient frontier and current allocation',
        )}
        className="risk-chart"
      >
        {[0, 1, 2, 3].map((i) => {
          const value = low + ((high - low) * i) / 3;
          return (
            <g key={i}>
              <line x1={LEFT} x2={W - RIGHT} y1={y(value)} y2={y(value)} className="risk-grid" />
              <text x={LEFT - 8} y={y(value) + 4} textAnchor="end">
                {pct(value, 0)}
              </text>
            </g>
          );
        })}
        <path
          d={points
            .map(
              (point) =>
                `M${x(point.volatility).toFixed(2)},${y(point.expectedReturn).toFixed(2)}h.25`,
            )
            .join(' ')}
          className="risk-cloud"
        />
        <path
          d={line(result.frontier.map((point) => [x(point.volatility), y(point.expectedReturn)]))}
          className="risk-median"
        />
        <circle
          cx={x(result.moments.volatility)}
          cy={y(result.moments.expectedReturn)}
          r="6"
          className="risk-selected"
        />
        {[0, 1, 2, 3].map((i) => (
          <text
            key={i}
            x={x((maxVol * i) / 3)}
            y={H - 9}
            textAnchor={i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}
          >
            {pct((maxVol * i) / 3, 0)}
          </text>
        ))}
      </svg>
      <div className="risk-chart-meta">
        <span>{t('縱軸：1 年期望報酬', 'Y: 1Y expected return')}</span>
        <span>{t('橫軸：1 年報酬標準差', 'X: 1Y return standard deviation')}</span>
      </div>
      <div className="risk-frontier-actions">
        <button type="button" className="lab-button" onClick={() => onSelect(minRisk.weights)}>
          {t('套用網格最低波動配置', 'Use grid minimum volatility')}
        </button>
        <button type="button" className="lab-button" onClick={() => onSelect(bestSharpe.weights)}>
          {t('套用網格最高 Sharpe 配置', 'Use grid highest Sharpe')}
        </button>
      </div>
      <p className="lab-note">
        {t(
          '1,326 個只做多配置，以 2% 為步進枚舉，再保留未被更低風險與更高報酬支配的候選點；此曲線為網格近似，不是連續最佳化解',
          'Enumerates 1,326 long-only allocations in 2% steps and retains non-dominated risk–return candidates. This is a grid approximation, not a continuous optimizer.',
        )}
      </p>
    </section>
  );
}

export default function RiskLab() {
  const { t, visible } = useLabEnvironment();
  const [weights, setWeights] = useState(DEFAULT_RISK.weights);
  const [correlation, setCorrelation] = useState(DEFAULT_RISK.correlation);
  const [regime, setRegime] = useState<RiskRegime>('baseline');
  const [seed, setSeed] = useState(String(DEFAULT_RISK.seed));
  const [revision, setRevision] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [status, setStatus] = useState<Status>('waiting');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<RiskResult | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const worker = useRef<Worker | null>(null);
  const runId = useRef(0);
  const completedRun = useRef<{
    input: RiskInput;
    revision: number;
    result: RiskResult;
    elapsed: number;
  } | null>(null);
  const input = useMemo<RiskInput>(
    () => ({
      ...DEFAULT_RISK,
      weights,
      correlation,
      regime,
      seed: seed.trim() ? Number(seed) : NaN,
    }),
    [weights, correlation, regime, seed],
  );
  const validation = useMemo(() => {
    try {
      validateRiskInput(input);
      return '';
    } catch (error) {
      return error instanceof Error ? error.message : 'INVALID';
    }
  }, [input]);
  const moments = useMemo(() => (validation ? null : riskMoments(input)), [input, validation]);
  const assets = riskAssets(regime);
  useEffect(() => {
    const id = ++runId.current;
    worker.current?.terminate();
    worker.current = null;
    setResult(null);
    setProgress(0);
    if (validation) {
      setStatus('invalid');
      return;
    }
    if (stopped) {
      setStatus('cancelled');
      return;
    }
    // 已完成的結果不因切換分頁而重算，只有進行中的工作需要在回來時重啟
    if (completedRun.current?.input === input && completedRun.current.revision === revision) {
      setResult(completedRun.current.result);
      setElapsed(completedRun.current.elapsed);
      setProgress(completedRun.current.result.paths);
      setStatus('complete');
      return;
    }
    if (!visible) {
      setStatus('hidden');
      return;
    }
    setStatus('waiting');
    let instance: Worker | undefined;
    const timer = setTimeout(() => {
      if (id !== runId.current) return;
      try {
        instance = new Worker(new URL('../../workers/risk.worker.ts', import.meta.url), {
          type: 'module',
        });
        worker.current = instance;
        setStatus('running');
        instance.onmessage = (event: MessageEvent<RiskWorkerResponse>) => {
          const message = event.data;
          if (id !== runId.current || message.id !== id) return;
          if (message.type === 'progress') setProgress(message.completed);
          else {
            if (message.type === 'result') {
              completedRun.current = {
                input,
                revision,
                result: message.result,
                elapsed: message.elapsed,
              };
              setResult(message.result);
              setElapsed(message.elapsed);
              setProgress(message.result.paths);
              setStatus('complete');
            } else setStatus('error');
            instance?.terminate();
            if (worker.current === instance) worker.current = null;
          }
        };
        instance.onerror = () => {
          if (id === runId.current) {
            setStatus('error');
            instance?.terminate();
            worker.current = null;
          }
        };
        instance.postMessage({ type: 'run', id, input });
      } catch {
        if (id === runId.current) setStatus('error');
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      if (runId.current === id) ++runId.current;
      if (instance) {
        instance.onmessage = null;
        instance.onerror = null;
      }
      instance?.terminate();
      if (worker.current === instance) worker.current = null;
    };
  }, [input, revision, stopped, visible, validation]);
  const change = (action: () => void) => {
    setStopped(false);
    action();
  };
  const cancel = () => {
    const current = worker.current;
    current?.postMessage({ type: 'cancel', id: runId.current });
    ++runId.current;
    current?.terminate();
    worker.current = null;
    setStopped(true);
    setStatus('cancelled');
  };
  const reset = () => {
    setWeights(DEFAULT_RISK.weights);
    setCorrelation(DEFAULT_RISK.correlation);
    setRegime('baseline');
    setSeed(String(DEFAULT_RISK.seed));
    setStopped(false);
    setRevision((value) => value + 1);
  };
  const statuses: Record<Status, string> = {
    waiting: t('等待參數穩定', 'Waiting for input'),
    running: t('背景運算中', 'Computing in background'),
    complete: t('模擬完成', 'Simulation complete'),
    cancelled: t('已取消，可重新執行', 'Cancelled — ready to restart'),
    hidden: t('分頁隱藏時停止運算，返回後重新執行', 'Hidden tab: stopped; restarts when visible'),
    error: t('背景運算失敗，請重試', 'Worker failed — please retry'),
    invalid: t('請修正參數後再執行', 'Correct the parameters to continue'),
  };
  const validationMessage =
    validation === 'CORRELATION'
      ? t(
          '這組相關係數無法形成有效的半正定矩陣，請降低其中一組相關係數，或重設參數',
          'These correlations do not form a positive semidefinite matrix. Adjust a pair or reset the inputs.',
        )
      : t('種子必須是 0 至 4294967295 的整數', 'Seed must be an integer from 0 to 4294967295.');
  return (
    <div className="risk-lab" data-risk-lab data-risk-status={status} data-risk-seed={result?.seed}>
      <div className="risk-context">
        <span>MONTE CARLO / 10,000 × 252</span>
        <span>{t('假設資料 · 1 年 · 買入持有', 'Hypothetical data · 1 year · buy and hold')}</span>
      </div>
      <div className="risk-workbench">
        <aside className="risk-inputs" aria-label={t('風險模型參數', 'Risk model inputs')}>
          <fieldset className="risk-allocation">
            <legend>
              {t('資產配置', 'Allocation')} <span>100%</span>
            </legend>
            <div className="risk-allocation-bar" aria-hidden="true">
              {weights.map((weight, i) => (
                <span key={i} className={`asset-${i}`} style={{ flexGrow: weight }} />
              ))}
            </div>
            {weights.map((weight, i) => (
              <label className="risk-weight" key={i}>
                <span>
                  <i className={`asset-${i}`} />
                  {assetName(i, t)}
                  <output>{pct(weight, 0)}</output>
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={Math.round(weight * 100)}
                  aria-label={t(`${assetName(i, t)}配置`, `${assetName(i, t)} allocation`)}
                  onChange={(event) =>
                    change(() => setWeights(setRiskWeight(weights, i, Number(event.target.value))))
                  }
                />
              </label>
            ))}
            <p className="lab-note">
              {t(
                '調整一項時，其餘兩項按比例分配剩餘額度',
                'Changing one weight redistributes the remainder proportionally',
              )}
            </p>
          </fieldset>
          <label className="lab-field">
            <span>{t('市場狀態假設', 'Regime assumption')}</span>
            <select
              value={regime}
              aria-label={t('市場狀態假設', 'Regime assumption')}
              onChange={(event) => change(() => setRegime(event.target.value as RiskRegime))}
            >
              <option value="baseline">{t('基準', 'Baseline')}</option>
              <option value="stress">{t('壓力', 'Stress')}</option>
              <option value="recovery">{t('復甦', 'Recovery')}</option>
            </select>
          </label>
          <fieldset className="risk-correlation">
            <legend>{t('報酬衝擊相關性', 'Return-shock correlation')}</legend>
            {(
              [
                [0, 1],
                [0, 2],
                [1, 2],
              ] as const
            ).map(([i, j]) => (
              <label key={`${i}${j}`}>
                <span>
                  {assetName(i, t)} / {assetName(j, t)}
                  <output>{correlation[i][j].toFixed(2)}</output>
                </span>
                <input
                  type="range"
                  min="-0.95"
                  max="0.95"
                  step="0.05"
                  value={correlation[i][j]}
                  aria-label={`${assetName(i, t)} / ${assetName(j, t)} ${t('相關性', 'correlation')}`}
                  aria-invalid={validation === 'CORRELATION'}
                  onChange={(event) =>
                    change(() =>
                      setCorrelation(
                        correlation.map((row, a) =>
                          row.map((value, b) =>
                            (a === i && b === j) || (a === j && b === i)
                              ? Number(event.target.value)
                              : value,
                          ),
                        ),
                      ),
                    )
                  }
                />
              </label>
            ))}
            <table className="risk-matrix" aria-label={t('相關矩陣', 'Correlation matrix')}>
              <thead>
                <tr>
                  <th scope="col">ρ</th>
                  {[0, 1, 2].map((i) => (
                    <th scope="col" key={i}>
                      {assetName(i, t)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {correlation.map((row, i) => (
                  <tr key={i}>
                    <th scope="row">{assetName(i, t)}</th>
                    {row.map((value, j) => (
                      <td key={j}>{value.toFixed(2)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </fieldset>
          <label className="lab-field">
            <span>{t('隨機種子', 'Random seed')}</span>
            <input
              type="number"
              min="0"
              max="4294967295"
              step="1"
              value={seed}
              onChange={(event) => change(() => setSeed(event.target.value))}
            />
          </label>
          {validation && (
            <p role="alert" className="risk-error">
              {validationMessage}
            </p>
          )}
          {status === 'error' && (
            <p role="alert" className="risk-error">
              {t(
                '瀏覽器未能完成 Worker 運算，請重試或重設參數',
                'The browser could not complete the worker. Retry or reset the parameters.',
              )}
            </p>
          )}
          <div className="risk-buttons">
            <button
              className="lab-button"
              type="button"
              onClick={() => {
                setStopped(false);
                setRevision((value) => value + 1);
              }}
              disabled={!!validation}
            >
              {status === 'error' ? t('重試模擬', 'Retry simulation') : t('重新模擬', 'Run again')}
            </button>
            <button
              className="lab-button"
              type="button"
              onClick={cancel}
              disabled={status !== 'running' && status !== 'waiting'}
            >
              {t('取消', 'Cancel')}
            </button>
            <button className="lab-button" type="button" onClick={reset}>
              {t('重設', 'Reset')}
            </button>
          </div>
        </aside>
        <div className="risk-output">
          <div className="lab-metrics risk-headline-metrics">
            {[
              [
                t('1 年期望報酬', '1Y expected return'),
                moments ? pct(moments.expectedReturn) : '—',
              ],
              [
                t('1 年報酬標準差', '1Y return standard deviation'),
                moments ? pct(moments.volatility) : '—',
              ],
              ['Sharpe', moments?.sharpe?.toFixed(2) ?? '—'],
            ].map(([label, value]) => (
              <div className="lab-metric" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div className="risk-run-state">
            <div role="status" aria-live="polite" data-risk-run-status>
              {statuses[status]}
              {status === 'complete' && ` · ${(elapsed / 1000).toFixed(2)}s`}
            </div>
            <span className="risk-run-count" aria-hidden="true">
              {progress.toLocaleString('en-US')} / 10,000
            </span>
            <progress
              value={progress}
              max={10_000}
              aria-label={t('模擬進度', 'Simulation progress')}
            />
          </div>
          {result ? (
            <div data-risk-results>
              <FanChart result={result} t={t} />
              <div className="risk-distributions">
                <section className="lab-panel">
                  <span className="risk-index">02 / TAIL RISK</span>
                  <h3>{t('一年報酬分布', 'One-year return distribution')}</h3>
                  <Histogram
                    bins={result.terminalHistogram}
                    marker={-result.var95}
                    title={t('10,000 條路徑的終值報酬分布', 'Terminal returns across 10,000 paths')}
                    t={t}
                  />
                  <dl className="risk-stat-pair">
                    <div>
                      <dt>VaR 95%</dt>
                      <dd data-risk-var>{pct(result.var95)}</dd>
                    </div>
                    <div>
                      <dt>CVaR 95%</dt>
                      <dd data-risk-cvar>{pct(result.cvar95)}</dd>
                    </div>
                  </dl>
                  <p className="lab-note">
                    {t(
                      '以本金百分比表示淨損失：VaR 是第 95 百分位損失，CVaR 是最差 5% 路徑的平均損失；負值表示獲利',
                      'Net loss as a share of starting capital: VaR is the 95th-percentile loss; CVaR averages the worst 5% of paths. Negative values mean a gain.',
                    )}
                  </p>
                </section>
                <section className="lab-panel">
                  <span className="risk-index">03 / UNDERWATER</span>
                  <h3>{t('路徑最大回撤分布', 'Maximum drawdown distribution')}</h3>
                  <Histogram
                    bins={result.drawdownHistogram}
                    title={t(
                      '10,000 條路徑的最大回撤分布',
                      'Maximum drawdowns across 10,000 paths',
                    )}
                    t={t}
                  />
                  <dl className="risk-stat-pair">
                    <div>
                      <dt>{t('回撤中位數', 'Median drawdown')}</dt>
                      <dd>{pct(result.medianDrawdown)}</dd>
                    </div>
                    <div>
                      <dt>{t('回撤 P95', 'Drawdown P95')}</dt>
                      <dd>{pct(result.drawdown95)}</dd>
                    </div>
                  </dl>
                  <p className="lab-note">
                    {t(
                      '每條路徑逐日記錄高點到後續低點的最大跌幅，不等同於年末損失',
                      'Tracks each path’s largest daily peak-to-trough loss, which differs from its year-end loss.',
                    )}
                  </p>
                </section>
              </div>
              <Frontier result={result} onSelect={(next) => change(() => setWeights(next))} t={t} />
              <details className="risk-audit">
                <summary>{t('查看模擬核對數字', 'Inspect simulation diagnostics')}</summary>
                <dl>
                  <div>
                    <dt>{t('完整路徑', 'Completed paths')}</dt>
                    <dd data-risk-completed>
                      {result.paths.toLocaleString('en-US')} × {result.days}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('模擬平均報酬', 'Simulated mean return')}</dt>
                    <dd>{pct(result.meanReturn, 2)}</dd>
                  </div>
                  <div>
                    <dt>{t('模擬報酬標準差', 'Simulated return standard deviation')}</dt>
                    <dd>{pct(result.volatility, 2)}</dd>
                  </div>
                  <div>
                    <dt>{t('年末虧損比例', 'Year-end loss probability')}</dt>
                    <dd>{pct(result.lossProbability, 2)}</dd>
                  </div>
                  <div>
                    <dt>{t('樣本最大回撤', 'Worst sampled drawdown')}</dt>
                    <dd>{pct(result.worstDrawdown, 2)}</dd>
                  </div>
                  <div>
                    <dt>{t('種子', 'Seed')}</dt>
                    <dd>{result.seed}</dd>
                  </div>
                </dl>
              </details>
            </div>
          ) : (
            <div className="risk-empty" data-risk-empty>
              <span className="risk-index">10,000 PATHS / 252 DAYS / 3 ASSETS</span>
              <h3>
                {status === 'running' || status === 'waiting'
                  ? t('計算 10,000 條抽樣路徑', 'Computing 10,000 sampled paths')
                  : t('準備下一次模擬', 'Ready for the next simulation')}
              </h3>
              <p>
                {t(
                  '運算在背景執行，調整參數仍可即時操作；結果只會套用到目前這組設定',
                  'The worker runs in the background while the controls remain responsive. Results apply only to the current inputs.',
                )}
              </p>
            </div>
          )}
        </div>
      </div>
      <section className="risk-assumptions">
        <h3>{t('讀懂這個模型', 'Read the model')}</h3>
        <p>
          {t(
            '這些是為工程展示設定的假設，不是歷史行情、報酬預測或投資建議；固定狀態的 GBM 無法描述跳躍、流動性危機與真實市場厚尾',
            'These are engineering assumptions, not historical prices, forecasts, or investment advice. Constant-regime GBM does not capture jumps, liquidity crises, or real-market fat tails.',
          )}
        </p>
        <div className="risk-assumption-grid">
          <table>
            <caption>
              {t('目前狀態的年化模型參數', 'Annual model parameters for the current regime')}
            </caption>
            <thead>
              <tr>
                <th scope="col">{t('資產', 'Asset')}</th>
                <th scope="col">μ</th>
                <th scope="col">σ</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset, i) => (
                <tr key={asset.key}>
                  <th scope="row">{assetName(i, t)}</th>
                  <td>{pct(asset.mu)}</td>
                  <td>{pct(asset.sigma)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div>
            <p>
              {t(
                '初始資產價格標準化為 1，資產份額固定、不再平衡，未計交易成本；每年 252 個交易日，Sharpe 的無風險年報酬假設為 2.5%',
                'Asset prices start at 1, holdings stay fixed without rebalancing, and transaction costs are excluded. There are 252 trading days per year; Sharpe assumes a 2.5% annual risk-free return.',
              )}
            </p>
            <code>Sᵢ(t+Δt) = Sᵢ(t) exp[(μᵢ−σᵢ²/2)Δt + σᵢ√Δt (Lz)ᵢ]</code>
            <p className="lab-note">
              {t(
                'μ 是 GBM 漂移，不是直接的年報酬率；期望年報酬為 exp(μ)−1，相關矩陣必須是半正定矩陣',
                'μ is the GBM drift, not the direct annual return; expected annual return is exp(μ)−1. The correlation matrix must be positive semidefinite.',
              )}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
