import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Copy, Download, Pause, Play, RotateCcw } from 'lucide-react';
import {
  clampSvgPoint,
  exportSvg,
  generateSvgPoints,
  mixSvgCurves,
  svgCurve,
  svgPath,
  type SvgPoint,
} from '../../lib/lab/svg-studio';
import { useLabEnvironment } from './useLabEnvironment';
import '../../styles/lab-svg-studio.css';

type Endpoint = 0 | 1;
type Feedback = 'idle' | 'copied' | 'copy-error' | 'downloaded';
const initialSeeds: [number, number] = [287, 911];

export default function SvgStudio() {
  const { t, reducedMotion, visible } = useLabEnvironment();
  const [advanced, setAdvanced] = useState(false);
  const [count, setCount] = useState(8);
  const [irregularity, setIrregularity] = useState(0.65);
  const [smoothing, setSmoothing] = useState(0.9);
  const [seeds, setSeeds] = useState<[number, number]>(initialSeeds);
  const [shapes, setShapes] = useState<[SvgPoint[], SvgPoint[]]>(
    () => initialSeeds.map((seed) => generateSvgPoints(seed, 8, 0.65)) as [SvgPoint[], SvgPoint[]],
  );
  const [endpoint, setEndpoint] = useState<Endpoint>(0);
  const [selected, setSelected] = useState(0);
  const [blend, setBlend] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [inView, setInView] = useState(false);
  const [fill, setFill] = useState('#b44269');
  const [filled, setFilled] = useState(true);
  const [stroke, setStroke] = useState('#40393b');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [feedback, setFeedback] = useState<Feedback>('idle');
  const stage = useRef<SVGSVGElement>(null);
  const phaseRef = useRef(0);
  const drag = useRef<{
    pointer: number;
    index: number;
    original: SvgPoint;
    element: SVGGElement;
  } | null>(null);
  const downloadUrl = useRef<string | null>(null);
  const alive = useRef(true);
  const copyRequest = useRef(0);
  const curveA = useMemo(() => svgCurve(shapes[0], smoothing), [shapes, smoothing]);
  const curveB = useMemo(() => svgCurve(shapes[1], smoothing), [shapes, smoothing]);
  const curve = useMemo(() => mixSvgCurves(curveA, curveB, blend), [curveA, curveB, blend]);
  const path = svgPath(curve);
  const code = exportSvg(curve, { fill: filled ? fill : 'none', stroke, strokeWidth });
  const codeRef = useRef(code);
  codeRef.current = code;
  const editable = !playing && blend === endpoint;
  const point = shapes[endpoint][selected];

  const updateBlend = (value: number) => {
    // 手動指定進度才重新選擇前進方向，暫停與離屏保留完整週期的相位
    phaseRef.current = Math.acos(1 - value * 2);
    copyRequest.current++;
    setBlend(value);
    setFeedback('idle');
  };

  useEffect(() => {
    if (!stage.current) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.05,
    });
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || reducedMotion) setPlaying(false);
  }, [visible, reducedMotion]);

  useEffect(() => {
    if (!playing || !visible || reducedMotion || !inView) return;
    let frame = 0;
    let previous = 0;
    const tick = (time: number) => {
      if (!previous) previous = time;
      const delta = time - previous;
      if (delta >= 1000 / 30) {
        phaseRef.current =
          (phaseRef.current + (Math.min(delta, 80) * Math.PI) / 2000) % (Math.PI * 2);
        previous = time;
        const next = (1 - Math.cos(phaseRef.current)) / 2;
        setBlend(next);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, visible, reducedMotion, inView]);

  useEffect(() => {
    copyRequest.current++;
    return () => {
      copyRequest.current++;
    };
  }, [code]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
    };
  }, []);

  function chooseEndpoint(next: Endpoint) {
    cancelDrag();
    setPlaying(false);
    setEndpoint(next);
    updateBlend(next);
  }

  function regenerate(nextCount: number, nextIrregularity: number) {
    cancelDrag();
    setPlaying(false);
    setCount(nextCount);
    setIrregularity(nextIrregularity);
    setSelected((current) => Math.min(current, nextCount - 1));
    setShapes(
      seeds.map((seed) => generateSvgPoints(seed, nextCount, nextIrregularity)) as [
        SvgPoint[],
        SvgPoint[],
      ],
    );
    updateBlend(endpoint);
  }

  function movePoint(index: number, next: SvgPoint) {
    copyRequest.current++;
    const safe = clampSvgPoint(next);
    setShapes(
      (current) =>
        current.map((points, shapeIndex) =>
          shapeIndex === endpoint
            ? points.map((item, pointIndex) => (pointIndex === index ? safe : item))
            : points,
        ) as [SvgPoint[], SvgPoint[]],
    );
    setFeedback('idle');
  }

  function pointerPosition(event: PointerEvent<SVGGElement>) {
    const matrix = stage.current?.getScreenCTM();
    if (!matrix) return null;
    const position = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: position.x, y: position.y };
  }

  function startDrag(event: PointerEvent<SVGGElement>, index: number) {
    if (event.button !== 0 || !editable || drag.current) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointer: event.pointerId,
      index,
      original: { ...shapes[endpoint][index] },
      element: event.currentTarget,
    };
    setSelected(index);
  }

  function dragPoint(event: PointerEvent<SVGGElement>) {
    if (drag.current?.pointer !== event.pointerId) return;
    const next = pointerPosition(event);
    if (next) movePoint(drag.current.index, next);
  }

  function cancelDrag(pointer?: number) {
    const current = drag.current;
    if (!current || (pointer !== undefined && pointer !== current.pointer)) return;
    drag.current = null;
    movePoint(current.index, current.original);
    if (current.element.hasPointerCapture(current.pointer))
      current.element.releasePointerCapture(current.pointer);
  }

  function finishDrag(event: PointerEvent<SVGGElement>) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    drag.current = null;
    if (current.element.hasPointerCapture(current.pointer))
      current.element.releasePointerCapture(current.pointer);
  }

  function pointKey(event: KeyboardEvent<SVGGElement>, index: number) {
    if (event.key === 'Escape') {
      cancelDrag();
      return;
    }
    const offsets: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    const current = shapes[endpoint][index];
    movePoint(index, { x: current.x + offset[0] * step, y: current.y + offset[1] * step });
  }

  async function copySvg() {
    const request = ++copyRequest.current;
    const snapshot = code;
    setFeedback('idle');
    try {
      await navigator.clipboard.writeText(snapshot);
      if (alive.current && request === copyRequest.current && codeRef.current === snapshot)
        setFeedback('copied');
    } catch {
      if (alive.current && request === copyRequest.current && codeRef.current === snapshot)
        setFeedback('copy-error');
    }
  }

  function downloadSvg() {
    copyRequest.current++;
    if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
    downloadUrl.current = URL.createObjectURL(
      new Blob([code], { type: 'image/svg+xml;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = downloadUrl.current;
    link.download = 'kaiyo-shape.svg';
    document.body.append(link);
    link.click();
    link.remove();
    setFeedback('downloaded');
  }

  return (
    <div className="svg-studio" data-svg-studio data-playing={String(playing)}>
      <div className="svg-studio-viewport">
        <div className="svg-studio-play-actions">
          <button
            className="lab-button"
            onClick={() => {
              cancelDrag();
              setPlaying(false);
              const values = new Uint32Array(2);
              crypto.getRandomValues(values);
              const next = Array.from(values, (value) => value % 1000000) as [number, number];
              setSeeds(next);
              setShapes(
                next.map((seed) => generateSvgPoints(seed, count, irregularity)) as [
                  SvgPoint[],
                  SvgPoint[],
                ],
              );
              updateBlend(endpoint);
            }}
          >
            <RotateCcw size={16} />
            {t('換一個', 'Try another')}
          </button>
          <div className="svg-studio-color-row">
            <label>
              <input
                type="checkbox"
                checked={filled}
                onChange={(event) => {
                  setFilled(event.target.checked);
                  setFeedback('idle');
                }}
              />{' '}
              {t('填色', 'Fill')}
            </label>
            <input
              type="color"
              value={fill}
              disabled={!filled}
              aria-label={t('填色色彩', 'Fill color')}
              onChange={(event) => {
                setFill(event.target.value);
                setFeedback('idle');
              }}
            />
          </div>
        </div>
        <svg
          ref={stage}
          viewBox="0 0 600 600"
          className="svg-studio-canvas"
          style={{ touchAction: advanced ? 'none' : 'pan-y' }}
          aria-label={t('可編輯的 SVG 畫布', 'Editable SVG canvas')}
        >
          <title>
            {advanced
              ? t(
                  '拖曳節點改變輪廓，方向鍵微調位置',
                  'Drag nodes to change the outline, use arrow keys for precise movement',
                )
              : t('用填色與播放改變這個形狀', 'Change this shape with color and motion')}
          </title>
          {advanced && (
            <g className="svg-studio-grid" aria-hidden="true">
              {[100, 200, 300, 400, 500].map((position) => (
                <path key={position} d={`M ${position} 0 V 600 M 0 ${position} H 600`} />
              ))}
              <path d="M 288 300 H 312 M 300 288 V 312" className="svg-studio-origin" />
            </g>
          )}
          {advanced && (
            <path
              className="svg-studio-ghost"
              d={svgPath(endpoint === 0 ? curveB : curveA)}
              aria-hidden="true"
            />
          )}
          <path
            data-svg-shape
            d={path}
            fill={filled ? fill : 'none'}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
          {advanced && editable && (
            <g className="svg-studio-nodes">
              {shapes[endpoint].map((node, index) => (
                <g
                  key={index}
                  role="button"
                  tabIndex={0}
                  aria-label={t(
                    `節點 ${index + 1}，方向鍵移動`,
                    `Node ${index + 1}, move with arrow keys`,
                  )}
                  aria-pressed={selected === index}
                  transform={`translate(${node.x} ${node.y})`}
                  data-svg-node={index}
                  onFocus={() => setSelected(index)}
                  onPointerDown={(event) => startDrag(event, index)}
                  onPointerMove={dragPoint}
                  onPointerUp={finishDrag}
                  onPointerCancel={(event) => cancelDrag(event.pointerId)}
                  onLostPointerCapture={(event) => cancelDrag(event.pointerId)}
                  onKeyDown={(event) => pointKey(event, index)}
                >
                  <circle className="svg-studio-hit" r="23" />
                  <circle className="svg-studio-node" r={selected === index ? 8 : 5} />
                  <text x="14" y="-14" aria-hidden="true">
                    {index + 1}
                  </text>
                </g>
              ))}
            </g>
          )}
        </svg>
        <div className="svg-studio-transport">
          <button
            className="lab-button"
            onClick={() => {
              setFeedback('idle');
              setPlaying((value) => !value);
            }}
            disabled={reducedMotion}
            aria-label={playing ? t('暫停變形', 'Pause morph') : t('播放變形', 'Play morph')}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}{' '}
            {playing ? t('暫停', 'Pause') : t('播放', 'Play')}
          </button>
          <button className="lab-button primary" disabled={playing} onClick={downloadSvg}>
            <Download size={16} />
            {t('下載 SVG', 'Download SVG')}
          </button>
          <label className="lab-field svg-studio-blend">
            {t('變形進度', 'Morph progress')}
            <input
              type="range"
              min="0"
              max="100"
              step="0.1"
              value={blend * 100}
              aria-label={t('變形進度', 'Morph progress')}
              onChange={(event) => {
                setPlaying(false);
                updateBlend(Number(event.target.value) / 100);
              }}
            />
          </label>
          <output data-svg-blend>{Math.round(blend * 100)}%</output>
        </div>
        {reducedMotion && (
          <p className="lab-note">
            {t(
              '已關閉自動播放，可拖曳進度改變形狀',
              'Automatic motion is off; drag the slider to change the shape',
            )}
          </p>
        )}
      </div>
      <p className="lab-note svg-studio-feedback" role="status">
        {feedback === 'copied'
          ? t('SVG 已複製', 'SVG copied')
          : feedback === 'downloaded'
            ? t('SVG 已準備下載', 'SVG download prepared')
            : feedback === 'copy-error'
              ? t(
                  '瀏覽器未允許複製，請選取原始碼手動複製或下載檔案',
                  'Clipboard access was denied; select the source to copy manually or download the file',
                )
              : playing
                ? t('暫停後即可複製或下載目前形狀', 'Pause to copy or download the current shape')
                : t('喜歡現在的形狀就下載帶走', 'Like this shape? Download it to keep it')}
      </p>
      <details
        className="svg-studio-advanced"
        data-lab-advanced
        onToggle={(event) => {
          const open = event.currentTarget.open;
          if (!open) cancelDrag();
          setAdvanced(open);
        }}
      >
        <summary>{t('進階設定與匯出', 'Advanced settings & export')}</summary>
        <div className="svg-studio-tabs" role="group" aria-label={t('編輯形狀', 'Edit shape')}>
          <button
            className="lab-button"
            aria-pressed={editable && endpoint === 0}
            onClick={() => chooseEndpoint(0)}
          >
            {t('編輯形狀 A', 'Edit shape A')}
          </button>
          <button
            className="lab-button"
            aria-pressed={editable && endpoint === 1}
            onClick={() => chooseEndpoint(1)}
          >
            {t('編輯形狀 B', 'Edit shape B')}
          </button>
          <span>
            {count} {t('節點', 'nodes')} / CUBIC
          </span>
        </div>
        <div className="svg-studio-settings">
          <fieldset>
            <legend>{t('輪廓生成', 'Shape generation')}</legend>
            <label className="lab-field">
              {t('節點數', 'Nodes')} <output>{count}</output>
              <input
                type="range"
                min="3"
                max="16"
                value={count}
                aria-label={t('節點數', 'Nodes')}
                onChange={(event) => regenerate(Number(event.target.value), irregularity)}
              />
            </label>
            <label className="lab-field">
              {t('不規則程度', 'Irregularity')} <output>{Math.round(irregularity * 100)}%</output>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={irregularity}
                aria-label={t('不規則程度', 'Irregularity')}
                onChange={(event) => regenerate(count, Number(event.target.value))}
              />
            </label>
            <label className="lab-field">
              {t('平滑度', 'Smoothing')} <output>{Math.round(smoothing * 100)}%</output>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={smoothing}
                aria-label={t('平滑度', 'Smoothing')}
                onChange={(event) => {
                  setPlaying(false);
                  setSmoothing(Number(event.target.value));
                  setFeedback('idle');
                }}
              />
            </label>
            <div className="svg-studio-seed">
              <label className="lab-field">
                {t('生成種子', 'Generation seed')} {endpoint ? 'B' : 'A'}
                <input
                  type="number"
                  min="0"
                  max="999999"
                  step="1"
                  value={seeds[endpoint]}
                  aria-label={t('生成種子', 'Generation seed')}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isSafeInteger(value))
                      setSeeds(
                        (current) =>
                          current.map((seed, index) =>
                            index === endpoint ? Math.max(0, Math.min(999999, value)) : seed,
                          ) as [number, number],
                      );
                  }}
                />
              </label>
              <button
                className="lab-button"
                aria-label={t('重新生成目前形狀', 'Regenerate current shape')}
                onClick={() => {
                  setShapes(
                    (current) =>
                      current.map((points, index) =>
                        index === endpoint
                          ? generateSvgPoints(seeds[endpoint], count, irregularity)
                          : points,
                      ) as [SvgPoint[], SvgPoint[]],
                  );
                  chooseEndpoint(endpoint);
                }}
              >
                <RotateCcw size={16} />
              </button>
            </div>
            <p className="lab-note">
              {t(
                '調整節點數或不規則程度會依種子重建 A 與 B，平滑度保留手動位置',
                'Changing nodes or irregularity regenerates A and B from their seeds; smoothing preserves manual positions',
              )}
            </p>
          </fieldset>
          <fieldset>
            <legend>{t('節點微調', 'Node precision')}</legend>
            {!editable && (
              <p className="lab-note">
                {t(
                  '先選「編輯形狀 A」或「編輯形狀 B」再調整節點',
                  'Choose Edit shape A or Edit shape B before moving nodes',
                )}
              </p>
            )}
            <label className="lab-field">
              {t('選擇節點', 'Selected node')}
              <select
                value={selected}
                disabled={!editable}
                aria-label={t('選擇節點', 'Selected node')}
                onChange={(event) => setSelected(Number(event.target.value))}
              >
                {shapes[endpoint].map((_, index) => (
                  <option key={index} value={index}>
                    {index + 1}
                  </option>
                ))}
              </select>
            </label>
            <div className="svg-studio-coordinates">
              {(['x', 'y'] as const).map((axis) => (
                <label className="lab-field" key={axis}>
                  {axis.toUpperCase()}
                  <input
                    type="number"
                    min="30"
                    max="570"
                    step="1"
                    value={Math.round(point[axis])}
                    disabled={!editable}
                    aria-label={t(
                      `節點 ${axis.toUpperCase()} 座標`,
                      `Node ${axis.toUpperCase()} coordinate`,
                    )}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isFinite(value)) movePoint(selected, { ...point, [axis]: value });
                    }}
                  />
                </label>
              ))}
            </div>
            <p className="lab-note">
              {t(
                '拖曳節點或使用方向鍵，按住 Shift 一次移動 10 px，Esc 取消本次拖曳，觸控時請在畫布外捲動頁面',
                'Drag a node or use arrow keys; hold Shift for 10 px steps, Esc cancels the current drag. On touchscreens, scroll outside the canvas',
              )}
            </p>
          </fieldset>
          <fieldset>
            <legend>{t('輸出外觀', 'Output appearance')}</legend>
            <div className="svg-studio-color-row">
              <label htmlFor="svg-stroke-color">{t('邊線', 'Stroke')}</label>
              <input
                id="svg-stroke-color"
                type="color"
                value={stroke}
                aria-label={t('邊線色彩', 'Stroke color')}
                onChange={(event) => {
                  setStroke(event.target.value);
                  setFeedback('idle');
                }}
              />
            </div>
            <label className="lab-field">
              {t('邊線寬度', 'Stroke width')} <output>{strokeWidth} px</output>
              <input
                type="range"
                min="0"
                max="12"
                step="0.5"
                value={strokeWidth}
                aria-label={t('邊線寬度', 'Stroke width')}
                onChange={(event) => {
                  setStrokeWidth(Number(event.target.value));
                  setFeedback('idle');
                }}
              />
            </label>
            {!filled && strokeWidth === 0 && (
              <p className="lab-note">
                {t(
                  '填色與邊線皆關閉，輸出形狀將不可見',
                  'Fill and stroke are both off; the exported shape will be invisible',
                )}
              </p>
            )}
          </fieldset>
        </div>
        <section className="svg-studio-export" aria-label={t('SVG 輸出', 'SVG export')}>
          <div className="svg-studio-export-heading">
            <div>
              <h2>{t('帶走這個形狀', 'Take this shape')}</h2>
              <p className="lab-note">
                {t(
                  '匯出當下的靜態形狀，透明背景，不含控制點、動畫或外部依賴',
                  'Exports the current static shape with a transparent background, without controls, animation or dependencies',
                )}
              </p>
            </div>
            <div className="lab-controls">
              <button className="lab-button" disabled={playing} onClick={copySvg}>
                <Copy size={16} />
                {t('複製 SVG', 'Copy SVG')}
              </button>
            </div>
          </div>
          <textarea
            className="svg-studio-code"
            readOnly
            spellCheck={false}
            value={code}
            aria-label={t('SVG 原始碼', 'SVG source')}
          />
        </section>
      </details>
    </div>
  );
}
