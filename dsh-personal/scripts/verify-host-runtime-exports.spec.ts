import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { verifyHostRuntimeExports } from "./verify-host-runtime-exports.ts";

const fiber = "export const FiberState = { PENDING: 0, LOADING: 1, ACTIVE: 2, FAILED: 3, DISPOSED: 4, UNLOADING: 5 };";
const logger = "export const LoggerLevel = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };";

async function fixture(entry: string, check: (root: string) => void): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "dsh-runtime-exports-"));
  try {
    const pkg = join(root, "vendor/cordis");
    await mkdir(join(pkg, "lib"), { recursive: true });
    await writeFile(join(pkg, "package.json"), JSON.stringify({
      name: "@deepseek-ai/cordis", type: "module", exports: { ".": "./lib/index.js" },
    }));
    await writeFile(join(pkg, "lib/index.js"), entry);
    check(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

it("loads runtime enum members through the public built package export", async () => {
  await fixture(fiber + logger, root => expect(() => verifyHostRuntimeExports(root)).not.toThrow());
});

it.each([
  ["FiberState", logger],
  ["LoggerLevel", fiber],
  ["FiberState.ACTIVE", fiber.replace("ACTIVE: 2", "ACTIVE: 99") + logger],
  ["LoggerLevel.DEBUG", fiber + logger.replace("DEBUG: 3", "DEBUG: undefined")],
])("rejects a built entry with missing or invalid %s", async (diagnostic, entry) => {
  await fixture(entry, root => expect(() => verifyHostRuntimeExports(root)).toThrow(diagnostic));
});
