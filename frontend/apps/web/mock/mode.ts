/** Vite serve switch. The UI does not choose a second API prefix. */
export function useMockServer(options: { command: string; mode: string; flag?: string }) {
  if (options.command !== 'serve' || options.mode === 'test') return false;
  return options.mode === 'mock' || options.flag === 'true';
}
