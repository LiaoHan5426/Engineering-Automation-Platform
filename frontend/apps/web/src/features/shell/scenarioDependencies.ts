/**
 * Live dependency rows for delivery scenes.
 * Static workbench presets are templates; colocated bind and baseline override honesty.
 */

export type ScenarioDependency = {
  name: string;
  state: "installed" | "missing" | "unconfigured" | "denied";
  where: string;
};

export type DeliveryDependencyInput = {
  processBound: boolean;
  baselineReady: boolean;
  /** When false, baseline is still loading — do not claim missing yet. */
  prepSettled?: boolean;
};

const BIND_NAMES = new Set(["本机仓库授权", "本地服务进程绑定根"]);
const BASELINE_NAMES = new Set(["生成前文件快照"]);

/** A preset is not runtime evidence. Welcome/composer do not own baseline probes. */
export function pendingScenarioDependencies(deps: ScenarioDependency[], processBound: boolean): string[] {
  return deps.filter(item => item.state !== 'installed' && !(processBound && (BIND_NAMES.has(item.name) || item.name === '授权仓库读取'))).map(item => item.name);
}

export function resolveDeliveryDependencies(
  deps: ScenarioDependency[],
  input: DeliveryDependencyInput,
): ScenarioDependency[] {
  return deps.map((item) => {
    if (BIND_NAMES.has(item.name)) {
      return {
        name: "本地服务进程绑定根",
        state: input.processBound ? "installed" : "unconfigured",
        where: input.processBound
          ? "本页开发准备。本地服务已绑定进程工作区根；浏览器路径仍不是写权限。"
          : "本页开发准备。空配置时 colocated 应绑定检测工作区；未绑定时不能代持远端授权库。",
      };
    }
    if (BASELINE_NAMES.has(item.name)) {
      if (input.baselineReady) {
        return {
          name: item.name,
          state: "installed",
          where: "本页开发准备。基线哈希已从本地服务读取。",
        };
      }
      if (input.prepSettled === false) {
        return {
          name: item.name,
          state: "unconfigured",
          where: "本页开发准备。准备状态加载中，基线尚未判定。",
        };
      }
      return {
        name: item.name,
        state: input.processBound ? "missing" : "unconfigured",
        where: input.processBound
          ? "本页开发准备。进程已绑定，但目标文件基线仍未知或拒绝。"
          : "本页开发准备的基线哈希，当前为未知。",
      };
    }
    return item;
  });
}
