import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type SubmitEvent,
} from 'react';
import { Check, Copy, Pause, Play, RotateCcw } from 'lucide-react';
import { useLabEnvironment } from './useLabEnvironment';
import {
  clamp,
  evaluateBezier,
  formatCurve,
  motionCss,
  MOTION_PRESETS,
  parseMotionInput,
  setControlPoint,
  type BezierCurve,
} from '../../lib/lab/motion-studio';
import '../../styles/lab-motion-studio.css';

const initialCurve: BezierCurve = MOTION_PRESETS[0].curve;
const graphX = (x: number) => 52 + x * 340;
const graphY = (y: number) => 270 - y * 170;

export default function MotionStudio() {
  const { t, reducedMotion, visible } = useLabEnvironment();
  const root = useRef<HTMLDivElement>(null);
  const graph = useRef<SVGSVGElement>(null);
  const marker = useRef<SVGCircleElement>(null);
  const guide = useRef<SVGLineElement>(null);
  const progressInput = useRef<HTMLInputElement>(null);
  const timeOutput = useRef<HTMLOutputElement>(null);
  const valueOutput = useRef<HTMLOutputElement>(null);
  const translate = useRef<HTMLSpanElement>(null);
  const scale = useRef<HTMLSpanElement>(null);
  const opacity = useRef<HTMLSpanElement>(null);
  const progress = useRef(0);
  const travel = useRef(240);
  const drag = useRef<{
    id: number;
    point: 0 | 1;
    original: BezierCurve;
    element: SVGGElement;
  } | null>(null);
  const renderProgress = useRef<(value: number) => void>(() => {});
  const [curve, setCurve] = useState<BezierCurve>(initialCurve);
  const [fields, setFields] = useState<string[]>(initialCurve.map(String));
  const [duration, setDuration] = useState(1200);
  const [durationField, setDurationField] = useState('1200');
  const [playing, setPlaying] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [inView, setInView] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [copied, setCopied] = useState<'idle' | 'success' | 'failed'>('idle');
  const [pointNotice, setPointNotice] = useState('');
  const code = useMemo(() => motionCss(curve, duration), [curve, duration]);
  const copyRequest = useRef(0);
  const codeRef = useRef(code);
  codeRef.current = code;
  const curvePath = `M ${graphX(0)} ${graphY(0)} C ${graphX(curve[0])} ${graphY(curve[1])}, ${graphX(curve[2])} ${graphY(curve[3])}, ${graphX(1)} ${graphY(1)}`;

  useEffect(() => {
    if (!root.current) return;
    const intersection = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.05,
    });
    const preview = root.current.querySelector('.motion-preview');
    if (preview) intersection.observe(preview);
    const lane = root.current.querySelector('.motion-travel-track');
    const resize = new ResizeObserver(([entry]) => {
      travel.current = Math.max(0, entry.contentRect.width - 40);
      renderProgress.current(progress.current);
    });
    if (lane) resize.observe(lane);
    return () => {
      intersection.disconnect();
      resize.disconnect();
    };
  }, []);

  useEffect(() => {
    const draw = (value: number) => {
      progress.current = clamp(value, 0, 1);
      const eased = evaluateBezier(curve, progress.current);
      marker.current?.setAttribute('cx', String(graphX(progress.current)));
      marker.current?.setAttribute('cy', String(graphY(eased)));
      guide.current?.setAttribute('x1', String(graphX(progress.current)));
      guide.current?.setAttribute('x2', String(graphX(progress.current)));
      guide.current?.setAttribute('y2', String(graphY(eased)));
      if (translate.current)
        translate.current.style.transform = `translateX(${eased * travel.current}px)`;
      if (scale.current) scale.current.style.transform = `scale(${0.45 + eased * 0.55})`;
      if (opacity.current) opacity.current.style.opacity = String(clamp(eased, 0, 1));
      if (progressInput.current)
        progressInput.current.value = String(Math.round(progress.current * 1000));
      if (timeOutput.current)
        timeOutput.current.textContent = `${Math.round(progress.current * duration)} ms`;
      if (valueOutput.current) valueOutput.current.textContent = eased.toFixed(3);
      if (root.current) root.current.dataset.progress = progress.current.toFixed(4);
    };
    renderProgress.current = draw;
    draw(progress.current);
    if (!playing || !visible || !inView || reducedMotion) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const delta = Math.min(100, now - previous);
      previous = now;
      draw(progress.current + delta / duration);
      if (progress.current >= 1) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [curve, duration, playing, visible, inView, reducedMotion]);

  useEffect(() => {
    if (!visible || !inView || reducedMotion) setPlaying(false);
  }, [visible, inView, reducedMotion]);
  useEffect(() => {
    if (!visible) cancelDrag();
  }, [visible]);
  useEffect(() => {
    copyRequest.current++;
    setCopied('idle');
    return () => {
      copyRequest.current++;
    };
  }, [code]);

  const changeCurve = (next: BezierCurve) => {
    copyRequest.current++;
    setCopied('idle');
    setPlaying(false);
    setCurve(next);
    setFields(next.map(String));
    setInvalid(false);
  };
  function cancelDrag(pointerId?: number) {
    const current = drag.current;
    if (!current || (pointerId !== undefined && current.id !== pointerId)) return;
    drag.current = null;
    setDragging(false);
    changeCurve(current.original);
    if (current.element.hasPointerCapture(current.id))
      current.element.releasePointerCapture(current.id);
  }
  const apply = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseMotionInput(fields, durationField);
    if (!parsed) {
      setInvalid(true);
      return;
    }
    changeCurve(parsed.curve);
    setDuration(parsed.duration);
    setDurationField(String(parsed.duration));
  };
  const updatePointer = (event: PointerEvent<SVGGElement>) => {
    if (!drag.current || drag.current.id !== event.pointerId || !graph.current) return;
    const matrix = graph.current.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    changeCurve(
      setControlPoint(curve, drag.current.point, (point.x - 52) / 340, (270 - point.y) / 170),
    );
  };
  const keyboardPoint = (event: KeyboardEvent<SVGGElement>, point: 0 | 1) => {
    if (event.key === 'Escape' && drag.current) {
      event.preventDefault();
      cancelDrag();
      return;
    }
    if (drag.current) return;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 0.1 : 0.01;
    const next = setControlPoint(
      curve,
      point,
      curve[point * 2] +
        (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
      curve[point * 2 + 1] +
        (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0),
    );
    changeCurve(next);
    setPointNotice(`P${point + 1}: x ${next[point * 2]}, y ${next[point * 2 + 1]}`);
  };
  const copy = async () => {
    const request = ++copyRequest.current;
    const snapshot = code;
    setCopied('idle');
    try {
      await navigator.clipboard.writeText(snapshot);
      if (request === copyRequest.current && codeRef.current === snapshot) setCopied('success');
    } catch {
      if (request === copyRequest.current && codeRef.current === snapshot) setCopied('failed');
    }
  };

  return (
    <div
      className="motion-studio"
      ref={root}
      data-motion-studio
      data-playing={playing}
      data-dragging={dragging}
      data-progress="0.0000"
    >
      <section className="motion-preview" aria-label={t('動畫預覽', 'Animation preview')}>
        <div className="motion-presets" aria-label={t('曲線預設', 'Curve presets')}>
          {MOTION_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="lab-button"
              aria-pressed={preset.curve.every((value, index) => value === curve[index])}
              onClick={() => {
                changeCurve(preset.curve);
                renderProgress.current(0);
                if (!reducedMotion) setPlaying(true);
              }}
            >
              {t(
                {
                  ease: '輕柔',
                  linear: '等速',
                  'ease-in-out': '慢進慢出',
                  snappy: '俐落',
                  anticipate: '蓄力',
                  overshoot: '彈跳',
                }[preset.id],
                preset.label,
              )}
            </button>
          ))}
        </div>
        <div className="motion-section-label">
          <span>{t('選一種節奏，按下播放', 'Choose a feel and press play')}</span>
        </div>
        <div className="motion-preview-row motion-translate-row">
          <span className="motion-preview-label">{t('滑動', 'Slide')}</span>
          <div className="motion-travel-track">
            <span className="motion-object" ref={translate} />
          </div>
        </div>
        <div className="motion-preview-pair">
          <div className="motion-preview-row">
            <span className="motion-preview-label">{t('縮放', 'Grow')}</span>
            <div className="motion-static-track">
              <span className="motion-object" ref={scale} />
            </div>
          </div>
          <div className="motion-preview-row">
            <span className="motion-preview-label">{t('淡入', 'Fade')}</span>
            <div className="motion-static-track">
              <span className="motion-object" ref={opacity} />
            </div>
          </div>
        </div>
        <div className="motion-playback">
          <button
            type="button"
            className="lab-button primary"
            disabled={reducedMotion}
            onClick={() => {
              if (!playing && progress.current >= 1) renderProgress.current(0);
              setPlaying(!playing);
            }}
          >
            {playing ? (
              <Pause size={16} aria-hidden="true" />
            ) : (
              <Play size={16} aria-hidden="true" />
            )}
            {playing ? t('暫停', 'Pause') : t('播放', 'Play')}
          </button>
          <button
            type="button"
            className="lab-button"
            onClick={() => {
              copyRequest.current++;
              setCopied('idle');
              setPlaying(false);
              renderProgress.current(0);
            }}
          >
            <RotateCcw size={16} aria-hidden="true" />
            {t('回到起點', 'Reset')}
          </button>
          <label className="lab-field motion-scrub">
            {t('時間進度', 'Timeline')}
            <input
              ref={progressInput}
              aria-label={t('時間進度', 'Timeline')}
              type="range"
              min="0"
              max="1000"
              defaultValue="0"
              onChange={(event) => {
                setPlaying(false);
                renderProgress.current(Number(event.target.value) / 1000);
              }}
            />
          </label>
        </div>
        {reducedMotion && (
          <p className="lab-note">
            {t(
              '已依系統偏好關閉連續播放，仍可拖曳時間軸逐格查看',
              'Continuous playback is disabled by your reduced-motion preference, scrub the timeline to inspect any frame',
            )}
          </p>
        )}
      </section>

      <details className="motion-advanced" data-lab-advanced>
        <summary>{t('進階設定與匯出', 'Advanced settings & export')}</summary>
        <div className="motion-workspace">
          <section
            className="motion-graph-panel"
            aria-label={t('動畫曲線編輯器', 'Easing curve editor')}
          >
            <div className="motion-section-label">
              <span>01 / {t('曲線', 'CURVE')}</span>
              <code>{formatCurve(curve)}</code>
            </div>
            <svg
              className="motion-graph"
              ref={graph}
              viewBox="0 0 440 392"
              aria-label={t('時間與輸出進度曲線', 'Time and output progress curve')}
            >
              <rect className="motion-unit-square" x="52" y="100" width="340" height="170" />
              {[-0.5, 0, 0.5, 1, 1.5].map((value) => (
                <g key={value}>
                  <line
                    className="motion-grid"
                    x1="52"
                    x2="392"
                    y1={graphY(value)}
                    y2={graphY(value)}
                  />
                  <text x="40" y={graphY(value) + 4} textAnchor="end">
                    {value}
                  </text>
                </g>
              ))}
              {[0, 0.25, 0.5, 0.75, 1].map((value) => (
                <g key={value}>
                  <line
                    className="motion-grid"
                    x1={graphX(value)}
                    x2={graphX(value)}
                    y1="15"
                    y2="355"
                  />
                  <text x={graphX(value)} y="378" textAnchor="middle">
                    {value}
                  </text>
                </g>
              ))}
              <path
                className="motion-diagonal"
                d={`M ${graphX(0)} ${graphY(0)} L ${graphX(1)} ${graphY(1)}`}
              />
              <path
                className="motion-control-line"
                d={`M ${graphX(0)} ${graphY(0)} L ${graphX(curve[0])} ${graphY(curve[1])} M ${graphX(1)} ${graphY(1)} L ${graphX(curve[2])} ${graphY(curve[3])}`}
              />
              <path className="motion-curve" d={curvePath} />
              <line
                className="motion-progress-guide"
                ref={guide}
                x1="52"
                x2="52"
                y1="355"
                y2="270"
              />
              <circle className="motion-progress-dot" ref={marker} cx="52" cy="270" r="5" />
              {[0, 1].map((index) => (
                <g
                  key={index}
                  data-motion-handle={index}
                  className="motion-handle"
                  role="button"
                  tabIndex={0}
                  aria-label={t(`控制點 ${index + 1}`, `Control point ${index + 1}`)}
                  aria-describedby="motion-handle-help"
                  transform={`translate(${graphX(curve[index * 2])} ${graphY(curve[index * 2 + 1])})`}
                  onKeyDown={(event) => keyboardPoint(event, index as 0 | 1)}
                  onPointerDown={(event) => {
                    if (event.button !== 0 || !event.isPrimary || drag.current) return;
                    event.preventDefault();
                    event.currentTarget.focus();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    drag.current = {
                      id: event.pointerId,
                      point: index as 0 | 1,
                      original: curve,
                      element: event.currentTarget,
                    };
                    setDragging(true);
                    setPlaying(false);
                  }}
                  onPointerMove={updatePointer}
                  onPointerUp={(event) => {
                    if (!drag.current || drag.current.id !== event.pointerId) return;
                    updatePointer(event);
                    drag.current = null;
                    setDragging(false);
                    if (event.currentTarget.hasPointerCapture(event.pointerId))
                      event.currentTarget.releasePointerCapture(event.pointerId);
                  }}
                  onPointerCancel={(event) => cancelDrag(event.pointerId)}
                  onLostPointerCapture={(event) => cancelDrag(event.pointerId)}
                >
                  <circle className="motion-handle-hit" r="34" />
                  <circle className="motion-handle-ring" r="10" />
                  <text textAnchor="middle" y="4">
                    {index + 1}
                  </text>
                </g>
              ))}
            </svg>
            <div className="motion-axis-labels">
              <span>{t('縱軸：輸出進度', 'Y: output progress')}</span>
              <span>{t('橫軸：時間進度', 'X: elapsed time')}</span>
            </div>
            <p className="lab-note" id="motion-handle-help">
              {t(
                '拖曳控制點，或聚焦後用方向鍵微調，Shift 加大步幅，Esc 取消拖曳，觸控時請在畫布外捲動頁面',
                'Drag a control point or use arrow keys when focused, Shift for larger steps, Esc to cancel a drag, scroll outside the canvas on touchscreens',
              )}
            </p>
            <span className="motion-sr-only" role="status">
              {pointNotice}
            </span>
          </section>

          <section className="motion-settings" aria-label={t('曲線設定', 'Curve settings')}>
            <div className="motion-section-label">
              <span>02 / {t('設定', 'PARAMETERS')}</span>
            </div>
            <div className="motion-readout">
              <output ref={timeOutput}>0 ms</output>
              <span>
                {t('輸出', 'Output')} <output ref={valueOutput}>0.000</output>
              </span>
            </div>
            <form onSubmit={apply} noValidate>
              <div className="motion-coordinates">
                {['P1 x', 'P1 y', 'P2 x', 'P2 y'].map((label, index) => (
                  <label key={label} className="lab-field">
                    {label}
                    <input
                      aria-label={label}
                      type="text"
                      inputMode="decimal"
                      value={fields[index]}
                      onChange={(event) => {
                        setFields((previous) =>
                          previous.map((value, field) =>
                            field === index ? event.target.value : value,
                          ),
                        );
                        setInvalid(false);
                      }}
                      aria-invalid={invalid}
                    />
                  </label>
                ))}
              </div>
              <label className="lab-field motion-duration">
                {t('時間長度（毫秒）', 'Duration (ms)')}
                <input
                  aria-label={t('時間長度（毫秒）', 'Duration (ms)')}
                  type="text"
                  inputMode="numeric"
                  value={durationField}
                  onChange={(event) => {
                    setDurationField(event.target.value);
                    setInvalid(false);
                  }}
                  aria-invalid={invalid}
                />
              </label>
              <p className="lab-note">
                {t(
                  'x：0–1，y：−0.5–1.5，時間：100–5000 ms',
                  'x: 0–1, y: −0.5–1.5, duration: 100–5000 ms',
                )}
              </p>
              {invalid && (
                <p className="motion-error" role="alert">
                  {t(
                    '請輸入範圍內的數字，時間需為整數，預覽保留上次有效設定',
                    'Enter numbers within the allowed ranges and a whole-number duration, the preview keeps your last valid settings',
                  )}
                </p>
              )}
              <button type="submit" className="lab-button">
                {t('套用數值', 'Apply values')}
              </button>
            </form>
            <p className="lab-note motion-model-note">
              {t(
                '預覽先反解 Bézier 的時間座標，再計算輸出值，與 CSS timing-function 使用同一條曲線',
                'The preview solves the Bézier time coordinate before evaluating its output, matching the CSS timing function',
              )}
            </p>
          </section>
        </div>

        <section className="motion-export" aria-label={t('匯出 CSS', 'Export CSS')}>
          <div className="motion-section-label">
            <span>04 / CSS</span>
            <button type="button" className="lab-button" onClick={copy}>
              {copied === 'success' ? (
                <Check size={16} aria-hidden="true" />
              ) : (
                <Copy size={16} aria-hidden="true" />
              )}
              {t('複製 CSS', 'Copy CSS')}
            </button>
          </div>
          <pre tabIndex={0} aria-label={t('可複製的 CSS', 'Generated CSS')}>
            <code>{code}</code>
          </pre>
          <p className="lab-note">
            {t(
              '套用 .motion-demo 至元素，調整 --travel 控制位移距離，程式碼包含減少動態設定',
              'Apply .motion-demo to an element and adjust --travel to set the distance, the snippet includes reduced-motion handling',
            )}
          </p>
          <p className={copied === 'failed' ? 'motion-error' : 'lab-note'} role="status">
            {copied === 'success'
              ? t('已複製 CSS', 'CSS copied')
              : copied === 'failed'
                ? t(
                    '無法存取剪貼簿，請選取上方程式碼手動複製',
                    'Clipboard unavailable, select the code above to copy it manually',
                  )
                : '\u00a0'}
          </p>
        </section>
      </details>
    </div>
  );
}
