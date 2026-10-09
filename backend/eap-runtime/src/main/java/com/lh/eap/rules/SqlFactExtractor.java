package com.lh.eap.rules;

import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import net.sf.jsqlparser.statement.Statement;
import net.sf.jsqlparser.statement.delete.Delete;
import net.sf.jsqlparser.statement.insert.Insert;
import net.sf.jsqlparser.statement.update.Update;
import net.sf.jsqlparser.statement.select.*;
import net.sf.jsqlparser.expression.*;
import net.sf.jsqlparser.expression.operators.relational.*;
import net.sf.jsqlparser.expression.operators.conditional.*;
import net.sf.jsqlparser.schema.Column;
import net.sf.jsqlparser.schema.Table;
import java.util.*;

/**
 * Structural fact extractor.
 *
 * <p>This class is deliberately <em>rule-free</em>. It parses a statement and reports what is
 * structurally true about it — never what is wrong with it. All judgement (severity, wording,
 * recommendation) belongs to the declarative rule packs interpreted by {@link RuleEngine}.
 *
 * <p>Consequences of this split:
 * <ul>
 *   <li>Adding a new anti-pattern check is a JSON edit, not a code change.</li>
 *   <li>The vocabulary below is the contract the rule packs are written against, so it is
 *       documented by {@link SqlFactVocabulary} and validated by tests.</li>
 *   <li>The extractor never executes SQL, never connects to a database and never invents schema facts.</li>
 * </ul>
 */
public final class SqlFactExtractor {

    public record Extraction(String parseStatus, String statementType, String normalizedSql, String error,
                             Map<String, Object> facts, List<String> tables, List<String> joinKeys,
                             List<Map<String, String>> joinColumns, List<String> joinKeyAdvice) { }

    private SqlFactExtractor() { }

    public static Extraction extract(String sql) {
        var state = new State();
        try {
            var statement = CCJSqlParserUtil.parse(sql);
            state.statementType = kindOf(statement);
            state.normalized = statement.toString();
            state.facts.put("parse.status", "valid");
            state.facts.put("statement.type", state.statementType);
            state.facts.put("statement.classified", !"OTHER".equals(state.statementType));
            inspect(statement, state);
        } catch (Exception error) {
            state.statementType = "OTHER";
            state.normalized = "";
            state.facts.clear();
            state.facts.put("parse.status", "invalid");
            state.facts.put("statement.type", "OTHER");
            state.facts.put("statement.classified", false);
        }
        return state.extraction();
    }

    private static String kindOf(Statement statement) {
        if (statement instanceof PlainSelect) return "SELECT";
        if (statement instanceof SetOperationList) return "UNION";
        if (statement instanceof Update) return "UPDATE";
        if (statement instanceof Delete) return "DELETE";
        if (statement instanceof Insert) return "INSERT";
        return "OTHER";
    }

    private static void inspect(Statement statement, State state) {
        if (statement instanceof PlainSelect select) {
            inspectSelect(select, state);
        } else if (statement instanceof SetOperationList set) {
            state.unions = set.getSelects() == null ? 0 : set.getSelects().size();
            state.facts.put("set.unionCount", state.unions);
            if (set.getSelects() != null) {
                for (var part : set.getSelects()) if (part instanceof PlainSelect plain) inspectSelect(plain, state);
            }
        } else if (statement instanceof Update update) {
            state.facts.put("dml.kind", "UPDATE");
            state.facts.put("dml.noFilter", update.getWhere() == null);
        } else if (statement instanceof Delete delete) {
            state.facts.put("dml.kind", "DELETE");
            state.facts.put("dml.noFilter", delete.getWhere() == null);
        }
    }

    private static void inspectSelect(PlainSelect select, State state) {
        var aliases = new LinkedHashMap<String, String>();
        if (select.getFromItem() instanceof Table table) {
            state.tables.add(table.getFullyQualifiedName());
            alias(table, aliases);
        }

        state.joins += select.getJoins() == null ? 0 : select.getJoins().size();

        boolean star = false;
        if (select.getSelectItems() != null) {
            for (var item : select.getSelectItems()) {
                var expression = item.getExpression();
                if (expression instanceof AllColumns || expression instanceof AllTableColumns) star = true;
                if (expression instanceof Function) state.functions++;
            }
        }
        mergeFlag(state.facts, "select.allColumns", star);
        if (select.getJoins() != null) {
            for (var join : select.getJoins()) {
                if (join.getRightItem() instanceof Table table) {
                    state.tables.add(table.getFullyQualifiedName());
                    alias(table, aliases);
                }
                var onExpressions = join.getOnExpressions();
                boolean hasCondition = (onExpressions != null && !onExpressions.isEmpty())
                        || (join.getUsingColumns() != null && !join.getUsingColumns().isEmpty())
                        || join.isNatural();
                if (join.isCross() || !hasCondition) {
                    state.cartesian++;
                } else if (onExpressions != null) {
                    for (var on : onExpressions) collectKeys(on, state, aliases);
                }
            }
        }
        state.facts.put("join.cartesian", state.cartesian > 0);
        state.facts.put("join.cartesianCount", state.cartesian);

        boolean hasWhere = select.getWhere() != null;
        mergeFlag(state.facts, "select.hasWhere", hasWhere);
        if (hasWhere) walk(select.getWhere(), state, aliases);

        mergeFlag(state.facts, "select.distinct", select.getDistinct() != null);

        var orderBy = select.getOrderByElements();
        boolean hasOrder = orderBy != null && !orderBy.isEmpty();
        mergeFlag(state.facts, "select.hasOrderBy", hasOrder);
        mergeFlag(state.facts, "select.limit", select.getLimit() != null);
        mergeFlag(state.facts, "select.offset", select.getOffset() != null);
        if (select.getOffset() != null) {
            mergeFlag(state.facts, "select.deepOffset", String.valueOf(select.getOffset()).matches(".*\\d{4,}.*"));
        }
        if (hasOrder) {
            for (var element : orderBy) {
                if (element.getExpression() instanceof Function || element.getExpression() instanceof CastExpression) {
                    mergeFlag(state.facts, "select.orderByExpression", true);
                    break;
                }
            }
        }
    }

    private static void walk(Expression expression, State state, Map<String, String> aliases) {
        if (expression == null) return;
        if (expression instanceof AndExpression and) {
            walk(and.getLeftExpression(), state, aliases);
            walk(and.getRightExpression(), state, aliases);
            return;
        }
        if (expression instanceof OrExpression or) {
            mergeFlag(state.facts, "predicate.or", true);
            walk(or.getLeftExpression(), state, aliases);
            walk(or.getRightExpression(), state, aliases);
            return;
        }
        if (expression instanceof NotExpression not) {
            mergeFlag(state.facts, "predicate.not", true);
            walk(not.getExpression(), state, aliases);
            return;
        }
        if (expression instanceof LikeExpression like) {
            var pattern = like.getRightExpression();
            if (pattern instanceof StringValue text && text.getValue() != null && text.getValue().startsWith("%")) {
                mergeFlag(state.facts, "predicate.leadingWildcardLike", true);
            }
            return;
        }
        if (expression instanceof InExpression in) {
            if (isSubquery(in.getRightExpression())) {
                state.subqueries++;
                mergeFlag(state.facts, "predicate.inSubquery", true);
            }
            walk(in.getLeftExpression(), state, aliases);
            return;
        }
        if (expression instanceof EqualsTo || expression instanceof NotEqualsTo) {
            var binary = (BinaryExpression) expression;
            if (binary.getLeftExpression() instanceof NullValue || binary.getRightExpression() instanceof NullValue) {
                mergeFlag(state.facts, "predicate.nullComparison", true);
            }
            walk(binary.getLeftExpression(), state, aliases);
            walk(binary.getRightExpression(), state, aliases);
            return;
        }
        if (expression instanceof BinaryExpression binary) {
            walk(binary.getLeftExpression(), state, aliases);
            walk(binary.getRightExpression(), state, aliases);
            return;
        }
        if (expression instanceof Function function) {
            if (hasColumnArgument(function)) {
                var name = function.getName();
                state.facts.putIfAbsent("predicate.functionOnColumn", name == null ? "FUNCTION" : name);
            }
            walkArguments(function.getParameters(), state, aliases);
            return;
        }
        if (expression instanceof CastExpression cast) {
            mergeFlag(state.facts, "predicate.explicitCast", true);
            walk(cast.getLeftExpression(), state, aliases);
            return;
        }
        if (isSubquery(expression)) {
            state.subqueries++;
            mergeFlag(state.facts, "predicate.subquery", true);
            return;
        }
        walkArguments(expression, state, aliases);
    }

    private static void walkArguments(Expression expression, State state, Map<String, String> aliases) {
        if (expression instanceof ExpressionList<?> list) {
            for (Expression item : list) walk(item, state, aliases);
        }
    }

    private static boolean hasColumnArgument(Function function) {
        var parameters = function.getParameters();
        if (parameters == null) return false;
        for (Expression parameter : parameters) if (parameter instanceof Column) return true;
        return false;
    }

    private static boolean isSubquery(Expression expression) {
        if (expression == null) return false;
        var name = expression.getClass().getSimpleName();
        return name.contains("Select") || name.contains("SubSelect");
    }

    private static void collectKeys(Expression expression, State state, Map<String, String> aliases) {
        if (expression instanceof EqualsTo equality
                && equality.getLeftExpression() instanceof Column left
                && equality.getRightExpression() instanceof Column right) {
            var key = equality.toString();
            state.joinKeys.add(key);
            for (var column : List.of(left, right)) {
                var owner = column.getTable() == null ? "" : column.getTable().getName();
                if (owner != null && aliases.containsKey(owner)) {
                    state.joinColumns.add(Map.of(
                            "table", aliases.get(owner),
                            "column", column.getColumnName(),
                            "condition", key));
                }
            }
            state.joinKeyAdvice.add("关联条件 " + key
                    + "：请核对连接列类型、唯一性和索引前导列，并用执行计划比较扫描与连接方式。"
                    + "没有高选择性过滤时，顺序扫描和哈希连接可能优于逐行索引查找，不能仅凭 JOIN 就创建索引。");
        }
        if (expression instanceof BinaryExpression binary) {
            collectKeys(binary.getLeftExpression(), state, aliases);
            collectKeys(binary.getRightExpression(), state, aliases);
        }
    }

    private static void alias(Table table, Map<String, String> aliases) {
        aliases.put(table.getName(), table.getFullyQualifiedName());
        if (table.getAlias() != null) aliases.put(table.getAlias().getName(), table.getFullyQualifiedName());
    }

    private static void mergeFlag(Map<String, Object> facts, String key, boolean value) {
        facts.merge(key, value, (existing, replacement) -> Boolean.TRUE.equals(existing) || Boolean.TRUE.equals(replacement));
    }

    private static final class State {
        String statementType = "OTHER";
        String normalized = "";
        final Map<String, Object> facts = new LinkedHashMap<>();
        final List<String> tables = new ArrayList<>();
        final List<String> joinKeys = new ArrayList<>();
        final List<Map<String, String>> joinColumns = new ArrayList<>();
        final List<String> joinKeyAdvice = new ArrayList<>();
        int joins;
        int functions;
        int subqueries;
        int cartesian;
        int unions;

        Extraction extraction() {
            facts.put("table.count", tables.size());
            facts.put("table.list", String.join("、", tables));
            facts.put("metric.joinCount", joins);
            facts.put("metric.functionCount", functions);
            facts.put("metric.subqueryCount", subqueries);
            facts.put("metric.unionCount", unions);
            facts.put("join.count", joins);
            facts.put("select.noWhere", Boolean.FALSE.equals(facts.get("select.hasWhere")));
            return new Extraction(facts.get("parse.status") instanceof String status ? status : "invalid",
                    statementType, normalized, "invalid".equals(facts.get("parse.status"))
                    ? "SQL 无法解析，请检查语法及数据库方言" : null,
                    Map.copyOf(facts), List.copyOf(tables), List.copyOf(joinKeys),
                    List.copyOf(joinColumns), List.copyOf(joinKeyAdvice));
        }
    }
}
