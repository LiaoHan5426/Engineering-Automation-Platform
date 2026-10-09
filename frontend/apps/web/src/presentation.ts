import axios from "axios";
export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    const detail = typeof data === "string" ? data : (data?.detail ?? data?.message ?? data?.error);
    if (typeof detail === "string" && detail.trim()) return detail;
    if (error.code === "ECONNABORTED") return "请求超时，请检查后端日志后重试。";
    if (!error.response) return "无法连接服务，请检查后端地址、服务状态和跨域配置。";
    return `请求失败（HTTP ${error.response.status}），请重试或查看后端日志。`;
  }
  return error instanceof Error ? error.message : "操作失败，请重试。";
}
export function statusLabel(status: string): string {
  return (
    (
      {
        completed: "已完成",
        failed: "执行失败",
        "needs-planning": "待规划",
        accepted: "已接受",
        rejected: "未通过",
        "needs-review": "待审查",
        "deterministic-analyzed": "本地分析已返回",
        "local-model-required": "本地分析 / 模型增强不可用",
        partial: "分析已返回 · 待补充验证",
        succeeded: "已通过",
        blocked: "依赖阻塞",
        "needs-context": "缺少上下文",
        "deterministic-workflow": "确定性流程",
        "deterministic-with-unverified-model-observation": "确定性流程 + 待验证模型观察",
        enhance: "调用模型",
        skip: "跳过模型",
        skipped: "已跳过",
        unavailable: "不可用",
        "unverified-observation": "已调用（待验证）",
      } as Record<string, string>
    )[status] ?? status
  );
}
