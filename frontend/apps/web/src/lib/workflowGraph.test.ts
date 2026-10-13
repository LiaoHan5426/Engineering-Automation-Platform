import { describe, expect, it } from "vite-plus/test";
import { inspectGraph } from "./workflowGraph";

const nodes = ["last-name", "first-name", "middle-name"].map((id) => ({
  id,
  capability: "sql.parse",
  required: true,
}));
describe("explicit workflow dependencies", () => {
  it("orders by edges rather than names or array order", () => {
    const result = inspectGraph(nodes, [
      { source: "first-name", target: "middle-name" },
      { source: "middle-name", target: "last-name" },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.ordered.map((node) => node.id)).toEqual([
      "first-name",
      "middle-name",
      "last-name",
    ]);
    expect(result.levels.get("last-name")).toBe(2);
  });
  it("rejects disconnected graphs", () => {
    expect(inspectGraph(nodes, []).errors.join()).toContain("入口");
  });
  it("rejects cycles", () => {
    expect(
      inspectGraph(nodes, [
        { source: "first-name", target: "middle-name" },
        { source: "middle-name", target: "first-name" },
      ]).errors,
    ).toContain("流程存在循环连线");
  });
  it("supports branches and joins", () => {
    const branch = [...nodes, { id: "join", capability: "sql.parse", required: true }];
    const result = inspectGraph(branch, [
      { source: "first-name", target: "middle-name" },
      { source: "first-name", target: "last-name" },
      { source: "middle-name", target: "join" },
      { source: "last-name", target: "join" },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.levels.get("join")).toBe(2);
  });
  it("rejects missing endpoints and duplicate edges", () => {
    expect(
      inspectGraph(nodes, [{ source: "missing", target: "first-name" }]).errors.join(),
    ).toContain("不存在");
    const edge = { source: "first-name", target: "middle-name" };
    expect(inspectGraph(nodes, [edge, edge]).errors).toContain("存在重复连线");
  });
});
