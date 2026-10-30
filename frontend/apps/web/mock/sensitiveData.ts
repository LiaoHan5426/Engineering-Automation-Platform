/** Mirrors Java SensitiveData's management-input guard; no external request is made. */
export function containsSecret(value: unknown): boolean {
  if (typeof value === 'string') return /(?:["']?(?:password|passwd|token|secret|api[_-]?key)["']?\s*[:=]\s*)(?:'[^']*'|"[^"]*"|[^\s,;}]+)|jdbc:[^\s'"]+/i.test(value);
  if (Array.isArray(value)) return value.some(containsSecret);
  if (value && typeof value === 'object') return Object.entries(value).some(([key, item]) => /(password|passwd|token|secret|credential|jdbc|connectionstring|api[_-]?key)/i.test(key) || containsSecret(item));
  return false;
}
