import { expect, it } from 'vite-plus/test';
import { mockServicesEnabled } from './serviceConfig';

it('enables mock labels only when the dev flag is explicitly true', () => {
  expect(mockServicesEnabled(undefined, true)).toBe(false);
  expect(mockServicesEnabled('false', true)).toBe(false);
  expect(mockServicesEnabled('true', true)).toBe(true);
  expect(mockServicesEnabled('true', false)).toBe(false);
});
