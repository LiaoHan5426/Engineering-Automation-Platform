import { expect, it } from 'vite-plus/test';
import { popupPlacement } from './popupPlacement';
it('fits above the trigger in a short viewport regardless of composer height', () => {
  const style = popupPlacement({ top: 572, bottom: 606, left: 88 }, { width: 708, height: 640 });
  expect(style.position).toBe('fixed');
  expect(parseFloat(style.top!) - parseFloat(style.maxHeight!)).toBeGreaterThanOrEqual(0);
  expect(style.transform).toBe('translateY(-100%)');
});
it('opens down near the top and clamps to the right viewport edge', () => {
  const style = popupPlacement({ top: 30, bottom: 64, left: 650 }, { width: 708, height: 640 });
  expect(style.transform).toBe('none');
  expect(parseFloat(style.left!) + parseFloat(style.width!)).toBeLessThan(708);
  expect(parseFloat(style.top!) + parseFloat(style.maxHeight!)).toBeLessThan(640);
});
