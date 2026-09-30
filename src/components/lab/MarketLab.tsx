import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type SubmitEvent,
  type KeyboardEvent,
} from 'react';
import { MarketReplay, type Candle } from '../../lib/lab/market-replay';
import {
  generateMarket,
  marketScenarios,
  type MarketScenario,
} from '../../lib/lab/market-simulation';
import { MatchingBenchmark, type BenchmarkMetrics } from '../../lib/lab/market-benchmark';
import type { DepthLevel, OrderCommand, OrderSide } from '../../lib/lab/order-book';
import { useLabEnvironment } from './useLabEnvironment';
import '../../styles/lab-market.css';

type Translate = (zh: string, en: string) => string;
const scenarioLabels: Record<MarketScenario, [string, string]> = {
  bull: ['多頭趨勢', 'Bull trend'],
  bear: ['空頭趨勢', 'Bear trend'],
  sideways: ['區間震盪', 'Range bound'],
  volatile: ['高波動', 'High volatility'],
  crash: ['流動性急跌', 'Liquidity crash'],
  recovery: ['跌後復甦', 'Recovery'],
};
const price = (ticks: number | null | undefined) =>
  ticks === null || ticks === undefined ? '—' : (ticks / 100).toFixed(2);
const number = (value: number) => value.toLocaleString('en-US');
const timestamp = (milliseconds: number) =>
  `${Math.floor(milliseconds / 60000)
    .toString()
    .padStart(2, '0')}:${Math.floor((milliseconds % 60000) / 1000)
    .toString()
    .padStart(2, '0')}`;

function makeReplay(scenario: MarketScenario, seed: number) {
  const replay = new MarketReplay(generateMarket(scenario, seed));
  return replay.seek(Math.floor(replay.length * 0.72));
}

function PriceChart({
  candles,
  currentTime,
  t,
}: {
  candles: readonly Candle[];
  currentTime: number;
  t: Translate;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const selected = candles[Math.min(hover ?? candles.length - 1, candles.length - 1)];
  const left = 14;
  const right = 710;
  const top = 20;
  const bottom = 242;
  const width = right - left;
  const low = Math.min(...candles.map((candle) => candle.low));
  const high = Math.max(...candles.map((candle) => candle.high));
  const padding = Math.max(8, (high - low) * 0.13);
  const minimum = candles.length ? low - padding : 9990;
  const maximum = candles.length ? high + padding : 10010;
  const y = (value: number) => bottom - ((value - minimum) / (maximum - minimum)) * (bottom - top);
  const slots = Math.max(24, candles.length);
  const gap = width / slots;
  const x = (index: number) => left + (index + 0.5) * gap;
  const maximumVolume = Math.max(1, ...candles.map((candle) => candle.volume));
  const emas = useMemo(() => {
    let ema = candles[0]?.close ?? 0;
    return candles.map((candle, index) => {
      if (index) ema += (2 / 15) * (candle.close - ema);
      return ema;
    });
  }, [candles]);
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      event.key !== 'ArrowLeft' &&
      event.key !== 'ArrowRight' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    )
      return;
    event.preventDefault();
    setHover((previous) =>
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? candles.length - 1
          : Math.max(
              0,
              Math.min(
                candles.length - 1,
                (previous ?? candles.length - 1) + (event.key === 'ArrowLeft' ? -1 : 1),
              ),
            ),
    );
  };
  return (
    <figure className="market-chart">
      <figcaption className="market-chart-caption">
        <div>
          <strong>KAI / USD</strong>
          <span>{t('模擬市場', 'Simulated market')} · 15s OHLC</span>
        </div>
        <span className="market-chart-legend">
          <i /> EMA 14
        </span>
      </figcaption>
      <div className="market-ohlc" aria-live="off" data-testid="market-ohlc">
        {selected ? (
          <>
            <span>{timestamp(selected.time)}</span>
            <span>
              O <b>{price(selected.open)}</b>
            </span>
            <span>
              H <b>{price(selected.high)}</b>
            </span>
            <span>
              L <b>{price(selected.low)}</b>
            </span>
            <span>
              C <b>{price(selected.close)}</b>
            </span>
            <span>
              V <b>{number(selected.volume)}</b>
            </span>
          </>
        ) : (
          <span>{t('尚無成交，請單步或播放', 'No fills yet — step or play the tape')}</span>
        )}
      </div>
      <div
        className="market-chart-surface"
        tabIndex={0}
        role="group"
        aria-label={t(
          '價格圖，左右方向鍵切換 K 棒',
          'Price chart, use arrow keys to inspect candles',
        )}
        onKeyDown={key}
        onPointerLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
      >
        <svg
          viewBox="0 0 780 330"
          role="img"
          aria-label={t('實際撮合成交的價格與成交量', 'Prices and volume from matched orders')}
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const position = ((event.clientX - rect.left) / rect.width) * 780;
            const index = Math.floor((position - left) / gap);
            setHover(index >= 0 && index < candles.length ? index : null);
          }}
        >
          <title>{t('十五秒 K 線、EMA14 與成交量', '15-second candles, EMA14 and volume')}</title>
          {[0, 1, 2, 3, 4].map((index) => {
            const value = minimum + ((maximum - minimum) * index) / 4;
            return (
              <g key={index}>
                <line
                  x1={left}
                  x2={right}
                  y1={y(value)}
                  y2={y(value)}
                  className="market-chart-grid"
                />
                <text x={right + 12} y={y(value) + 4} className="market-chart-label">
                  {price(value)}
                </text>
              </g>
            );
          })}
          {candles.map((candle, index) => (
            <g
              key={candle.time}
              className={candle.close >= candle.open ? 'market-candle-up' : 'market-candle-down'}
            >
              <line
                x1={x(index)}
                x2={x(index)}
                y1={y(candle.high)}
                y2={y(candle.low)}
                className="market-wick"
              />
              <rect
                x={x(index) - gap * 0.28}
                y={Math.min(y(candle.open), y(candle.close))}
                width={gap * 0.56}
                height={Math.max(1.5, Math.abs(y(candle.open) - y(candle.close)))}
              />
              <rect
                x={x(index) - gap * 0.28}
                y={304 - (candle.volume / maximumVolume) * 40}
                width={gap * 0.56}
                height={(candle.volume / maximumVolume) * 40}
                className="market-volume-bar"
              />
            </g>
          ))}
          {emas.length > 1 && (
            <path
              d={emas
                .map(
                  (ema, index) => `${index ? 'L' : 'M'}${x(index).toFixed(2)},${y(ema).toFixed(2)}`,
                )
                .join(' ')}
              className="market-ema-line"
            />
          )}
          {selected && hover !== null && (
            <line
              x1={x(Math.min(hover, candles.length - 1))}
              x2={x(Math.min(hover, candles.length - 1))}
              y1={top}
              y2={305}
              className="market-crosshair"
            />
          )}
          <text x={left} y={326} className="market-chart-label">
            00:00
          </text>
          <text x={right} y={326} textAnchor="end" className="market-chart-label">
            {timestamp(currentTime)}
          </text>
          <text x={right + 12} y={286} className="market-chart-label">
            VOL
          </text>
        </svg>
      </div>
      <p className="market-chart-help">
        {t(
          '滑鼠移入或使用方向鍵查看 OHLC，最右側 K 棒可能尚未收盤',
          'Hover or use arrow keys for OHLC — the rightmost candle may still be forming',
        )}
      </p>
    </figure>
  );
}

function DepthTable({ side, levels, t }: { side: OrderSide; levels: DepthLevel[]; t: Translate }) {
  const maximum = Math.max(1, ...levels.map((level) => level.cumulative));
  return (
    <div className={`market-depth market-depth-${side}`}>
      <h4>{side === 'buy' ? t('買盤', 'Bids') : t('賣盤', 'Asks')}</h4>
      <table>
        <thead>
          <tr>
            <th scope="col">{t('價格', 'Price')}</th>
            <th scope="col">{t('數量', 'Qty')}</th>
            <th scope="col">{t('累計', 'Total')}</th>
          </tr>
        </thead>
        <tbody>
          {levels.map((level) => (
            <tr key={level.price}>
              <td>
                <span
                  className="market-depth-fill"
                  style={{ width: `${(level.cumulative / maximum) * 100}%` }}
                  aria-hidden="true"
                />
                <span>{price(level.price)}</span>
              </td>
              <td>{number(level.quantity)}</td>
              <td>{number(level.cumulative)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!levels.length && (
        <p className="market-empty">{t('此側沒有流動性', 'No liquidity on this side')}</p>
      )}
    </div>
  );
}

export default function MarketLab() {
  const { t, visible, reducedMotion } = useLabEnvironment();
  const formId = useId();
  const replayRef = useRef<MarketReplay | null>(null);
  if (!replayRef.current) replayRef.current = makeReplay('crash', 6149);
  const replay = replayRef.current;
  const [revision, setRevision] = useState(0);
  const [scenario, setScenario] = useState<MarketScenario>('crash');
  const [seed, setSeed] = useState('6149');
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [orderType, setOrderType] = useState<'limit' | 'market' | 'cancel'>('limit');
  const [side, setSide] = useState<OrderSide>('buy');
  const [quantity, setQuantity] = useState('20');
  const [limitPrice, setLimitPrice] = useState('98.00');
  const [cancelId, setCancelId] = useState('');
  const [message, setMessage] = useState<{ zh: string; en: string; error?: boolean } | null>(null);
  const customId = useRef(0);
  const benchmarkRef = useRef<MatchingBenchmark | null>(null);
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);
  const [benchmark, setBenchmark] = useState<BenchmarkMetrics | null>(null);
  const refresh = () => setRevision((previous) => previous + 1);
  const view = useMemo(
    () => ({
      bids: replay.book.depth('buy', 8),
      asks: replay.book.depth('sell', 8),
      candles: replay.candles.map((candle) => ({ ...candle })),
      trades: [...replay.trades].reverse().slice(0, 12),
      orders: replay.book.snapshot().orders,
      indicators: replay.indicators,
      spread: replay.book.spread,
      mid: replay.book.mid,
    }),
    [replay, revision],
  );
  const latest = replay.trades.at(-1);
  const lastEvent = replay.events[replay.cursor - 1];
  const cursorPercent = replay.length ? Math.round((replay.cursor / replay.length) * 100) : 0;

  useEffect(() => {
    if (!running || !visible || benchmarkRunning) return;
    let frame = 0;
    let previous = 0;
    let pending = 0;
    let lastPaint = 0;
    const tick = (time: number) => {
      if (previous) pending += (Math.min(100, time - previous) / 1000) * 25 * speed;
      previous = time;
      if (pending >= 1 && time - lastPaint >= (reducedMotion ? 200 : 70)) {
        const current = replayRef.current!;
        const count = Math.min(64, Math.floor(pending));
        pending -= count;
        current.seek(Math.min(current.length, current.cursor + count));
        refresh();
        lastPaint = time;
        if (current.cursor === current.length) {
          setRunning(false);
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, visible, speed, reducedMotion, benchmarkRunning]);

  useEffect(() => {
    if (!benchmarkRunning || !visible) return;
    let frame = 0;
    const tick = () => {
      const current = benchmarkRef.current;
      if (!current) return;
      const metrics = current.runBatch();
      setBenchmark(metrics);
      if (metrics.finished) {
        setBenchmarkRunning(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [benchmarkRunning, visible]);

  const regenerate = (nextScenario = scenario) => {
    const parsed = Number(seed);
    if (!/^\d+$/.test(seed) || !Number.isSafeInteger(parsed) || parsed > 0xffffffff) {
      setMessage({
        zh: '種子請使用 0 到 4294967295 的整數',
        en: 'Use an integer seed from 0 to 4294967295',
        error: true,
      });
      return;
    }
    setRunning(false);
    setScenario(nextScenario);
    replayRef.current = makeReplay(nextScenario, parsed);
    setCancelId('');
    setMessage(null);
    refresh();
  };

  const seek = (cursor: number) => {
    setRunning(false);
    replay.seek(cursor);
    setMessage(null);
    refresh();
  };

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRunning(false);
    try {
      const amount = Number(quantity);
      const ticks = Number(limitPrice) * 100;
      if (
        orderType !== 'cancel' &&
        (!Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000)
      )
        throw new Error('invalid-order');
      if (
        orderType === 'limit' &&
        (!Number.isFinite(ticks) || Math.abs(ticks - Math.round(ticks)) > 0.000001)
      )
        throw new Error('invalid-order');
      if (orderType === 'cancel' && !replay.book.has(cancelId)) throw new Error('missing-order');
      const id = `u${++customId.current}`;
      const command: OrderCommand =
        orderType === 'cancel'
          ? { type: 'cancel', id: cancelId }
          : orderType === 'market'
            ? { type: 'market', id, side, quantity: amount }
            : { type: 'limit', id, side, price: Math.round(ticks), quantity: amount };
      const result = replay.append(command);
      setMessage({
        zh: `已建立分支 · 成交 ${result.filled} · 掛單 ${result.resting} · 取消 ${result.cancelled}`,
        en: `Branch created · filled ${result.filled} · resting ${result.resting} · cancelled ${result.cancelled}`,
      });
      setCancelId('');
      refresh();
    } catch {
      setMessage({
        zh: '委託未送出，請檢查整數數量、有效價格或可撤銷委託，最多保留 4096 筆事件',
        en: 'Order rejected — check integer quantity, valid price or resting order, and the 4096-event limit',
        error: true,
      });
    }
  };

  const startBenchmark = () => {
    setRunning(false);
    benchmarkRef.current = new MatchingBenchmark();
    setBenchmark(benchmarkRef.current.metrics);
    setBenchmarkRunning(true);
  };
  const inputDisabled = running || benchmarkRunning;
  const commandLabel =
    lastEvent?.command.type === 'cancel'
      ? t('取消', 'Cancel')
      : lastEvent?.command.type === 'market'
        ? t('市價', 'Market')
        : t('限價', 'Limit');

  return (
    <section
      className="market-lab"
      data-testid="market-lab"
      data-cursor={replay.cursor}
      data-events={replay.length}
      data-running={running && visible}
      data-visible={visible}
      data-motion={reducedMotion ? 'reduced' : 'standard'}
    >
      <div className="lab-controls market-controls">
        <label className="lab-field">
          <span>{t('市場情境', 'Scenario')}</span>
          <select
            aria-label={t('市場情境', 'Scenario')}
            value={scenario}
            onChange={(event) => regenerate(event.target.value as MarketScenario)}
            disabled={benchmarkRunning}
          >
            {marketScenarios.map((item) => (
              <option key={item} value={item}>
                {t(...scenarioLabels[item])}
              </option>
            ))}
          </select>
        </label>
        <label className="lab-field market-seed">
          <span>{t('隨機種子', 'Seed')}</span>
          <input
            inputMode="numeric"
            type="text"
            value={seed}
            onChange={(event) => setSeed(event.target.value)}
            disabled={benchmarkRunning}
            maxLength={10}
          />
        </label>
        <button
          className="lab-button"
          type="button"
          onClick={() => regenerate()}
          disabled={benchmarkRunning}
        >
          {t('重新產生', 'Regenerate')}
        </button>
        <span className="market-deterministic">
          {t('固定種子，可重現結果', 'Seeded & reproducible')}
        </span>
      </div>

      <div className="market-ticker" aria-label={t('市場數據', 'Market data')}>
        <div>
          <span>{t('最新成交', 'Last fill')}</span>
          <strong data-testid="market-last-price">{price(latest?.price)}</strong>
          <small>USD / KAI</small>
        </div>
        <div>
          <span>{t('買賣價差', 'Spread')}</span>
          <strong>
            {view.spread === null ? '—' : `${view.spread}`}
            <small> ticks</small>
          </strong>
        </div>
        <div>
          <span>{t('成交總量', 'Volume')}</span>
          <strong data-testid="market-volume">{number(replay.volume)}</strong>
          <small>
            {number(replay.tradeCount)} {t('筆成交', 'fills')}
          </small>
        </div>
        <div>
          <span>{t('有效委託', 'Resting orders')}</span>
          <strong>{number(replay.book.size)}</strong>
          <small>{t('整數量 / 0.01 tick', 'Integer qty / 0.01 tick')}</small>
        </div>
      </div>

      <div className="market-terminal">
        <div className="market-main-panel">
          <PriceChart candles={view.candles} currentTime={replay.time} t={t} />
          <dl className="market-indicators">
            <div>
              <dt>VWAP</dt>
              <dd>{price(view.indicators.vwap)}</dd>
            </div>
            <div>
              <dt>EMA 14</dt>
              <dd>{price(view.indicators.ema)}</dd>
            </div>
            <div>
              <dt>SMA 14</dt>
              <dd>{price(view.indicators.sma)}</dd>
            </div>
            <div>
              <dt>
                RSI 14 <span>(Cutler)</span>
              </dt>
              <dd>{view.indicators.rsi?.toFixed(1) ?? '—'}</dd>
            </div>
          </dl>
        </div>
        <aside className="market-book" aria-label={t('委託簿', 'Order book')}>
          <div className="market-section-heading">
            <h3>{t('委託簿', 'Order book')}</h3>
            <span>PRICE · TIME · FIFO</span>
          </div>
          <div className="market-book-tables">
            <DepthTable side="sell" levels={view.asks} t={t} />
            <DepthTable side="buy" levels={view.bids} t={t} />
          </div>
          <p className="market-mid">
            {t('中間價', 'Mid price')} <b>{price(view.mid)}</b>
            <span>{t('每側最多八個價位', 'Top 8 levels per side')}</span>
          </p>
        </aside>
      </div>

      <div className="market-replay-controls">
        <div className="market-playback">
          <button
            type="button"
            className="lab-button market-play"
            onClick={() => {
              if (replay.cursor === replay.length) replay.seek(0);
              setRunning((previous) => !previous);
              refresh();
            }}
            disabled={benchmarkRunning}
            aria-pressed={running}
          >
            <span aria-hidden="true">{running ? 'Ⅱ' : '▶'}</span>{' '}
            {running ? t('暫停', 'Pause') : t('播放', 'Play')}
          </button>
          <button
            type="button"
            className="lab-button"
            onClick={() => seek(Math.min(replay.length, replay.cursor + 1))}
            disabled={benchmarkRunning || replay.cursor === replay.length}
          >
            {t('單步', 'Step')}
          </button>
          <button
            type="button"
            className="lab-button"
            onClick={() => seek(0)}
            disabled={benchmarkRunning}
          >
            {t('回到起點', 'Reset')}
          </button>
          <label className="market-speed">
            <span>{t('速度', 'Speed')}</span>
            <select
              value={speed}
              onChange={(event) => setSpeed(Number(event.target.value))}
              aria-label={t('播放速度', 'Playback speed')}
            >
              {[1, 2, 5, 10].map((value) => (
                <option value={value} key={value}>
                  {value}×
                </option>
              ))}
            </select>
          </label>
          <output className="market-cursor" data-testid="market-cursor">
            {number(replay.cursor)} / {number(replay.length)} <span>{t('事件', 'events')}</span>
          </output>
        </div>
        <label className="market-scrubber">
          <span className="market-sr-only">{t('事件回放游標', 'Replay cursor')}</span>
          <input
            type="range"
            min={0}
            max={replay.length}
            step={1}
            value={replay.cursor}
            onChange={(event) => seek(Number(event.target.value))}
            disabled={benchmarkRunning}
            aria-valuetext={`${replay.cursor} / ${replay.length} · ${timestamp(replay.time)}`}
          />
        </label>
        <div className="market-replay-meta">
          <span>
            {timestamp(replay.time)} · {cursorPercent}%
          </span>
          <span>
            {lastEvent
              ? `${commandLabel} #${lastEvent.command.id}`
              : t('委託簿尚未開始', 'Empty book — before the first event')}
          </span>
          <span>{t('相同游標 = 相同市場狀態', 'One cursor, one market state')}</span>
        </div>
      </div>

      {message && (
        <p
          className={`market-feedback${message.error ? ' market-feedback-error' : ''}`}
          role={message.error ? 'alert' : 'status'}
        >
          {t(message.zh, message.en)}
        </p>
      )}
      <div className="market-lower">
        <div className="market-orders-panel">
          <div className="market-section-heading">
            <h3>{t('測試一筆委託', 'Submit an order')}</h3>
            <span>{t('本機分支', 'LOCAL BRANCH')}</span>
          </div>
          <form onSubmit={submit}>
            <fieldset disabled={inputDisabled}>
              <legend className="market-sr-only">{t('自訂委託', 'Custom order')}</legend>
              <div className="market-order-fields">
                <label className="lab-field">
                  <span>{t('委託類型', 'Order type')}</span>
                  <select
                    aria-label={t('委託類型', 'Order type')}
                    value={orderType}
                    onChange={(event) => setOrderType(event.target.value as typeof orderType)}
                    id={`${formId}-type`}
                  >
                    <option value="limit">{t('限價單', 'Limit')}</option>
                    <option value="market">{t('市價單', 'Market')}</option>
                    <option value="cancel">{t('撤單', 'Cancel')}</option>
                  </select>
                </label>
                {orderType !== 'cancel' ? (
                  <>
                    <label className="lab-field">
                      <span>{t('方向', 'Side')}</span>
                      <select
                        aria-label={t('方向', 'Side')}
                        value={side}
                        onChange={(event) => setSide(event.target.value as OrderSide)}
                      >
                        <option value="buy">{t('買進', 'Buy')}</option>
                        <option value="sell">{t('賣出', 'Sell')}</option>
                      </select>
                    </label>
                    <label className="lab-field">
                      <span>{t('數量', 'Quantity')}</span>
                      <input
                        type="number"
                        required
                        min={1}
                        max={1000000}
                        step={1}
                        value={quantity}
                        onChange={(event) => setQuantity(event.target.value)}
                      />
                    </label>
                    {orderType === 'limit' && (
                      <label className="lab-field">
                        <span>{t('限價（USD）', 'Limit price (USD)')}</span>
                        <input
                          type="number"
                          required
                          min={0.01}
                          max={10000000}
                          step={0.01}
                          value={limitPrice}
                          onChange={(event) => setLimitPrice(event.target.value)}
                        />
                      </label>
                    )}
                  </>
                ) : (
                  <label className="lab-field market-cancel-select">
                    <span>{t('有效委託', 'Resting order')}</span>
                    <select
                      aria-label={t('有效委託', 'Resting order')}
                      required
                      value={cancelId}
                      onChange={(event) => setCancelId(event.target.value)}
                    >
                      <option value="">{t('選擇一筆委託', 'Choose an order')}</option>
                      {view.orders.map((order) => (
                        <option value={order.id} key={order.id}>
                          {order.id} · {order.side === 'buy' ? t('買', 'Bid') : t('賣', 'Ask')} ·{' '}
                          {price(order.price)} × {order.quantity}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <div className="market-submit">
                <button
                  type="submit"
                  className="lab-button"
                  disabled={orderType === 'cancel' && !cancelId}
                >
                  {t('建立分支並送出', 'Branch & submit')}
                </button>
                <span>{t('市價單餘量直接取消', 'Unfilled market quantity expires')}</span>
              </div>
            </fieldset>
          </form>
          <p className="lab-note market-branch-note">
            {t(
              `保留目前游標以前的歷史，下單後會捨棄後方 ${number(replay.length - replay.cursor)} 筆模擬事件，重新產生可回到原情境`,
              `Preserves history up to this cursor and discards ${number(replay.length - replay.cursor)} future events — regenerate to restore the original scenario`,
            )}
          </p>
        </div>
        <div className="market-trades-panel">
          <div className="market-section-heading">
            <h3>{t('最近成交', 'Recent fills')}</h3>
            <span>{t('成交於掛單價格', 'MAKER PRICE')}</span>
          </div>
          <div className="market-trades-scroll">
            <table className="market-trades">
              <thead>
                <tr>
                  <th scope="col">{t('時間', 'Time')}</th>
                  <th scope="col">{t('主動方', 'Taker')}</th>
                  <th scope="col">{t('價格', 'Price')}</th>
                  <th scope="col">{t('數量', 'Qty')}</th>
                </tr>
              </thead>
              <tbody>
                {view.trades.map((trade) => (
                  <tr key={trade.sequence}>
                    <td>{timestamp(trade.time)}</td>
                    <td className={trade.side === 'buy' ? 'market-text-up' : 'market-text-down'}>
                      {trade.side === 'buy' ? t('買', 'Buy') : t('賣', 'Sell')}
                    </td>
                    <td>{price(trade.price)}</td>
                    <td>{trade.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!view.trades.length && <p className="market-empty">{t('尚無成交', 'No fills yet')}</p>}
          </div>
        </div>
      </div>

      <div className="market-benchmark lab-panel">
        <div className="market-section-heading">
          <h3>{t('撮合引擎壓力測試', 'Matching engine benchmark')}</h3>
          <span>50,000 {t('筆操作', 'OPERATIONS')}</span>
        </div>
        <p className="lab-note">
          {t(
            '使用獨立委託簿測量本機處理成本，每幀最多 128 筆並以 4 ms 為預算，不改動上方行情',
            'Measures local processing on a separate book — at most 128 operations per frame with a 4 ms budget, without changing the replay',
          )}
        </p>
        <div className="market-benchmark-controls">
          <button
            className="lab-button"
            type="button"
            onClick={startBenchmark}
            disabled={benchmarkRunning}
          >
            {benchmark ? t('再次測試', 'Run again') : t('開始壓力測試', 'Run benchmark')}
          </button>
          {benchmarkRunning && (
            <button className="lab-button" type="button" onClick={() => setBenchmarkRunning(false)}>
              {t('停止測試', 'Stop benchmark')}
            </button>
          )}
          <output aria-live="off" data-testid="market-benchmark-progress">
            {benchmark ? `${number(benchmark.operations)} / 50,000` : t('尚未執行', 'Not run yet')}
          </output>
          {benchmark?.finished && <span role="status">{t('已完成', 'Complete')}</span>}
        </div>
        <progress
          max={50000}
          value={benchmark?.operations ?? 0}
          aria-label={t('壓力測試進度', 'Benchmark progress')}
        />
        <dl className="market-indicators market-benchmark-metrics">
          <div>
            <dt>{t('處理速率', 'Processing rate')}</dt>
            <dd>
              {benchmark?.milliseconds
                ? number(Math.round((benchmark.operations / benchmark.milliseconds) * 1000))
                : '—'}
              <small> ops/s</small>
            </dd>
          </div>
          <div>
            <dt>{t('實際成交筆數', 'Matched fills')}</dt>
            <dd>{benchmark ? number(benchmark.matches) : '—'}</dd>
          </div>
          <div>
            <dt>{t('累計處理時間', 'Active CPU time')}</dt>
            <dd>
              {benchmark ? benchmark.milliseconds.toFixed(1) : '—'}
              <small> ms</small>
            </dd>
          </div>
          <div>
            <dt>{t('最長單批', 'Longest batch')}</dt>
            <dd>
              {benchmark ? benchmark.maximumBatch.toFixed(2) : '—'}
              <small> ms</small>
            </dd>
          </div>
        </dl>
        <p className="lab-note">
          {t(
            '速率包含命令生成與撮合，不含幀間等待，受裝置與瀏覽器影響，不能視為交易所吞吐量',
            'Rate includes command generation and matching, excludes frame waits, and depends on your browser and device — this is not an exchange throughput claim',
          )}
        </p>
      </div>
      <p className="lab-note market-footnote">
        {t(
          '此為教學模擬，無真實行情、金流或交易連線，切換分頁會暫停運算，回到此分頁才繼續',
          'Educational simulation with no live feed, money or trading connection — processing pauses in hidden tabs and resumes when visible',
        )}
      </p>
    </section>
  );
}
