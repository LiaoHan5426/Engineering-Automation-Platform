/**
 * Candidate rewrites the console can show for a finding — and, just as importantly, the ones it refuses
 * to invent.
 *
 * The runtime never rewrites SQL. A finding carries evidence and a semantics-preserving *suggestion*, and
 * that is all; there is no endpoint that transforms a statement. So a before/after diff can only ever be a
 * candidate the console renders for reading. It is never executed, never sent to the runtime, and never
 * replaces the operator's input.
 *
 * That reference makes the scope of the table narrow on purpose. A rewrite is offered only when the change
 * is decidable from the statement alone:
 *
 *   `= NULL` / `<> NULL` → `IS NULL` / `IS NOT NULL`
 *
 * — a purely syntactic correction of a comparison that is always unknown, which cannot make the query
 * *wrong* because it was already not doing what it looks like it does. Everything else needs the schema,
 * the business key or an execution plan, and for those the panel names the missing ingredient instead of
 * rendering a plausible-looking diff. An invented rewrite that silently changes results is the worst
 * possible output of this screen.
 */
export type CandidateRewrite = {
  before: string;
  after: string;
  /** What the rewrite changes, so the operator can check it rather than trust it. */
  note: string;
  /** What the text-level rewrite cannot see. */
  limitation: string;
};

/** The line every diff in this console carries. */
export const CANDIDATE_REWRITE_NOTES = "候选改写只用于对照阅读：运行时不会执行它，也不会替换你输入的 SQL。";

// Two literals rather than one `/g` regex: a global regex keeps `lastIndex` between `.test()` calls, so
// the same object cannot be used to test and then replace.
const NULL_COMPARISON = /([A-Za-z_][\w.$"]*)\s*(?:(=|<>|!=)\s*NULL\b)/i;
const NULL_COMPARISON_ALL = /([A-Za-z_][\w.$"]*)\s*(?:(=|<>|!=)\s*NULL\b)/gi;

function nullComparison(sql: string): CandidateRewrite | null {
  if (!NULL_COMPARISON.test(sql)) return null;
  const after = sql.replace(NULL_COMPARISON_ALL, (match, column: string) =>
    /(<>|!=)\s*NULL/i.test(match) ? `${column} IS NOT NULL` : `${column} IS NULL`,
  );
  return {
    before: sql,
    after,
    note: "与 NULL 的等值比较恒为未知，因此原写法多半一行也查不到；改成 IS [NOT] NULL 是修正而不是优化。",
    limitation:
      "这是文本级替换：它不解析字符串字面量与注释，请人工核对后再用。平台不会执行候选改写。",
  };
}

/** A candidate rewrite for this finding, or `null` when no rewrite is decidable from the statement. */
export function candidateRewrite(code: string, sql: string): CandidateRewrite | null {
  if (!sql.trim()) return null;
  if (code === "predicate.null_comparison") return nullComparison(sql);
  return null;
}

/** Why no candidate rewrite is offered — never the same as "there is nothing to fix". */
const REASONS: Record<string, string> = {
  "projection.select_star":
    "把 * 展开成具体列需要表结构；平台只读取你登记的脱敏快照，而快照可能与线上不一致，所以不做自动展开。",
  "query.limit_without_order": "补一个稳定的排序键需要知道业务上的唯一键，平台无法从语句推断。",
  "pagination.offset": "改成键集分页需要知道排序键与游标语义，只改文本会改变返回结果。",
  "predicate.like.leading_wildcard":
    "前导通配符没有等价的语法改写：要改的是索引或查询形态（范围查询 / 全文检索）。",
  "predicate.function_on_column": "把函数从列上移开需要知道函数与列之间的可逆关系，无法保证语义保持。",
  "predicate.in_subquery": "子查询能否安全改写成 JOIN 取决于去重语义，需要执行计划核实。",
  "join.cartesian": "补关联条件需要知道业务关系；猜错的连接条件比笛卡尔积更危险。",
  "query.no_filter": "补过滤条件属于业务决定，平台不会替你决定应该返回哪些行。",
  "query.distinct": "去掉 DISTINCT 是否安全取决于连接是否真的产生重复行，需要计划或数据验证。",
  "order_by.expression": "改排序键会改变返回顺序，不属于语义保持的改写。",
};

const DEFAULT_REASON = "该发现需要业务或结构上下文，文本级改写无法保证语义保持，因此控制台不提供候选改写。";

export function rewriteUnavailable(code: string): string {
  return REASONS[code] ?? DEFAULT_REASON;
}
