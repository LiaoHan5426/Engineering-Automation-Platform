/**
 * Scope rules for capabilities, shared by the console and the expert editor.
 *
 * <p>An MCP tool is never a platform capability. The backend enforces that (a node may only use one if
 * the expert declared it, and the call runs in that expert's own session), but the editor has to *show*
 * the difference too — otherwise an operator wires a node they cannot run, or assumes that registering a
 * server with the platform handed it to every expert.
 */
export type CapabilityLike = {
  name: string;
  kind?: string;
  scope?: string;
  expertScoped?: boolean;
  title?: string;
};

/** True when only an expert that declared this capability may run it. */
export function isExpertScoped(
  capability: string,
  items: CapabilityLike[] = [],
  vocabulary: string[] = [],
): boolean {
  // The id namespace carries the scope: `mcp.<server>.<tool>` is expert-scoped even when the platform
  // does not publish it yet, which is exactly the case the editor must not present as runnable.
  if (capability.startsWith("mcp.")) return true;
  if (vocabulary.includes(capability)) return true;
  const item = items.find((entry) => entry.name === capability);
  return item?.expertScoped === true || item?.scope === "expert";
}

/** Whether the editor may offer this capability as an ordinary platform node. */
export function isGloballySelectable(item: CapabilityLike): boolean {
  return !(item.expertScoped === true || item.scope === "expert");
}

/**
 * Nodes that use an expert-scoped capability this expert has not declared. The backend rejects the
 * manifest; catching it here is what turns "save failed" into "tick the tool you need".
 */
export function undeclaredScopedNodes<T extends { id: string; capability: string }>(
  steps: T[],
  declared: string[],
  items: CapabilityLike[] = [],
  vocabulary: string[] = [],
): T[] {
  return steps.filter(
    (step) => isExpertScoped(step.capability, items, vocabulary) && !declared.includes(step.capability),
  );
}

/** Declared tools the platform does not publish: a manifest cannot bring a server into existence. */
export function unknownDeclaredTools(declared: string[], vocabulary: string[] = []): string[] {
  return declared.filter((tool) => !vocabulary.includes(tool));
}

/**
 * The capabilities selectable as nodes: platform capabilities, plus the expert-scoped ones this expert
 * declared. Order is preserved so the picker stays stable while editing.
 */
export function selectableNodes(items: CapabilityLike[], declared: string[] = []): CapabilityLike[] {
  const platform = items.filter(isGloballySelectable);
  const scoped = declared
    .map((name) => items.find((item) => item.name === name) ?? ({ name, scope: "expert", expertScoped: true } as CapabilityLike))
    .filter((item) => !platform.some((entry) => entry.name === item.name));
  return [...platform, ...scoped];
}
