import { describe, expect, it } from 'vitest';
import { defaultKineticOptions, kineticSource } from '../src/lib/lab/kinetic-export';

describe('輪播匯出 Renderer', () => {
  it('實際執行輸出可反映參數、週期位置與減少動態', () => {
    const settings = { ...defaultKineticOptions, spacing: 1.2, depth: 120, perspective: 1100 };
    const render = new Function(
      kineticSource(settings).replaceAll('export ', '') + '; return renderCarousel;',
    )();
    const parentElement = { style: {} as Record<string, string> };
    const cards = Array.from({ length: 6 }, () => ({
      style: {} as Record<string, string>,
      parentElement,
    }));
    render(cards, 0, 3, 250);
    expect(parentElement.style.perspective).toBe('1100px');
    expect(cards[1].style.transform).toContain('translate3d(300px,16px,-120px)');
    expect(cards[1].style.transform).toContain('rotateY(-13.35deg)');
    const first = cards.map((card) => ({ ...card.style }));
    render(cards, 600, 3, 250);
    expect(cards.map((card) => card.style)).toEqual(first);
    render(cards, -600, 3, 250, true);
    expect(cards[1].style.transform).toContain('rotateY(0deg) scale(1)');
    expect(cards[1].style.filter).toBe('none');
    expect(() => render([], 0, 0, 250)).not.toThrow();
  });
});
