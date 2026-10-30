import { expect, it } from 'vite-plus/test';
import { useMockServer } from './mode';

it('keeps the dev server on the real API unless mock mode or VITE_USE_MOCK is requested', () => {
  expect(useMockServer({ command: 'serve', mode: 'development' })).toBe(false);
  expect(useMockServer({ command: 'serve', mode: 'development', flag: 'false' })).toBe(false);
  expect(useMockServer({ command: 'serve', mode: 'development', flag: 'true' })).toBe(true);
  expect(useMockServer({ command: 'serve', mode: 'mock' })).toBe(true);
  expect(useMockServer({ command: 'build', mode: 'mock' })).toBe(false);
  expect(useMockServer({ command: 'serve', mode: 'test', flag: 'true' })).toBe(false);
});
