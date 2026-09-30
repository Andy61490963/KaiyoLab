import { useEffect, useRef, useState } from 'react';
import { damp, storyAt, storyChapters, storyPricePath, STORY_DURATION } from '../../lib/lab/story';
import { useLabEnvironment } from './useLabEnvironment';
import '../../styles/lab-story.css';

export default function LiquidityStory() {
  const environment = useLabEnvironment();
  const { t, visible, reducedMotion, theme } = environment;
  const container = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const controls = useRef({ time: 0, manual: false, pointerX: 0, pointerY: 0 });
  const invalidate = useRef<() => void>(() => {});
  const [snapshot, setSnapshot] = useState(() => storyAt(0));
  const [manual, setManual] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (visible && reducedMotion) {
      controls.current.manual = true;
      setManual(true);
    }
  }, [visible, reducedMotion]);

  useEffect(() => {
    const outer = container.current;
    const scene = stage.current;
    const element = canvas.current;
    if (!outer || !scene || !element) return;
    const ctx = element.getContext('2d');
    if (!ctx) {
      controls.current.manual = true;
      setManual(true);
      setError(true);
      return;
    }
    let disposed = false;
    let frame = 0;
    let inView = true;
    let width = 700;
    let height = 390;
    let top = 0;
    let distance = 1;
    let last = 0;
    let lastReact = 0;
    let cameraX = 0;
    let cameraY = 0;
    let lastTime = controls.current.time;
    let velocity = 0;
    let frames = 0;
    const style = getComputedStyle(document.body);
    const colors = {
      bg: style.getPropertyValue('--bg').trim(),
      text: style.getPropertyValue('--text').trim(),
      muted: style.getPropertyValue('--muted').trim(),
      line: style.getPropertyValue('--border').trim(),
      accent: style.getPropertyValue('--accent').trim(),
      surface: style.getPropertyValue('--surface').trim(),
    };

    const draw = (timestamp: number) => {
      frame = 0;
      if (disposed || !visible || !inView) return;
      const elapsed = last ? Math.min((timestamp - last) / 1000, 0.05) : 1 / 60;
      last = timestamp;
      const state = storyAt(controls.current.time);
      const targetX = reducedMotion ? 0 : controls.current.pointerX;
      const targetY = reducedMotion ? 0 : controls.current.pointerY;
      cameraX = damp(cameraX, targetX, elapsed);
      cameraY = damp(cameraY, targetY, elapsed);
      const observedVelocity = (state.time - lastTime) / Math.max(elapsed, 0.001);
      velocity = damp(velocity, observedVelocity, elapsed, 5);
      lastTime = state.time;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, width, height);
      const mobile = width < 500;
      const plot = {
        x: mobile ? 35 : 52,
        y: 65,
        width: width * (mobile ? 0.53 : 0.57),
        height: height - 111,
      };
      const bookX = width * 0.69;
      const bookWidth = width * 0.26;
      const px = (time: number) => plot.x + (time / 60) * plot.width;
      const py = (price: number) => plot.y + ((105 - price) / 32) * plot.height;
      ctx.save();
      ctx.translate(cameraX * 3, cameraY * 2);
      ctx.font = `${mobile ? 10 : 11}px "JetBrains Mono", monospace`;
      ctx.fillStyle = colors.muted;
      ctx.fillText('PRICE / INDEX', plot.x, 26);
      ctx.fillText('BID / ASK', bookX, 26);
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 0.7;
      for (const value of [80, 90, 100]) {
        ctx.beginPath();
        ctx.moveTo(plot.x, py(value));
        ctx.lineTo(plot.x + plot.width, py(value));
        ctx.stroke();
        ctx.fillText(String(value), mobile ? 4 : 14, py(value) + 4);
      }
      for (const second of [0, 20, 40, 60])
        ctx.fillText(`${second}s`, px(second) - 7, plot.y + plot.height + 27);
      ctx.strokeStyle = colors.line;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      storyPricePath.forEach((price, index) => {
        if (!index) ctx.moveTo(px(index / 4), py(price));
        else ctx.lineTo(px(index / 4), py(price));
      });
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      ctx.save();
      ctx.translate(reducedMotion ? 0 : cameraX * 8, reducedMotion ? 0 : cameraY * 5);
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = mobile ? 2 : 2.5;
      ctx.beginPath();
      const end = Math.floor(state.time * 4);
      for (let index = 0; index <= end; index++) {
        if (!index) ctx.moveTo(px(0), py(storyPricePath[0]));
        else ctx.lineTo(px(index / 4), py(storyPricePath[index]));
      }
      ctx.lineTo(px(state.time), py(state.price));
      ctx.stroke();
      ctx.fillStyle = colors.accent;
      ctx.beginPath();
      ctx.arc(px(state.time), py(state.price), 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = colors.muted;
      ctx.lineWidth = 0.8;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(px(state.time), plot.y);
      ctx.lineTo(px(state.time), plot.y + plot.height);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      ctx.save();
      ctx.translate(reducedMotion ? 0 : cameraX * -5, reducedMotion ? 0 : cameraY * -3);
      const gap = 4 + state.spread * (mobile ? 3 : 5);
      const center = bookX + bookWidth / 2;
      const rowHeight = plot.height / 8;
      state.levels.forEach((level, index) => {
        const y = plot.y + index * rowHeight;
        const bidWidth = Math.max(1, (level.bidQuantity / 150) * (bookWidth / 2 - 8));
        const askWidth = Math.max(1, (level.askQuantity / 150) * (bookWidth / 2 - 8));
        ctx.fillStyle = colors.accent;
        ctx.fillRect(center - gap / 2 - bidWidth, y, bidWidth, rowHeight * 0.55);
        ctx.fillStyle = colors.text;
        ctx.globalAlpha = 0.62;
        ctx.fillRect(center + gap / 2, y, askWidth, rowHeight * 0.55);
        ctx.globalAlpha = 1;
      });
      ctx.font = `${mobile ? 9 : 11}px "JetBrains Mono", monospace`;
      ctx.fillStyle = colors.muted;
      ctx.fillText(`${Math.round(state.depth * 100)}% DEPTH`, bookX, plot.y + plot.height + 27);
      if (state.halted) {
        ctx.fillStyle = colors.accent;
        ctx.fillText('HALTED', bookX, plot.y - 16);
      }
      ctx.restore();
      if (!reducedMotion)
        scene.style.setProperty(
          '--camera-tilt',
          `${Math.max(-0.5, Math.min(0.5, velocity / 60))}deg`,
        );
      else scene.style.setProperty('--camera-tilt', '0deg');
      element.dataset.frames = String(++frames);
      element.dataset.time = state.time.toFixed(3);
      const settling =
        !reducedMotion &&
        (Math.abs(cameraX - targetX) + Math.abs(cameraY - targetY) > 0.002 ||
          Math.abs(velocity) > 0.03);
      if (reducedMotion || !settling || timestamp - lastReact >= 80 || !lastReact) {
        setSnapshot(state);
        lastReact = timestamp;
      }
      if (settling) schedule();
    };
    const schedule = () => {
      if (!frame && !disposed && visible && inView) frame = requestAnimationFrame(draw);
    };
    invalidate.current = schedule;
    const updateScroll = () => {
      if (!reducedMotion && !controls.current.manual)
        controls.current.time = Math.max(
          0,
          Math.min(60, ((window.scrollY - top + 100) / distance) * 60),
        );
      schedule();
    };
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      const ratio = Math.min(devicePixelRatio || 1, 2);
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      top = outer.getBoundingClientRect().top + window.scrollY;
      distance = Math.max(1, outer.offsetHeight - scene.offsetHeight);
      updateScroll();
    };
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    resize.observe(outer);
    resize.observe(scene);
    const intersection = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        if (inView) {
          last = 0;
          schedule();
        } else {
          cancelAnimationFrame(frame);
          frame = 0;
        }
      },
      { rootMargin: '80px' },
    );
    intersection.observe(scene);
    window.addEventListener('scroll', updateScroll, { passive: true });
    measure();
    return () => {
      disposed = true;
      invalidate.current = () => {};
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      window.removeEventListener('scroll', updateScroll);
      ctx.clearRect(0, 0, width, height);
    };
  }, [visible, reducedMotion, theme]);

  const seek = (time: number) => {
    controls.current.time = time;
    controls.current.manual = true;
    setManual(true);
    setSnapshot(storyAt(time));
    invalidate.current();
  };
  const chapter = storyChapters[snapshot.chapter];
  return (
    <div className="liquidity-story" ref={container} data-testid="liquidity-story">
      <div className="story-stage" ref={stage}>
        <div className="story-topline">
          <span className="lab-kicker">EVENT STUDY / 060</span>
          <span className="story-clock">
            {snapshot.time.toFixed(1).padStart(4, '0')}
            <small> / 60s</small>
          </span>
        </div>
        <div
          className="story-canvas-wrap"
          onPointerMove={(event) => {
            if (event.pointerType !== 'mouse') return;
            const bounds = event.currentTarget.getBoundingClientRect();
            controls.current.pointerX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
            controls.current.pointerY = ((event.clientY - bounds.top) / bounds.height) * 2 - 1;
            invalidate.current();
          }}
          onPointerLeave={() => {
            controls.current.pointerX = 0;
            controls.current.pointerY = 0;
            invalidate.current();
          }}
        >
          {error ? (
            <p role="alert">
              {t(
                '此瀏覽器無法開啟 Canvas，仍可使用時間軸閱讀數據',
                'Canvas is unavailable. You can still explore the timeline and values below.',
              )}
            </p>
          ) : (
            <canvas
              ref={canvas}
              role="img"
              aria-label={t(
                '市場價格與買賣深度，數值詳列於下方',
                'Market price and bid/ask depth, with values listed below',
              )}
            />
          )}
        </div>
        <div className="story-stats" aria-label={t('當前市場狀態', 'Current market state')}>
          <div>
            <span>{t('價格指數', 'Price index')}</span>
            <strong>{snapshot.price.toFixed(2)}</strong>
          </div>
          <div>
            <span>{t('價差', 'Spread')}</span>
            <strong>{snapshot.spread.toFixed(2)}</strong>
          </div>
          <div>
            <span>{t('剩餘深度', 'Depth remaining')}</span>
            <strong>{(snapshot.depth * 100).toFixed(0)}%</strong>
          </div>
        </div>
        <div className="story-caption">
          <span className="story-chapter-number">0{snapshot.chapter + 1}</span>
          <div>
            <h2>{t(chapter.zh, chapter.en)}</h2>
            <p>{t(chapter.detailZh, chapter.detailEn)}</p>
          </div>
        </div>
        <label className="story-scrubber">
          <span>{t('事件時間', 'Event time')}</span>
          <input
            type="range"
            min="0"
            max={STORY_DURATION}
            step="0.1"
            value={snapshot.time}
            onChange={(event) => seek(Number(event.target.value))}
            aria-valuetext={`${snapshot.time.toFixed(1)} ${t('秒', 'seconds')}`}
          />
        </label>
        <div className="story-actions">
          <button className="lab-button" type="button" onClick={() => seek(0)}>
            {t('重設', 'Reset')}
          </button>
          <button
            className="lab-button"
            type="button"
            disabled={reducedMotion || error}
            aria-pressed={!manual && !reducedMotion && !error}
            onClick={() => {
              controls.current.manual = false;
              setManual(false);
              window.dispatchEvent(new Event('scroll'));
            }}
          >
            {t('跟隨捲動', 'Follow scroll')}
          </button>
          <p className="lab-note">
            {error
              ? t(
                  'Canvas 無法使用：請使用時間軸或章節操作',
                  'Canvas unavailable: use the timeline or chapters',
                )
              : reducedMotion
                ? t(
                    '減少動態：使用時間軸或章節操作',
                    'Reduced motion: use the timeline or chapters',
                  )
                : manual
                  ? t('拖曳時間軸或選擇章節', 'Scrub the timeline or choose a chapter')
                  : t('向下捲動，或使用時間軸', 'Scroll down, or use the timeline')}
          </p>
        </div>
        <nav className="story-chapters" aria-label={t('事件章節', 'Event chapters')}>
          {storyChapters.map((item, index) => (
            <button
              type="button"
              key={item.time}
              aria-current={snapshot.chapter === index ? 'step' : undefined}
              onClick={() => seek(item.time)}
            >
              <span>0{index + 1}</span>
              <span>{t(item.zh, item.en)}</span>
            </button>
          ))}
        </nav>
        <p className="lab-note story-model-note">
          {t(
            '虛構事件，用於說明市場流動性，並非真實交易紀錄',
            'A fictional event illustrating liquidity, not a historical trading record',
          )}
        </p>
      </div>
    </div>
  );
}
