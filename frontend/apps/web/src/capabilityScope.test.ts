import { describe, expect, it } from "vite-plus/test";
import {
  isExpertScoped,
  isGloballySelectable,
  selectableNodes,
  undeclaredScopedNodes,
  unknownDeclaredTools,
  type CapabilityLike,
} from "./capabilityScope";

const SCOPED = "mcp.registrydb.query";
const items: CapabilityLike[] = [
  { name: "sql.parse", kind: "command", scope: "platform", expertScoped: false },
  { name: "rg-search", kind: "cli", scope: "platform", expertScoped: false },
  { name: SCOPED, kind: "mcp", scope: "expert", expertScoped: true },
];

describe("capability scope rules", () => {
  it("treats an MCP tool as expert-scoped and a platform command as not", () => {
    expect(isExpertScoped(SCOPED, items, [SCOPED])).toBe(true);
    expect(isExpertScoped("sql.parse", items, [SCOPED])).toBe(false);
    // The id namespace carries the scope, so an unpublished MCP tool is never treated as a platform node.
    expect(isExpertScoped("mcp.other.query", items, [])).toBe(true);
  });

  it("never offers an expert-scoped capability as an ordinary node", () => {
    expect(items.filter(isGloballySelectable).map((item) => item.name)).toEqual(["sql.parse", "rg-search"]);
    const selectable = selectableNodes(items, [SCOPED]).map((item) => item.name);
    expect(selectable).toContain(SCOPED);
    expect(selectable.indexOf(SCOPED)).toBeGreaterThan(selectable.indexOf("sql.parse"));
    expect(selectableNodes(items, []).map((item) => item.name)).not.toContain(SCOPED);
  });

  it("reports a node that uses an expert-scoped capability without declaring it", () => {
    const steps = [
      { id: "parse", capability: "sql.parse" },
      { id: "query", capability: SCOPED },
    ];
    expect(undeclaredScopedNodes(steps, [], items, [SCOPED]).map((step) => step.id)).toEqual(["query"]);
    expect(undeclaredScopedNodes(steps, [SCOPED], items, [SCOPED])).toEqual([]);
  });

  it("reports a declared tool the platform does not publish", () => {
    expect(unknownDeclaredTools([SCOPED], [SCOPED])).toEqual([]);
    expect(unknownDeclaredTools(["mcp.unknown.query"], [SCOPED])).toEqual(["mcp.unknown.query"]);
  });
});
