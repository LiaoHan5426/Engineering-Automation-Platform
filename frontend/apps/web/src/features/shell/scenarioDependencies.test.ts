import { describe, expect, it } from "vite-plus/test";
import { pendingScenarioDependencies, resolveDeliveryDependencies } from "./scenarioDependencies";

describe("resolveDeliveryDependencies", () => {
  it('does not present an already authorized root as missing in the welcome or composer', () => {
    const deps = [{ name: '本地服务进程绑定根', state: 'unconfigured' as const, where: '' }, { name: '授权仓库读取', state: 'missing' as const, where: '' }, { name: '生成前文件快照', state: 'missing' as const, where: '' }];
    expect(pendingScenarioDependencies(deps, true)).toEqual(['生成前文件快照']);
    expect(pendingScenarioDependencies(deps, false)).toHaveLength(3);
  });
  const template = [
    { name: "Builder 原型编辑", state: "installed" as const, where: "design" },
    { name: "本机仓库授权", state: "unconfigured" as const, where: "stale" },
    { name: "生成前文件快照", state: "missing" as const, where: "stale" },
  ];

  it("marks colocated bind and baseline when the local service is ready", () => {
    const rows = resolveDeliveryDependencies(template, { processBound: true, baselineReady: true });
    expect(rows[1]).toMatchObject({ name: "本地服务进程绑定根", state: "installed" });
    expect(rows[2]).toMatchObject({ name: "生成前文件快照", state: "installed" });
    expect(rows[0].state).toBe("installed");
  });

  it("keeps bind unconfigured and baseline unsettled without a process root", () => {
    const rows = resolveDeliveryDependencies(template, { processBound: false, baselineReady: false });
    expect(rows[1].state).toBe("unconfigured");
    expect(rows[2].state).toBe("unconfigured");
  });

  it("shows baseline missing when bound but hash is not ready", () => {
    const rows = resolveDeliveryDependencies(template, { processBound: true, baselineReady: false });
    expect(rows[1].state).toBe("installed");
    expect(rows[2].state).toBe("missing");
  });
});
