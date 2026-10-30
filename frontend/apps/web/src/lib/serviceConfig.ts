/** True only for a dev server started with mock mode or VITE_USE_MOCK=true. */
export function mockServicesEnabled(flag: string | boolean | undefined, dev = true) {
  return dev && (flag === true || flag === 'true');
}

export const useMockServices = mockServicesEnabled(import.meta.env.VITE_USE_MOCK, import.meta.env.DEV);
