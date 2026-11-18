/** Validate Cordis public JavaScript exports with Node's package resolver after Host bundling. */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const probe = `
import { strict as assert } from 'node:assert';
import { FiberState, LoggerLevel } from '@deepseek-ai/cordis';
for (const [name, actual, expected] of [
  ['FiberState', FiberState, { PENDING: 0, LOADING: 1, ACTIVE: 2, FAILED: 3, DISPOSED: 4, UNLOADING: 5 }],
  ['LoggerLevel', LoggerLevel, { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 }],
]) {
  for (const [member, value] of Object.entries(expected)) {
    assert.equal(actual?.[member], value, name + '.' + member);
  }
}
`;

/**
 * Import the built package entry in a fresh Node process without source loaders.
 * @param root - Repository or fixture root containing the Cordis package.
 * @throws If Node fails to load the entry or a required runtime enum member differs.
 */
export function verifyHostRuntimeExports(root: string): void {
  const { NODE_OPTIONS: _nodeOptions, ...env } = process.env;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", probe], {
    cwd: resolve(root, "vendor/cordis"),
    env,
    encoding: "utf8",
    timeout: 30_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`host-runtime-exports: Cordis built entry failed (status ${String(result.status)}, signal ${String(result.signal)})\n${result.stderr}`);
  }
}

if (import.meta.main) {
  verifyHostRuntimeExports(resolve(import.meta.dirname, ".."));
  console.log("host-runtime-exports: Cordis built entry exports FiberState and LoggerLevel.");
}
