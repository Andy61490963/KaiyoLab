import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Pause, Play, RotateCcw, StepForward } from 'lucide-react';
import { useLabEnvironment } from './useLabEnvironment';
import {
  createFlow,
  FLOW_MAX_STEPS,
  FLOW_STEP,
  sampleCurl,
  stepFlow,
  type FlowProbe,
  type FlowState,
} from '../../lib/lab/flow-engine';
import '../../styles/lab-flow.css';
import ToolExport from './ToolExport';

export default function FlowField() {
  const { t, reducedMotion, visible, theme } = useLabEnvironment();
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const marker = useRef<HTMLDivElement>(null);
  const timeOutput = useRef<HTMLOutputElement>(null);
  const countOutput = useRef<HTMLOutputElement>(null);
  const fpsOutput = useRef<HTMLOutputElement>(null);
  const engine = useRef<FlowState | null>(null);
  const probe = useRef<FlowProbe>({ x: 1.5, y: 1.5, active: false, polarity: 1, strength: 1.8 });
  const probeInput = useRef<'pointer' | 'keyboard' | null>(null);
  const speedRef = useRef(1);
  const seedRef = useRef(731);
  const size = useRef({ width: 800, height: 480 });
  const resetRef = useRef<() => void>(() => {});
  const stepRef = useRef<() => void>(() => {});
  const refreshProbe = useRef<() => void>(() => {});
  const changePlayback = useRef<(value: boolean) => void>(() => {});
  const [playing, setPlaying] = useState(true);
  const [inView, setInView] = useState(false);
  const [seed, setSeed] = useState('731');
  const [appliedSeed, setAppliedSeed] = useState(731);
  const [error, setError] = useState(false);
  const [available, setAvailable] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [polarity, setPolarity] = useState<1 | -1>(1);
  const [density, setDensity] = useState(1100);
  const [palette, setPalette] = useState('brand');
  const [imageStatus, setImageStatus] = useState<'idle' | 'saved' | 'failed'>('idle');
  const running = playing && !reducedMotion && visible && inView;
  const runningRef = useRef(running);
  runningRef.current = running;

  useEffect(() => {
    if (!canvas.current) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.05,
    });
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const context = element.getContext('2d', { alpha: false });
    if (!context) {
      setAvailable(false);
      return;
    }
    let frame = 0;
    let lastTime = 0;
    let accumulator = 0;
    let fadeSteps = 0;
    let metricTime = 0;
    let frameCount = 0;
    let lastMetric = 0;
    let alive = true;
    const style = getComputedStyle(element);
    const background = style.getPropertyValue('--flow-paper').trim();
    const colors = ['--flow-ink', '--flow-accent', '--flow-secondary'].map((token) =>
      style.getPropertyValue(token).trim(),
    );
    const metrics = (force = false) => {
      const state = engine.current;
      if (!state) return;
      const now = performance.now();
      if (!force && now - lastMetric < 120) return;
      if (timeOutput.current) timeOutput.current.textContent = state.time.toFixed(2);
      if (countOutput.current) countOutput.current.textContent = String(state.count);
      element.dataset.steps = String(state.steps);
      lastMetric = now;
    };
    const showProbe = () => {
      const state = engine.current;
      if (!state || !marker.current) return;
      marker.current.hidden = !probe.current.active;
      marker.current.style.transform = `translate(${(probe.current.x / state.width) * size.current.width}px, ${(probe.current.y / state.height) * size.current.height}px)`;
    };
    refreshProbe.current = showProbe;
    const clear = () => {
      fadeSteps = 0;
      context.globalAlpha = 1;
      context.fillStyle = background;
      context.fillRect(0, 0, size.current.width, size.current.height);
    };
    const drawStill = () => {
      const state = engine.current;
      if (!state) return;
      clear();
      const sx = size.current.width / state.width;
      const sy = size.current.height / state.height;
      context.strokeStyle = colors[0];
      context.globalAlpha = 0.24;
      context.lineWidth = 0.8;
      context.beginPath();
      for (let y = 22; y < size.current.height; y += 28)
        for (let x = 22; x < size.current.width; x += 28) {
          const [vx, vy] = sampleCurl(state.waves, x / sx, y / sy, state.time);
          const length = Math.hypot(vx, vy) || 1;
          context.moveTo(x - (vx / length) * 5, y - (vy / length) * 5);
          context.lineTo(x + (vx / length) * 5, y + (vy / length) * 5);
        }
      context.stroke();
      context.globalAlpha = 0.8;
      context.fillStyle = colors[1];
      for (let index = 0; index < state.count; index++) {
        context.fillRect(state.x[index] * sx, state.y[index] * sy, 1.3, 1.3);
      }
      context.globalAlpha = 1;
      metrics(true);
      showProbe();
    };
    const drawParticles = () => {
      const state = engine.current!;
      const sx = size.current.width / state.width;
      const sy = size.current.height / state.height;
      context.lineWidth = size.current.width < 500 ? 0.95 : 0.85;
      context.globalAlpha = 0.7;
      for (let band = 0; band < 3; band++) {
        context.strokeStyle = colors[band];
        context.beginPath();
        for (let index = band; index < state.count; index += 3) {
          context.moveTo(state.previousX[index] * sx, state.previousY[index] * sy);
          context.lineTo(state.x[index] * sx, state.y[index] * sy);
        }
        context.stroke();
      }
      context.globalAlpha = 1;
    };
    const advance = (steps: number) => {
      if (!engine.current) return;
      for (let index = 0; index < steps; index++) {
        fadeSteps++;
        // 每 0.1 秒淡出一次，避免低 alpha 的 8-bit 預乘量化把深灰累積成深藍
        if (fadeSteps === 12) {
          context.globalAlpha = 1 - Math.exp(-12 * FLOW_STEP * 0.8);
          context.fillStyle = background;
          context.fillRect(0, 0, size.current.width, size.current.height);
          fadeSteps = 0;
        }
        stepFlow(engine.current, probe.current, speedRef.current);
        drawParticles();
      }
      metrics();
    };
    const resize = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      const height = entry.contentRect.height;
      if (!width || !height) return;
      size.current = { width, height };
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.round(width * dpr);
      element.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const aspect = width / height;
      if (!engine.current) engine.current = createFlow(seedRef.current, 1100, aspect);
      else {
        const ratio = (Math.max(0.5, aspect) * 3) / engine.current.width;
        for (let index = 0; index < engine.current.x.length; index++) {
          engine.current.x[index] *= ratio;
          engine.current.previousX[index] *= ratio;
          engine.current.velocityX[index] *= ratio;
        }
        probe.current.x *= ratio;
        engine.current.width *= ratio;
      }
      engine.current.count = width < 600 ? Math.min(density, 480) : density;
      drawStill();
    });
    resize.observe(element);
    const reset = () => {
      engine.current = createFlow(seedRef.current, 1100, size.current.width / size.current.height);
      engine.current.count = size.current.width < 600 ? Math.min(density, 480) : density;
      probe.current.active = false;
      probeInput.current = null;
      probe.current.x = engine.current.width / 2;
      probe.current.y = engine.current.height / 2;
      accumulator = 0;
      lastTime = 0;
      drawStill();
    };
    resetRef.current = reset;
    stepRef.current = () => {
      advance(12);
      metrics(true);
      showProbe();
    };
    const tick = (time: number) => {
      if (!alive || !runningRef.current) return;
      const elapsed = lastTime ? Math.min((time - lastTime) / 1000, FLOW_STEP * FLOW_MAX_STEPS) : 0;
      lastTime = time;
      accumulator += elapsed;
      const steps = Math.min(FLOW_MAX_STEPS, Math.floor((accumulator + 1e-10) / FLOW_STEP));
      if (steps && engine.current) {
        advance(steps);
        accumulator = Math.max(0, accumulator - steps * FLOW_STEP);
      }
      frameCount++;
      if (!metricTime) metricTime = time;
      if (time - metricTime > 800) {
        if (fpsOutput.current)
          fpsOutput.current.textContent = String(
            Math.round((frameCount * 1000) / (time - metricTime)),
          );
        metricTime = time;
        frameCount = 0;
      }
      frame = requestAnimationFrame(tick);
    };
    changePlayback.current = (value) => {
      cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
      accumulator = 0;
      metricTime = 0;
      frameCount = 0;
      metrics(true);
      if (value && alive) frame = requestAnimationFrame(tick);
      else if (fpsOutput.current) fpsOutput.current.textContent = '—';
    };
    drawStill();
    changePlayback.current(runningRef.current);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      resize.disconnect();
      resetRef.current = () => {};
      stepRef.current = () => {};
      refreshProbe.current = () => {};
      changePlayback.current = () => {};
    };
  }, [theme, density, palette]);

  useEffect(() => {
    changePlayback.current(running);
  }, [running]);

  const positionProbe = (event: PointerEvent<HTMLCanvasElement>) => {
    const state = engine.current;
    if (!state) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    probe.current.x = Math.max(
      0,
      Math.min(state.width, ((event.clientX - bounds.left) / bounds.width) * state.width),
    );
    probe.current.y = Math.max(
      0,
      Math.min(state.height, ((event.clientY - bounds.top) / bounds.height) * state.height),
    );
    probe.current.active = true;
    probeInput.current = 'pointer';
    refreshProbe.current();
  };
  const clearProbe = () => {
    probe.current.active = false;
    probeInput.current = null;
    refreshProbe.current();
  };
  const reset = () => {
    const value = Number(seed);
    if (!/^\d{1,9}$/.test(seed) || !Number.isSafeInteger(value)) {
      setError(true);
      return;
    }
    setError(false);
    seedRef.current = value;
    setAppliedSeed(value);
    resetRef.current();
  };
  return (
    <div
      className="flow-lab"
      ref={root}
      data-flow-field
      data-running={running}
      data-seed={appliedSeed}
      onBlur={(event) => {
        // 鍵盤移到區內的單步或作用力按鈕時保留作用點，離開實驗區才解除
        if (!event.currentTarget.contains(event.relatedTarget)) clearProbe();
      }}
    >
      <div className="flow-topline">
        <span>{t('粒子背景產生器', 'PARTICLE BACKGROUND GENERATOR')}</span>
        <span>∇ · v = 0</span>
      </div>
      <div className="flow-stage">
        <canvas
          ref={canvas}
          tabIndex={0}
          aria-label={t('可互動粒子流場', 'Interactive flow field')}
          aria-describedby="flow-instructions"
          data-flow-canvas
          data-palette={palette}
          onPointerDown={(event) => {
            if (!event.isPrimary) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            positionProbe(event);
          }}
          onPointerMove={(event) => {
            if (
              event.pointerType === 'mouse' ||
              event.currentTarget.hasPointerCapture(event.pointerId)
            )
              positionProbe(event);
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
            if (event.pointerType !== 'mouse') {
              clearProbe();
            }
          }}
          onPointerLeave={() => {
            if (probeInput.current === 'pointer') clearProbe();
          }}
          onPointerCancel={clearProbe}
          onKeyDown={(event) => {
            const state = engine.current;
            if (!state) return;
            if (
              ![
                'ArrowLeft',
                'ArrowRight',
                'ArrowUp',
                'ArrowDown',
                'Home',
                'Escape',
                'Enter',
              ].includes(event.key)
            )
              return;
            event.preventDefault();
            if (event.key === 'Escape') {
              probe.current.active = false;
              probeInput.current = null;
            } else if (event.key === 'Enter') {
              probe.current.active = !probe.current.active;
              probeInput.current = probe.current.active ? 'keyboard' : null;
            } else {
              probe.current.active = true;
              probeInput.current = 'keyboard';
              if (event.key === 'Home') {
                probe.current.x = state.width / 2;
                probe.current.y = state.height / 2;
              }
              if (event.key === 'ArrowLeft')
                probe.current.x = Math.max(0, probe.current.x - state.width * 0.04);
              if (event.key === 'ArrowRight')
                probe.current.x = Math.min(state.width, probe.current.x + state.width * 0.04);
              if (event.key === 'ArrowUp')
                probe.current.y = Math.max(0, probe.current.y - state.height * 0.04);
              if (event.key === 'ArrowDown')
                probe.current.y = Math.min(state.height, probe.current.y + state.height * 0.04);
            }
            refreshProbe.current();
          }}
        >
          {t(
            '此瀏覽器不支援 Canvas，請使用支援 Canvas 的瀏覽器操作流場',
            'This browser does not support Canvas',
          )}
        </canvas>
        <div className="flow-probe" ref={marker} hidden aria-hidden="true" data-polarity={polarity}>
          <span>{polarity === 1 ? '+' : '−'}</span>
        </div>
        <span className="flow-coordinate" aria-hidden="true">
          {t('六層勢函數', '6 HARMONIC LAYERS')}
          <br />
          ψ(x, y, t) → curl ψ
        </span>
      </div>
      {!available && (
        <p role="alert" className="lab-note">
          {t(
            '無法啟用 Canvas，請檢查瀏覽器設定',
            'Canvas is unavailable — check your browser settings',
          )}
        </p>
      )}
      <div className="flow-strip lab-metrics" aria-hidden="true">
        <span>
          {t('粒子', 'PARTICLES')} <output ref={countOutput}>—</output>
        </span>
        <span>
          {t('模擬時間', 'SIMULATION')} <output ref={timeOutput}>0.00</output> s
        </span>
        <span>
          FPS <output ref={fpsOutput}>—</output>
        </span>
        <span>Δt = 1/120 s</span>
      </div>
      <div className="lab-controls flow-controls">
        <button
          className="lab-button"
          disabled={reducedMotion || !available}
          onClick={() => setPlaying((value) => !value)}
          aria-pressed={playing && !reducedMotion}
        >
          {playing && !reducedMotion ? <Pause size={16} /> : <Play size={16} />}
          {playing && !reducedMotion ? t('暫停', 'Pause') : t('播放', 'Play')}
        </button>
        <button
          className="lab-button"
          disabled={running || !available}
          onClick={() => stepRef.current()}
        >
          <StepForward size={16} />
          {t('前進 0.1 秒', 'Step 0.1 s')}
        </button>
        <div className="flow-mode" role="group" aria-label={t('游標作用力', 'Pointer force')}>
          <button
            className="lab-button"
            aria-pressed={polarity === 1}
            onClick={() => {
              setPolarity(1);
              probe.current.polarity = 1;
            }}
          >
            {t('吸引 +', 'Attract +')}
          </button>
          <button
            className="lab-button"
            aria-pressed={polarity === -1}
            onClick={() => {
              setPolarity(-1);
              probe.current.polarity = -1;
            }}
          >
            {t('排斥 −', 'Repel −')}
          </button>
        </div>
        <label className="lab-field flow-speed">
          {t('流速', 'Flow speed')} <output>{speed.toFixed(1)}×</output>
          <input
            type="range"
            min="0.3"
            max="2"
            step="0.1"
            value={speed}
            onChange={(event) => {
              const value = Number(event.target.value);
              setSpeed(value);
              speedRef.current = value;
            }}
          />
        </label>
      </div>
      <form
        className="flow-seed"
        onSubmit={(event) => {
          event.preventDefault();
          reset();
        }}
      >
        <label className="lab-field">
          {t('隨機種子', 'Seed')}
          <input
            type="text"
            inputMode="numeric"
            maxLength={9}
            value={seed}
            aria-invalid={error}
            aria-describedby={error ? 'flow-seed-error' : undefined}
            onChange={(event) => setSeed(event.target.value)}
          />
        </label>
        <button className="lab-button" disabled={!available} type="submit">
          <RotateCcw size={16} />
          {t('重建流場', 'Reset field')}
        </button>
        <p className="lab-note">
          {t('相同種子、時間與操作，得到相同軌跡', 'Same seed, time and input — same trajectories')}
        </p>
      </form>
      {error && (
        <p id="flow-seed-error" role="alert">
          {t('請輸入 0 到 999999999 的整數', 'Enter an integer from 0 to 999999999')}
        </p>
      )}
      <p className="lab-note" id="flow-instructions">
        {reducedMotion &&
          t(
            '已減少動態，自動播放已關閉，可逐步觀察流場',
            'Reduced motion is on — autoplay is disabled, step through the field',
          )}
        <span>
          {t(
            ' 移動滑鼠或拖曳畫布施力，也可聚焦畫布後用方向鍵移動作用點，Enter 切換作用力、Esc 解除',
            ' Move your pointer or drag on the canvas to apply force, or focus it and use arrow keys to move the probe, Enter to toggle force and Esc to release',
          )}
        </span>
      </p>
      <div className="lab-tool-settings">
        <label className="lab-field">
          <span>
            {t('粒子上限', 'Particle limit')} <output>{density}</output>
          </span>
          <input
            type="range"
            aria-label={t('粒子上限', 'Particle limit')}
            min="120"
            max="1100"
            step="20"
            value={density}
            onChange={(event) => setDensity(Number(event.target.value))}
          />
        </label>
        <label className="lab-field">
          {t('背景配色', 'Background palette')}
          <select
            aria-label={t('背景配色', 'Background palette')}
            value={palette}
            onChange={(event) => setPalette(event.target.value)}
          >
            <option value="brand">{t('莓紅與炭灰', 'Berry & charcoal')}</option>
            <option value="ocean">{t('藍灰與青綠', 'Slate & teal')}</option>
            <option value="mono">{t('單色線條', 'Monochrome')}</option>
          </select>
        </label>
        <button
          className="lab-button"
          disabled={!available}
          onClick={() => {
            try {
              if (!canvas.current || !engine.current) throw new Error('Canvas 尚未就緒');
              const link = document.createElement('a');
              link.href = canvas.current.toDataURL('image/png');
              link.download = `particle-background-${appliedSeed}.png`;
              link.click();
              setImageStatus('saved');
            } catch {
              setImageStatus('failed');
            }
          }}
        >
          {t('下載目前背景 PNG', 'Download background PNG')}
        </button>
      </div>
      <p className="lab-note" role="status">
        {imageStatus === 'failed'
          ? t('背景匯出失敗，請重試', 'Could not export the background — retry')
          : imageStatus === 'saved'
            ? t(
                '已下載目前畫面，可作為網站背景',
                'Downloaded the current frame for use as a website background',
              )
            : t(
                '手機最多顯示 480 個粒子，PNG 依目前畫布解析度匯出',
                'Mobile displays up to 480 particles. PNG uses the current canvas resolution.',
              )}
      </p>
      <ToolExport
        code={JSON.stringify(
          {
            seed: appliedSeed,
            particleLimit: density,
            speed,
            palette,
            polarity,
            integrationStep: FLOW_STEP,
          },
          null,
          2,
        )}
        filename="particle-background.json"
        mime="application/json"
        label={{ zh: '背景參數 JSON', en: 'Background settings JSON' }}
      />
    </div>
  );
}
