import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { Rolldown, type UserConfig } from "vite-plus/pack";
import { describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  configs: [] as UserConfig[],
  tamper: undefined as "version" | "source" | undefined,
}));
vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs")>();
  return {
    ...original,
    readFileSync: (...args: Parameters<typeof original.readFileSync>) => {
      const value = original.readFileSync(...args);
      const path = String(args[0]).replaceAll("\\", "/");
      if (
        state.tamper === "version" &&
        path.includes("luckysheet") &&
        path.endsWith("/package.json")
      ) {
        const manifest = JSON.parse(value.toString()) as { version: string };
        manifest.version = "2.1.14";
        return Buffer.from(JSON.stringify(manifest));
      }
      if (state.tamper === "source" && path.endsWith("/luckysheet.umd.js"))
        return Buffer.from(value.toString() + "\n/* changed source */");
      return value;
    },
  };
});
vi.mock("../packages/client/pack.client.ts", () => ({ clientBundle: () => () => state.configs }));
import previewConfig from "../packages/client/ui-sidebar-documentpreview/vite.config.ts";

function firstPreviewPack(): UserConfig {
  const pack = previewConfig({ command: "build", mode: "production" }).pack;
  const first = Array.isArray(pack) ? pack[0] : pack;
  if (first === undefined) throw new Error("Missing preview pack configuration");
  return first;
}

function configured(
  inputOptions: UserConfig["inputOptions"],
): NonNullable<UserConfig["inputOptions"]> {
  state.configs = [
    { name: "fixture/client", ...(inputOptions === undefined ? {} : { inputOptions }) },
  ];
  const result = firstPreviewPack()?.inputOptions;
  if (result === undefined) throw new Error("Missing Client input options");
  return result;
}

describe("spreadsheet build resolution", () => {
  it.each(["version", "source"] as const)(
    "refuses a changed pinned engine %s before generating assets",
    async (tamper) => {
      const cwd = dirname(
        fileURLToPath(
          new URL("../packages/client/ui-sidebar-documentpreview/package.json", import.meta.url),
        ),
      );
      state.configs = [{ name: "fixture/client" }];
      const plugins = firstPreviewPack()?.plugins;
      state.tamper = tamper;
      const build = async () => {
        const bundle = await Rolldown.rolldown({
          cwd,
          input: "readonly-asset-fixture",
          plugins: [
            plugins,
            {
              name: "readonly-asset-fixture",
              resolveId(source) {
                return source === "readonly-asset-fixture" ? "\0readonly-asset-fixture" : null;
              },
              load(id) {
                return id === "\0readonly-asset-fixture"
                  ? 'export { scripts } from "luckysheet-preview:assets"'
                  : null;
              },
            },
          ],
        });
        try {
          await bundle.generate({ format: "es" });
        } finally {
          await bundle.close();
        }
      };
      try {
        await expect(build()).rejects.toThrow(
          tamper === "version" ? "requires luckysheet 2.1.13" : "source changed",
        );
      } finally {
        state.tamper = undefined;
      }
    },
  );
  it("retains static input settings and applies browser lookup without creating a callback", () => {
    const result = configured({
      cwd: "/fixture",
      resolve: { extensions: [".fixture"], mainFields: ["custom"] },
    });
    expect(typeof result).toBe("object");
    expect(result).toMatchObject({
      cwd: "/fixture",
      resolve: {
        extensions: [".fixture"],
        mainFields: ["browser", "module", "main"],
        aliasFields: [["browser"]],
      },
    });
  });

  it("forwards all callback arguments and preserves an asynchronous partial result", async () => {
    const customization = vi.fn(async () => ({
      external: ["fixture-lib"],
      resolve: { extensions: [".fixture"] },
    }));
    const result = configured(customization);
    if (typeof result !== "function") throw new Error("Missing input callback");
    const defaults: Rolldown.InputOptions = { cwd: "/fixture" };
    const context = { cjsDts: false };
    const resolved = await result(defaults, "es", context);
    expect(customization).toHaveBeenCalledWith(defaults, "es", context);
    expect(resolved).toMatchObject({
      external: ["fixture-lib"],
      resolve: {
        extensions: [".fixture"],
        mainFields: ["browser", "module", "main"],
        aliasFields: [["browser"]],
      },
    });
    expect(defaults).toEqual({ cwd: "/fixture" });
  });

  it.each([undefined, null])(
    "preserves mutation callbacks returning %s for pack default merging",
    async (returned) => {
      const result = configured((defaults) => {
        defaults.cwd = "/mutated";
        return returned;
      });
      if (typeof result !== "function") throw new Error("Missing input callback");
      const defaults: Rolldown.InputOptions = { cwd: "/fixture" };
      const resolved = await result(defaults, "es", { cjsDts: false });
      expect(defaults.cwd).toBe("/mutated");
      expect(resolved).toMatchObject({ resolve: { mainFields: ["browser", "module", "main"] } });
    },
  );

  it("propagates a rejected customization", async () => {
    const failure = new Error("configuration refused");
    const result = configured(async () => {
      throw failure;
    });
    if (typeof result !== "function") throw new Error("Missing input callback");
    await expect(result({}, "es", { cjsDts: false })).rejects.toBe(failure);
  });

  it("leaves non-Client configurations unchanged", () => {
    const host: UserConfig = { name: "fixture/host", inputOptions: { cwd: "/host" } };
    state.configs = [host];
    expect(firstPreviewPack()).toBe(host);
  });
});
