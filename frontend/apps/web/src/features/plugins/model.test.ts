import { describe, expect, it } from "vite-plus/test";
import {
  GRANTS,
  INSTALLATION_KEY,
  enabledHashes,
  instanceKey,
  isKnownHash,
  isShellPage,
  memoryStore,
  readBuilder,
  readInstallation,
  writeBuilder,
  writeInstallation,
} from "./model";

describe("plugin prototype store", () => {
  it("keeps shell hashes and gives the two builders different storage keys", () => {
    expect(isShellPage("sql")).toBe(true);
    expect(isShellPage("capabilities")).toBe(true);
    expect(isShellPage("chat")).toBe(false);
    expect(isKnownHash("plugins")).toBe(true);
    expect(isKnownHash("builder-alpha")).toBe(true);
    const alpha = instanceKey("builder", "alpha");
    const beta = instanceKey("builder", "beta");
    expect(alpha).not.toBe(beta);
    expect(alpha.startsWith("eap.console.")).toBe(false);
    expect(INSTALLATION_KEY.startsWith("eap.console.")).toBe(false);
  });

  it("saves each builder instance without copying the other", () => {
    const store = memoryStore();
    const alpha = readBuilder(store, "alpha");
    const beta = readBuilder(store, "beta");
    alpha.draftTitle = "结算已改";
    alpha.buttonPresses = 2;
    alpha.mockRepositoryLabel = "模拟 · ledger-edited";
    writeBuilder(store, alpha);
    beta.draftBody = "目录正文";
    writeBuilder(store, beta);

    expect(readBuilder(store, "alpha").draftTitle).toBe("结算已改");
    expect(readBuilder(store, "alpha").buttonPresses).toBe(2);
    expect(readBuilder(store, "beta").draftTitle).toBe("目录页");
    expect(readBuilder(store, "beta").draftBody).toBe("目录正文");
    expect(readBuilder(store, "alpha").mockRepositoryLabel).not.toBe(readBuilder(store, "beta").mockRepositoryLabel);
  });

  it("hides navigation on disable and restores the same draft on enable", () => {
    const store = memoryStore();
    const alpha = readBuilder(store, "alpha");
    alpha.draftTitle = "保留";
    alpha.mockApproval = "simulated";
    writeBuilder(store, alpha);
    writeInstallation(store, { enabled: { chat: true, builder: false } });

    expect(enabledHashes(readInstallation(store))).not.toContain("builder-alpha");
    expect(readBuilder(store, "alpha").draftTitle).toBe("保留");
    expect(readBuilder(store, "alpha").mockApproval).toBe("simulated");

    writeInstallation(store, { enabled: { chat: false, builder: true } });
    expect(enabledHashes(readInstallation(store))).toEqual(["builder-alpha", "builder-beta"]);
    expect(readBuilder(store, "alpha").draftTitle).toBe("保留");
    expect(GRANTS).toEqual([]);
  });
});
