import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ArrowLeft, ArrowRight, Pause, Play, RotateCcw } from 'lucide-react';
import { useLabEnvironment } from './useLabEnvironment';
import {
  advanceKinetic,
  cyclicDistance,
  kineticSettled,
  momentumTarget,
  nearestLoopTarget,
  wrapIndex,
  type KineticState,
} from '../../lib/lab/kinetic-motion';
import '../../styles/lab-kinetic.css';
import ToolExport from './ToolExport';
import {
  defaultKineticOptions,
  kineticSource,
  type KineticOptions,
} from '../../lib/lab/kinetic-export';

const studies = [
  { image: 'wave', zh: '波的疊加', en: 'Superposition', formula: 'Σ sin(ωx + φ)' },
  { image: 'orbit', zh: '相位空間', en: 'Phase space', formula: 'x = a cos θ · y = b sin θ' },
  { image: 'surface', zh: '離散曲面', en: 'Discrete surface', formula: 'z = sin(x) cos(y)' },
  { image: 'interference', zh: '干涉紋理', en: 'Interference', formula: '|p − c₁| ∩ |p − c₂|' },
  { image: 'vector', zh: '向量圖譜', en: 'Vector atlas', formula: 'θ = atan2(y, x) + φ' },
  { image: 'damping', zh: '暫態響應', en: 'Transient response', formula: 'e⁻ᵝᵗ cos(ωt)' },
] as const;

export default function KineticCarousel() {
  const { t, reducedMotion, visible } = useLabEnvironment();
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const cards = useRef<Array<HTMLElement | null>>([]);
  const velocityOutput = useRef<HTMLOutputElement>(null);
  const positionOutput = useRef<HTMLOutputElement>(null);
  const engine = useRef<KineticState>({ position: 0, velocity: 0, target: 0 });
  const geometry = useRef({ width: 600, spacing: 306 });
  const drag = useRef<{
    id: number;
    startX: number;
    previousX: number;
    time: number;
    origin: number;
    moved: boolean;
  } | null>(null);
  const paint = useRef<() => void>(() => {});
  const wake = useRef<() => void>(() => {});
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const [inView, setInView] = useState(false);
  const [failedImages, setFailedImages] = useState<number[]>([]);
  const [imageAttempt, setImageAttempt] = useState(0);
  const [options, setOptions] = useState<KineticOptions>({ ...defaultKineticOptions });
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    // SSR 圖片可能在 React 掛載前就載入失敗，補讀完成狀態以免漏接早到的 error
    const failed = cards.current.flatMap((card, index) => {
      const image = card?.querySelector('img');
      return image?.complete && image.naturalWidth === 0 ? [index] : [];
    });
    if (failed.length) setFailedImages((previous) => [...new Set([...previous, ...failed])]);
  }, [imageAttempt]);

  useEffect(() => {
    if (!root.current || !stage.current) return;
    const intersection = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.08,
    });
    intersection.observe(stage.current);
    const resize = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      if (!width) return;
      const cardWidth = Math.min(304, width * 0.65);
      geometry.current = { width, spacing: cardWidth * optionsRef.current.spacing };
      stage.current?.style.setProperty('--kinetic-card-width', `${cardWidth}px`);
      paint.current();
    });
    resize.observe(stage.current);
    return () => {
      intersection.disconnect();
      resize.disconnect();
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastTime = 0;
    let lastMetric = 0;
    let alive = true;
    const canAnimate = visible && inView && !reducedMotion;
    const draw = () => {
      const state = engine.current;
      const { spacing, width } = geometry.current;
      for (let index = 0; index < studies.length; index++) {
        const card = cards.current[index];
        if (!card) continue;
        const distance = cyclicDistance(index, state.position, studies.length);
        const depth = Math.min(2, Math.abs(distance));
        const scale = reducedMotion ? 1 : 1 - depth * options.scale;
        const tilt = reducedMotion
          ? 0
          : Math.max(-35, Math.min(35, distance * -options.tilt + state.velocity * -0.45));
        card.style.transform = `translate3d(${distance * spacing}px, ${depth * (reducedMotion ? 0 : 16)}px, ${-depth * options.depth}px) rotateY(${tilt}deg) scale(${scale})`;
        card.style.opacity = String(Math.max(0, 1 - Math.max(0, depth - 0.8) * 0.67));
        card.style.filter = reducedMotion
          ? 'none'
          : `blur(${Math.min(width < 500 ? Math.min(0.7, options.blur) : options.blur, Math.abs(state.velocity) * depth * 0.13)}px)`;
        card.style.zIndex = String(10 - Math.round(depth * 3));
        card.setAttribute(
          'aria-hidden',
          String(wrapIndex(Math.round(state.position), studies.length) !== index),
        );
      }
      const selected = wrapIndex(Math.round(state.position), studies.length);
      if (selected !== activeRef.current) {
        activeRef.current = selected;
        setActive(selected);
      }
      if (stage.current) {
        stage.current.dataset.position = state.position.toFixed(4);
        stage.current.dataset.settled = String(kineticSettled(state));
      }
      const now = performance.now();
      if (now - lastMetric > 120 || kineticSettled(state)) {
        if (velocityOutput.current)
          velocityOutput.current.textContent = Math.abs(state.velocity).toFixed(2);
        if (positionOutput.current) positionOutput.current.textContent = state.position.toFixed(2);
        lastMetric = now;
      }
    };
    const scheduleNext = () => {
      if (timer) clearTimeout(timer);
      if (!alive || !canAnimate || !autoplay || drag.current) return;
      timer = setTimeout(() => {
        engine.current.target = Math.round(engine.current.target) + 1;
        start();
      }, 3800);
    };
    const tick = (time: number) => {
      frame = 0;
      if (!alive || !canAnimate) return;
      const dt = lastTime ? (time - lastTime) / 1000 : 1 / 60;
      lastTime = time;
      if (!drag.current) advanceKinetic(engine.current, dt);
      draw();
      if (!kineticSettled(engine.current) && !drag.current) frame = requestAnimationFrame(tick);
      else scheduleNext();
    };
    const start = () => {
      if (timer) clearTimeout(timer);
      if (!canAnimate) {
        engine.current.position = engine.current.target;
        engine.current.velocity = 0;
        draw();
      } else if (!frame && !drag.current) {
        lastTime = 0;
        frame = requestAnimationFrame(tick);
      }
    };
    paint.current = draw;
    wake.current = start;
    if (reducedMotion) {
      engine.current.position = engine.current.target;
      engine.current.velocity = 0;
    }
    draw();
    if (!kineticSettled(engine.current)) start();
    else scheduleNext();
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
      wake.current = () => {};
    };
  }, [visible, inView, reducedMotion, autoplay, options]);

  useEffect(() => {
    geometry.current.spacing = Math.min(304, geometry.current.width * 0.65) * options.spacing;
    paint.current();
  }, [options.spacing]);

  const navigate = (direction: number) => {
    setAutoplay(false);
    engine.current.target = Math.round(engine.current.target) + direction;
    wake.current();
  };
  const select = (index: number) => {
    setAutoplay(false);
    engine.current.target = nearestLoopTarget(
      index,
      Math.round(engine.current.target),
      studies.length,
    );
    wake.current();
  };
  const release = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const gesture = drag.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    drag.current = null;
    event.currentTarget.removeAttribute('data-dragging');
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (cancelled) {
      engine.current.target = Math.round(gesture.origin);
      engine.current.velocity = 0;
    } else {
      if (performance.now() - gesture.time > 100) engine.current.velocity = 0;
      engine.current.target = momentumTarget(engine.current.position, engine.current.velocity);
    }
    wake.current();
  };

  return (
    <div
      className="kinetic-lab"
      ref={root}
      data-kinetic-carousel
      data-active-slide={active}
      data-autoplay={autoplay && !reducedMotion}
    >
      <div className="kinetic-topline">
        <span>{t('3D 輪播調校', '3D CAROUSEL TUNER')}</span>
        <span>01—06 / CONTINUOUS</span>
      </div>
      <div
        className="kinetic-stage"
        style={{ perspective: `${options.perspective}px` }}
        ref={stage}
        tabIndex={0}
        role="group"
        aria-roledescription="carousel"
        aria-label={t('動態輪播', 'Kinetic carousel')}
        aria-describedby="kinetic-instructions"
        onFocus={() => setAutoplay(false)}
        onKeyDown={(event) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key))
            event.preventDefault();
          if (event.key === 'ArrowLeft') navigate(-1);
          if (event.key === 'ArrowRight') navigate(1);
          if (event.key === 'Home') select(0);
          if (event.key === 'End') select(studies.length - 1);
          if (event.key === 'Escape') {
            setAutoplay(false);
            const gesture = drag.current;
            engine.current.target = Math.round(gesture?.origin ?? engine.current.position);
            engine.current.velocity = 0;
            drag.current = null;
            stage.current?.removeAttribute('data-dragging');
            if (gesture && stage.current?.hasPointerCapture(gesture.id))
              stage.current.releasePointerCapture(gesture.id);
            wake.current();
          }
        }}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return;
          setAutoplay(false);
          engine.current.velocity = 0;
          engine.current.target = engine.current.position;
          drag.current = {
            id: event.pointerId,
            startX: event.clientX,
            previousX: event.clientX,
            time: performance.now(),
            origin: engine.current.position,
            moved: false,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const gesture = drag.current;
          if (!gesture || gesture.id !== event.pointerId) return;
          const now = performance.now();
          const elapsed = Math.max(8, now - gesture.time) / 1000;
          if (!gesture.moved && Math.abs(event.clientX - gesture.startX) < 6) return;
          gesture.moved = true;
          event.currentTarget.dataset.dragging = 'true';
          engine.current.position =
            gesture.origin - (event.clientX - gesture.startX) / geometry.current.spacing;
          const velocity =
            -(event.clientX - gesture.previousX) / geometry.current.spacing / elapsed;
          engine.current.velocity =
            engine.current.velocity * 0.45 + Math.max(-14, Math.min(14, velocity)) * 0.55;
          gesture.previousX = event.clientX;
          gesture.time = now;
          paint.current();
        }}
        onPointerUp={(event) => release(event)}
        onPointerCancel={(event) => release(event, true)}
        onLostPointerCapture={(event) => release(event, true)}
      >
        {studies.map((study, index) => (
          <figure
            key={study.image}
            className="kinetic-card"
            ref={(node) => {
              cards.current[index] = node;
            }}
            data-kinetic-slide={index}
            aria-hidden={index !== active}
          >
            <img
              key={imageAttempt}
              src={`/images/lab/kinetic-${study.image}.svg${imageAttempt ? `?attempt=${imageAttempt}` : ''}`}
              width="720"
              height="900"
              draggable={false}
              alt={t(`${study.zh}的程序生成圖像`, `Procedural study of ${study.en.toLowerCase()}`)}
              onError={() =>
                setFailedImages((previous) =>
                  previous.includes(index) ? previous : [...previous, index],
                )
              }
              onLoad={() =>
                setFailedImages((previous) =>
                  previous.includes(index) ? previous.filter((value) => value !== index) : previous,
                )
              }
            />
            {failedImages.includes(index) && (
              <figcaption className="kinetic-image-fallback">
                <span>{t(study.zh, study.en)}</span>
                <code>{study.formula}</code>
                <small>{t('圖像未載入', 'Image unavailable')}</small>
              </figcaption>
            )}
          </figure>
        ))}
        <span className="kinetic-axis" aria-hidden="true" />
      </div>
      <div className="lab-tool-settings">
        {(
          [
            ['perspective', '透視距離', 'Perspective', 400, 1800, 50, 'px'],
            ['spacing', '卡片間距', 'Card spacing', 0.6, 1.4, 0.05, '×'],
            ['tilt', '側向旋轉', 'Side rotation', 0, 25, 1, '°'],
            ['depth', '景深距離', 'Depth distance', 0, 180, 5, 'px'],
            ['scale', '景深縮放', 'Depth scale', 0, 0.2, 0.01, ''],
            ['blur', '速度模糊', 'Velocity blur', 0, 4, 0.1, 'px'],
          ] as const
        ).map(([key, zh, en, min, max, step, unit]) => (
          <label className="lab-field" key={key}>
            <span>
              {t(zh, en)}{' '}
              <output>
                {options[key]}
                {unit}
              </output>
            </span>
            <input
              type="range"
              aria-label={t(zh, en)}
              min={min}
              max={max}
              step={step}
              value={options[key]}
              onChange={(event) => {
                setAutoplay(false);
                setOptions((previous) => ({ ...previous, [key]: Number(event.target.value) }));
              }}
            />
          </label>
        ))}
        <button className="lab-button" onClick={() => setOptions({ ...defaultKineticOptions })}>
          {t('重設外觀', 'Reset appearance')}
        </button>
      </div>
      <div className="kinetic-caption" aria-live={autoplay ? 'off' : 'polite'} aria-atomic="true">
        <span className="kinetic-index">
          {String(active + 1).padStart(2, '0')}
          <span> / 06</span>
        </span>
        <div>
          <h2>{t(studies[active].zh, studies[active].en)}</h2>
          <p>{studies[active].formula}</p>
        </div>
      </div>
      <div className="lab-controls kinetic-controls">
        <div className="kinetic-direction">
          <button
            className="lab-button"
            onClick={() => navigate(-1)}
            aria-label={t('上一張', 'Previous slide')}
          >
            <ArrowLeft size={18} />
          </button>
          <button
            className="lab-button"
            onClick={() => navigate(1)}
            aria-label={t('下一張', 'Next slide')}
          >
            <ArrowRight size={18} />
          </button>
        </div>
        <button
          className="lab-button"
          disabled={reducedMotion}
          aria-pressed={autoplay && !reducedMotion}
          onClick={() => setAutoplay((value) => !value)}
        >
          {autoplay && !reducedMotion ? <Pause size={16} /> : <Play size={16} />}
          {autoplay && !reducedMotion
            ? t('暫停輪播', 'Pause autoplay')
            : t('自動輪播', 'Start autoplay')}
        </button>
        <button
          className="lab-button"
          onClick={() => {
            setAutoplay(false);
            engine.current.target = nearestLoopTarget(0, engine.current.position, studies.length);
            engine.current.velocity = 0;
            wake.current();
          }}
        >
          <RotateCcw size={16} />
          {t('回到第一張', 'First slide')}
        </button>
      </div>
      {failedImages.length > 0 && (
        <div className="kinetic-image-error" role="alert">
          <p className="lab-note">
            {t(
              '部分圖像未載入，輪播仍可操作',
              'Some images did not load. The carousel remains usable.',
            )}
          </p>
          <button
            className="lab-button"
            type="button"
            onClick={() => setImageAttempt((value) => value + 1)}
          >
            {t('重試圖像', 'Retry images')}
          </button>
        </div>
      )}
      <p className="lab-note" id="kinetic-instructions">
        {reducedMotion
          ? t(
              '已減少動態，使用按鈕或方向鍵切換圖像',
              'Reduced motion is on — use buttons or arrow keys to change slides',
            )
          : t(
              '左右拖曳或使用方向鍵，操作後會暫停自動輪播，Esc 取消拖曳',
              'Drag horizontally or use arrow keys — interaction pauses autoplay, Esc cancels a drag',
            )}
      </p>
      <div className="kinetic-readout" aria-hidden="true">
        <span>
          {t('連續座標', 'POSITION')} <output ref={positionOutput}>0.00</output>
        </span>
        <span>
          {t('速度', 'VELOCITY')} <output ref={velocityOutput}>0.00</output> <small>slides/s</small>
        </span>
        <span>m = 1 · k = 150 · c = 19</span>
      </div>
      <p className="lab-note">
        {t(
          '匯出包含目前外觀參數與繪製函式，可接到自己的拖曳或動畫狀態，手機預覽會降低模糊量',
          'Export the current appearance and renderer for your own gesture or animation state. Mobile preview limits blur.',
        )}
      </p>
      <ToolExport
        code={kineticSource(options)}
        filename="carousel-renderer.js"
        mime="text/javascript;charset=utf-8"
        label={{ zh: '輪播 Renderer', en: 'Carousel renderer' }}
      />
    </div>
  );
}
