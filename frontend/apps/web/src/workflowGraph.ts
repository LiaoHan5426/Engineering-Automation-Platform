export type WorkflowNode = {
  id: string;
  label?: string;
  capability: string;
  required: boolean;
  x?: number;
  y?: number;
};
export type WorkflowEdge = { source: string; target: string };

// Identity and array order never define execution dependencies.
export function inspectGraph(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
  const ids = new Set(nodes.map((node) => node.id));
  const errors: string[] = [];
  if (!nodes.length) errors.push("请添加至少一个节点");
  if (ids.size !== nodes.length || nodes.some((node) => !node.id || !node.capability))
    errors.push("节点标识必须唯一，能力不能为空");
  const pairs = new Set<string>();
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) errors.push("连线引用了不存在的节点");
    if (edge.source === edge.target) errors.push("节点不能连接自身");
    const key = JSON.stringify([edge.source, edge.target]);
    if (pairs.has(key)) errors.push("存在重复连线");
    pairs.add(key);
  }
  const pending = new Set(ids);
  const ordered: WorkflowNode[] = [];
  const levels = new Map<string, number>();
  while (pending.size) {
    const ready = nodes.filter(
      (node) =>
        pending.has(node.id) &&
        !edges.some((edge) => edge.target === node.id && pending.has(edge.source)),
    );
    if (!ready.length) {
      errors.push("流程存在循环连线");
      break;
    }
    for (const node of ready) {
      const parents = edges.filter((edge) => edge.target === node.id);
      levels.set(
        node.id,
        parents.length ? Math.max(...parents.map((edge) => levels.get(edge.source) ?? 0)) + 1 : 0,
      );
      ordered.push(node);
      pending.delete(node.id);
    }
  }
  if (
    nodes.length > 1 &&
    nodes.filter((node) => !edges.some((edge) => edge.target === node.id)).length !== 1
  )
    errors.push("流程必须有一个入口；请连接断开的节点");
  return { errors: [...new Set(errors)], ordered, levels };
}
