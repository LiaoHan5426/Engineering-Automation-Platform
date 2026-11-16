import type { Rolldown, UserConfig } from "tsdown";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ configs: [] as UserConfig[] }));
vi.mock("../packages/client/tsdown.client.ts", () => ({ clientBundle: () => () => state.configs }));
import previewConfig from "../packages/client/ui-sidebar-documentpreview/tsdown.config.ts";

function configured(
  inputOptions: UserConfig["inputOptions"],
): NonNullable<UserConfig["inputOptions"]> {
  state.configs = [
    { name: "fixture/client", ...(inputOptions === undefined ? {} : { inputOptions }) },
  ];
  const result = previewConfig({ env: {} })[0]?.inputOptions;
  if (result === undefined) throw new Error("Missing Client input options");
  return result;
}

describe("spreadsheet build resolution", () => {
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
    "preserves mutation callbacks returning %s for tsdown default merging",
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
    expect(previewConfig({ env: {} })[0]).toBe(host);
  });
});
