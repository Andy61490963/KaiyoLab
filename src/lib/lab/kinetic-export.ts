export interface KineticOptions {
  perspective: number;
  spacing: number;
  tilt: number;
  depth: number;
  scale: number;
  blur: number;
}
export const defaultKineticOptions: KineticOptions = {
  perspective: 950,
  spacing: 0.91,
  tilt: 12,
  depth: 95,
  scale: 0.12,
  blur: 2,
};

// 匯出與預覽共用相同參數，輸出僅包含可整合的 renderer，手勢生命週期由宿主控制
export function kineticSource(options: KineticOptions): string {
  return `// 3D 輪播設定與繪製函式，position 使用無界連續座標，velocity 單位為張／秒
export const options = ${JSON.stringify(options, null, 2)};

// 容器需 position:relative; overflow:hidden; perspective:${options.perspective}px
// 容器自行設定 --card-width（例如 280px），並把相同像素寬度傳入 cardWidth
// 圖片需 position:absolute; width:var(--card-width); left:calc(50% - var(--card-width)/2); aspect-ratio:4/5
export function renderCarousel(cards, position, velocity, cardWidth, reducedMotion = false) {
  const count = cards.length;
  if (!count) return;
  cards[0].parentElement.style.perspective = options.perspective + 'px';
  cards.forEach((card, index) => {
    const distance = (((index - position + count / 2) % count) + count) % count - count / 2;
    const depth = Math.min(2, Math.abs(distance));
    const scale = reducedMotion ? 1 : 1 - depth * options.scale;
    const tilt = reducedMotion ? 0 : Math.max(-35, Math.min(35, distance * -options.tilt - velocity * 0.45));
    card.style.transform = 'translate3d(' + distance * cardWidth * options.spacing + 'px,' + depth * (reducedMotion ? 0 : 16) + 'px,' + -depth * options.depth + 'px) rotateY(' + tilt + 'deg) scale(' + scale + ')';
    card.style.opacity = Math.max(0, 1 - Math.max(0, depth - 0.8) * 0.67);
    card.style.filter = reducedMotion ? 'none' : 'blur(' + Math.min(options.blur, Math.abs(velocity) * depth * 0.13) + 'px)';
    card.style.zIndex = 10 - Math.round(depth * 3);
  });
}

// 將拖曳位置或動畫位置傳入 renderCarousel，圖片、按鈕與手勢處理由你的元件提供
// 減少動態模式：matchMedia('(prefers-reduced-motion: reduce)').matches
`;
}
