import { describe, expect, it } from "vite-plus/test";
import { candidateRewrite, rewriteUnavailable } from "./rewrites";

const SQL =
  "SELECT id FROM orders o JOIN customer c ON o.customer_id = c.id WHERE o.deleted_at = NULL";

describe("candidate rewrites are offered only where the change is decidable", () => {
  it("corrects a NULL equality comparison, which the statement alone decides", () => {
    const candidate = candidateRewrite("predicate.null_comparison", SQL);
    expect(candidate).not.toBeNull();
    expect(candidate!.before).toBe(SQL);
    expect(candidate!.after).toContain("o.deleted_at IS NULL");
    // 其余部分必须逐字保持，改写不得顺手重排语句。
    expect(candidate!.after).toContain(
      "SELECT id FROM orders o JOIN customer c ON o.customer_id = c.id",
    );
    expect(candidate!.limitation).toContain("不会执行");
  });

  it("maps negation to IS NOT NULL", () => {
    const candidate = candidateRewrite(
      "predicate.null_comparison",
      "SELECT 1 FROM t WHERE a <> NULL",
    );
    expect(candidate!.after).toBe("SELECT 1 FROM t WHERE a IS NOT NULL");
  });

  it("is stable across repeated calls", () => {
    // A /g regex reused for test-then-replace would flip results on the second call.
    const first = candidateRewrite("predicate.null_comparison", SQL);
    const second = candidateRewrite("predicate.null_comparison", SQL);
    expect(second!.after).toBe(first!.after);
  });

  it("invents nothing when the change needs the schema or a business key", () => {
    expect(candidateRewrite("projection.select_star", "SELECT * FROM t")).toBeNull();
    expect(candidateRewrite("query.limit_without_order", "SELECT a FROM t LIMIT 10")).toBeNull();
    // "no candidate" must never read as "nothing to fix".
    expect(rewriteUnavailable("projection.select_star")).toContain("表结构");
    expect(rewriteUnavailable("query.limit_without_order")).toContain("唯一键");
  });

  it("explains an unknown finding instead of rendering an empty diff", () => {
    expect(candidateRewrite("something.new", SQL)).toBeNull();
    expect(rewriteUnavailable("something.new")).toContain("不提供候选改写");
  });

  it("offers nothing when there is no statement to rewrite", () => {
    expect(candidateRewrite("predicate.null_comparison", "   ")).toBeNull();
  });
});
