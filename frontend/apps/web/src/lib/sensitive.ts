/**
 * Credential refusal in the browser, mirroring the runtime's own check.
 *
 * The runtime is the enforcement: `SensitiveData.containsSecret` refuses a binary path, an MCP address,
 * a knowledge document, a supplement and an execution plan that carry a credential, and redacts
 * stdout/stderr and model text on the way out. This module is the *explanatory* half — the part that can
 * say "that looks like a password, put it in the environment instead" at the field, before a request is
 * made. A control that only fails on submit teaches nothing, and a bare 400 cannot name the field.
 *
 * The two sets of patterns must stay in step, so the shapes here are the shapes the runtime rejects.
 */
const ASSIGNMENT = /(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)\s*[:=]\s*\S+/i;
const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const BEARER = /\bbearer\s+[a-z0-9._-]{20,}/i;

/** True when the value carries something that must not be stored or persisted. */
export function containsSecret(value: string | null | undefined): boolean {
  return describeSecret(value) !== null;
}

/**
 * Why a value was refused, in the operator's terms — or `null` when it is fine.
 *
 * Returned as a phrase rather than a boolean because the *reason* is the useful part: a URL credential
 * and a `password=` assignment are different mistakes with different fixes.
 */
export function describeSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (PRIVATE_KEY.test(value)) return "看起来是私钥内容";
  if (BEARER.test(value)) return "看起来是 Bearer 令牌";
  const credentials = urlCredentials(value);
  if (credentials) return `地址中的凭据（${credentials}）`;
  if (ASSIGNMENT.test(value)) return "疑似密钥赋值（如 password=… / api_key=…）";
  return null;
}

/**
 * The `user:password@host` half of a URL.
 *
 * A dedicated check is needed because the assignment pattern above deliberately requires an `=` or `:`
 * followed by a non-space value, and `http://user:secret@127.0.0.1:8080` has neither in the right shape —
 * the shape an operator actually pastes into an endpoint field. The runtime refuses it; so does this.
 */
export function urlCredentials(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (!url.username && !url.password) return null;
  return `${url.username}:${url.password}`;
}
