export const PLAN_LIMIT = "仅提供计划，不执行工具或写入文件。";

export function outgoingInstructions(parts: { instructions: string; scene: string; guidance: string; plan: boolean }) {
  const joined = [...new Set([parts.instructions, parts.scene, parts.guidance].filter(Boolean))].join("\n");
  return parts.plan ? `${joined}\n${PLAN_LIMIT}` : joined;
}
