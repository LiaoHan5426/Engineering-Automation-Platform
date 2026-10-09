package com.lh.eap.rules;

import java.util.*;

/**
 * The fact vocabulary a rule pack is allowed to reference.
 *
 * <p>This is the contract between code and configuration: the capabilities listed here publish exactly
 * these facts, rule packs may only reference facts listed here, and the console renders rule editors
 * from this list.
 *
 * <p><b>Every fact declares the capability that produces it.</b> That is what makes capability
 * requirements derivable instead of guessed: a rule that reads {@code plan.seqScan} can only fire when
 * {@code database.explain} ran, so a rule pack referencing it needs that capability, and an expert
 * referencing that pack must contain the matching node. Without this link a rule would silently never
 * fire — the failure mode this contract exists to prevent.
 *
 * <p>{@link SqlFactExtractor} still owns the SQL half; the other producers are capability handlers.
 * Publishing a fact outside this list is rejected by {@link com.lh.eap.web.CapabilityContext#publish},
 * and tests assert both directions of the contract.
 */
public final class SqlFactVocabulary {
    public static final Set<String> OPERATORS = Set.of(
            "eq", "ne", "gt", "gte", "lt", "lte", "in", "contains", "exists", "absent", "matches");

    /** Capability ids that publish facts. Kept in sync with {@code ExpertGraph.CAPABILITIES} by test. */
    public static final String SQL_PARSE = "sql.parse";
    public static final String KNOWLEDGE_SEARCH = "knowledge.search";
    public static final String DATABASE_SCHEMA_READ = "database.schema.read";
    public static final String DATABASE_INDEX_READ = "database.index.read";
    public static final String DATABASE_EXPLAIN = "database.explain";

    public record Fact(String key, String type, String group, String description, String producedBy) { }

    public static final List<Fact> FACTS = List.of(
            new Fact("parse.status", "string", "解析", "valid 表示语句已成功解析，invalid 表示语法无法识别", SQL_PARSE),
            new Fact("statement.type", "string", "解析", "SELECT / UPDATE / DELETE / INSERT / UNION / OTHER", SQL_PARSE),
            new Fact("statement.classified", "boolean", "解析", "是否为平台已识别的语句类型", SQL_PARSE),

            new Fact("select.allColumns", "boolean", "投影", "投影中包含 * 或 表.* 通配符", SQL_PARSE),
            new Fact("select.distinct", "boolean", "结构", "查询使用 DISTINCT 去重", SQL_PARSE),
            new Fact("select.hasWhere", "boolean", "过滤", "查询存在 WHERE 条件", SQL_PARSE),
            new Fact("select.noWhere", "boolean", "过滤", "查询缺少 WHERE 条件", SQL_PARSE),
            new Fact("select.hasOrderBy", "boolean", "分页", "查询存在 ORDER BY", SQL_PARSE),
            new Fact("select.limit", "boolean", "分页", "查询存在 LIMIT", SQL_PARSE),
            new Fact("select.offset", "boolean", "分页", "查询存在 OFFSET", SQL_PARSE),
            new Fact("select.deepOffset", "boolean", "分页", "OFFSET 偏移量达到四位及以上", SQL_PARSE),
            new Fact("select.orderByExpression", "boolean", "排序", "ORDER BY 使用函数或显式转型", SQL_PARSE),

            new Fact("join.count", "number", "连接", "显式连接的个数", SQL_PARSE),
            new Fact("join.cartesian", "boolean", "连接", "存在没有关联条件的连接或 CROSS JOIN", SQL_PARSE),
            new Fact("join.cartesianCount", "number", "连接", "无关联条件连接的数量", SQL_PARSE),
            new Fact("join.columnCount", "number", "连接", "可定位到具体表的等值关联列数量", SQL_PARSE),

            new Fact("table.count", "number", "结构", "语句涉及的表数量", SQL_PARSE),
            new Fact("table.list", "string", "结构", "语句涉及的表名，以顿号分隔", SQL_PARSE),

            new Fact("set.unionCount", "number", "结构", "UNION / UNION ALL 的分支数量", SQL_PARSE),

            new Fact("dml.kind", "string", "写入", "UPDATE 或 DELETE", SQL_PARSE),
            new Fact("dml.noFilter", "boolean", "写入", "写入语句缺少 WHERE 条件", SQL_PARSE),

            new Fact("predicate.or", "boolean", "谓词", "条件中出现 OR", SQL_PARSE),
            new Fact("predicate.not", "boolean", "谓词", "条件中出现 NOT 否定", SQL_PARSE),
            new Fact("predicate.leadingWildcardLike", "boolean", "谓词", "LIKE 以前导通配符 % 开头", SQL_PARSE),
            new Fact("predicate.inSubquery", "boolean", "谓词", "IN 使用子查询", SQL_PARSE),
            new Fact("predicate.subquery", "boolean", "谓词", "条件中包含子查询", SQL_PARSE),
            new Fact("predicate.nullComparison", "boolean", "谓词", "使用 = NULL 或 <> NULL", SQL_PARSE),
            new Fact("predicate.functionOnColumn", "string", "谓词", "包裹列的函数名（存在即表示命中了非 sargable 写法）", SQL_PARSE),
            new Fact("predicate.explicitCast", "boolean", "谓词", "条件中对表达式显式转型", SQL_PARSE),

            new Fact("metric.joinCount", "number", "度量", "连接数量，用于复杂度计算", SQL_PARSE),
            new Fact("metric.functionCount", "number", "度量", "投影中的函数数量", SQL_PARSE),
            new Fact("metric.subqueryCount", "number", "度量", "子查询数量", SQL_PARSE),
            new Fact("metric.unionCount", "number", "度量", "集合运算分支数量", SQL_PARSE),

            new Fact("knowledge.granted", "boolean", "知识", "该专家是否获得知识库读取授权", KNOWLEDGE_SEARCH),
            new Fact("knowledge.matches", "number", "知识", "本次检索命中的授权知识条数", KNOWLEDGE_SEARCH),

            new Fact("schema.loaded", "boolean", "表结构快照", "是否成功读取到授权数据库资料的表结构快照", DATABASE_SCHEMA_READ),
            new Fact("schema.tableCount", "number", "表结构快照", "快照中登记的表数量", DATABASE_SCHEMA_READ),
            new Fact("schema.unresolvedColumn", "string", "表结构快照", "快照中无法唯一确定的关联列，格式 表.列", DATABASE_SCHEMA_READ),
            new Fact("schema.typeMismatch", "string", "表结构快照", "快照显示类型不一致的关联条件", DATABASE_SCHEMA_READ),

            new Fact("index.loaded", "boolean", "索引快照", "是否成功读取到授权数据库资料的索引快照", DATABASE_INDEX_READ),
            new Fact("index.count", "number", "索引快照", "快照中登记的索引数量", DATABASE_INDEX_READ),
            new Fact("index.uncoveredJoinColumn", "string", "索引快照", "快照中无以该列为前导列的索引，格式 表.列", DATABASE_INDEX_READ),
            new Fact("index.leadingColumnMatch", "boolean", "索引快照", "所有关联列都能在快照中找到前导列匹配的索引", DATABASE_INDEX_READ),

            new Fact("plan.loaded", "boolean", "执行计划", "是否成功读取到用户提供的 EXPLAIN JSON 快照", DATABASE_EXPLAIN),
            new Fact("plan.seqScan", "boolean", "执行计划", "计划快照中存在顺序扫描节点", DATABASE_EXPLAIN),
            new Fact("plan.filteredSeqScan", "boolean", "执行计划", "顺序扫描节点带有过滤条件", DATABASE_EXPLAIN),
            new Fact("plan.nodeTypes", "string", "执行计划", "计划快照中出现的节点类型，去重后以顿号分隔", DATABASE_EXPLAIN),
            new Fact("plan.nodeCount", "number", "执行计划", "计划快照中的节点数量", DATABASE_EXPLAIN));

    private static final Map<String, Fact> BY_KEY = FACTS.stream()
            .collect(java.util.stream.Collectors.toMap(Fact::key, fact -> fact, (a, b) -> a, LinkedHashMap::new));

    public static final Map<String, Fact> FACTS_BY_KEY = Map.copyOf(BY_KEY);

    /** Every fact the given capabilities can publish, in declaration order. */
    public static List<Fact> factsOf(String capability) {
        return FACTS.stream().filter(fact -> Objects.equals(fact.producedBy(), capability)).toList();
    }

    /** All capability ids that appear as a fact producer. */
    public static Set<String> producers() {
        var result = new LinkedHashSet<String>();
        for (var fact : FACTS) result.add(fact.producedBy());
        return result;
    }

    /**
     * The capabilities a rule pack needs in order to actually fire, derived from the facts its rules
     * reference. This is the value a pack must declare in {@code requires.capabilities} — derived here
     * rather than demanded from the author so the two can be compared instead of both being guessed.
     */
    public static Set<String> producersOf(Collection<String> factKeys) {
        var result = new TreeSet<String>();
        if (factKeys == null) return result;
        for (var key : factKeys) {
            var fact = FACTS_BY_KEY.get(key);
            if (fact != null) result.add(fact.producedBy());
        }
        return result;
    }

    private SqlFactVocabulary() { }
}
