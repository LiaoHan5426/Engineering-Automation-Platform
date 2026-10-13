package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Two invariants that each cost a real outage when they break, and neither of which a unit test that
 * calls constructors directly can see.
 *
 * <p>The first was a live defect: {@code CapabilityCatalog} had three constructors and no
 * {@code @Autowired}, so Spring found no default constructor and the application refused to start —
 * while every unit test passed.
 */
class SchemaAndWiringTest {

    // ---------------------------------------------------------------- 容器必须能选出一个构造器

    /**
     * A bean with more than one constructor and no {@code @Autowired} cannot be instantiated: the
     * container looks for a no-argument constructor, does not find one, and refuses to guess which
     * overload was meant.
     *
     * <p>This scans the whole main source tree rather than naming classes, because the defect is
     * invisible until the next bean happens to be constructed by the container: the first one fixed
     * here was found only by booting the application, and four more were waiting behind it.
     */
    @Test void everyMultiConstructorBeanSaysWhichConstructorTheContainerShouldUse() throws IOException {
        var root = Path.of("src", "main", "java");
        var offenders = new ArrayList<String>();
        var checked = new ArrayList<String>();
        try (var files = Files.walk(root)) {
            for (var file : files.filter(path -> path.toString().endsWith(".java")).toList()) {
                var source = Files.readString(file);
                if (!source.contains("@Service") && !source.contains("@Component")) continue;
                if (source.contains("interface ")) continue;
                var declared = Pattern.compile("public class (\\w+)").matcher(source);
                if (!declared.find()) continue;
                var name = declared.group(1);
                var body = source.substring(declared.end());
                var constructors = Pattern
                        .compile("^\\s*(?:public |protected |private )?" + Pattern.quote(name) + "\\s*\\(",
                                Pattern.MULTILINE)
                        .matcher(body)
                        .results()
                        .count();
                if (constructors <= 1) continue;
                checked.add(name);
                if (!source.contains("@Autowired")) {
                    offenders.add(name + "（" + constructors + " 个构造器，无 @Autowired）");
                }
            }
        }
        assertFalse(checked.isEmpty(), "这个检查必须真的找到多构造器的 bean，否则它什么都没检查：" + checked);
        assertEquals(List.of(), offenders,
                "多构造器的 @Service 必须有一个标 @Autowired，否则应用启动失败；单元测试直接 new 构造器，看不到这一点。");
    }

    /** The annotated constructor must be one Spring can satisfy from the context. */
    @Test void theAutowiredConstructorTakesOnlyResolvableCollaborators() {
        var target = List.of(CapabilityCatalog.class.getDeclaredConstructors()).stream()
                .filter(c -> c.isAnnotationPresent(Autowired.class))
                .findFirst()
                .orElseThrow(() -> new AssertionError("没有标 @Autowired 的构造器"));
        for (var parameter : target.getParameterTypes()) {
            assertTrue(parameter.getName().startsWith("com.lh.eap") || JdbcTemplate.class.equals(parameter),
                    "构造器参数应当都是可注入的 bean：" + parameter.getName());
        }
    }

    // ---------------------------------------------------------------- 迁移不得使用保留字作列名

    /**
     * {@code binary} is a PostgreSQL keyword of category {@code T} ("reserved, can be function or type
     * name"), so {@code CREATE TABLE t (binary text)} is a syntax error and the migration fails on
     * every database. Advice usually quotes only category {@code R}, which is why the mistake looks
     * harmless right up until the migration runs.
     *
     * <p>The list is the union of {@code R}, {@code C} and {@code T} as this project's own PostgreSQL
     * reports them.
     */
    private static final List<String> RESERVED = List.of(
            "all", "analyse", "analyze", "and", "any", "array", "as", "asc", "asymmetric", "authorization",
            "between", "bigint", "binary", "bit", "boolean", "both", "case", "cast", "char", "character",
            "check", "coalesce", "collate", "collation", "column", "concurrently", "constraint", "create",
            "cross", "dec", "decimal", "default", "deferrable", "desc", "distinct", "do", "else", "end",
            "except", "exists", "extract", "false", "fetch", "float", "for", "foreign", "freeze", "from",
            "full", "grant", "greatest", "group", "grouping", "having", "ilike", "in", "initially", "inner",
            "inout", "int", "integer", "intersect", "interval", "into", "is", "isnull", "join", "json",
            "lateral", "leading", "least", "left", "like", "limit", "localtime", "localtimestamp", "national",
            "natural", "nchar", "none", "normalize", "not", "notnull", "null", "nullif", "numeric", "offset",
            "on", "only", "or", "order", "out", "outer", "overlaps", "overlay", "placing", "position",
            "precision", "primary", "real", "references", "returning", "right", "row", "select", "setof",
            "similar", "smallint", "some", "substring", "symmetric", "table", "tablesample", "then", "time",
            "timestamp", "to", "trailing", "treat", "trim", "true", "union", "unique", "user", "using",
            "values", "varchar", "variadic", "verbose", "when", "where", "window", "with", "xmlattributes",
            "xmlconcat", "xmlelement", "xmlexists", "xmlforest", "xmlnamespaces", "xmlparse", "xmlpi",
            "xmlroot", "xmlserialize", "xmltable");

    /** A column definition inside a CREATE TABLE body: an identifier followed by a type. */
    private static final Pattern COLUMN = Pattern.compile("^\\s+([a-z_][a-z0-9_]*)\\s+[a-z]+", Pattern.MULTILINE);
    private static final Pattern ADD_COLUMN = Pattern.compile(
            "ALTER TABLE eap\\.(\\w+) ADD COLUMN (?:IF NOT EXISTS )?([a-z_][a-z0-9_]*)");
    private static final Pattern CREATE_TABLE = Pattern.compile(
            "CREATE TABLE (?:IF NOT EXISTS )?eap\\.(\\w+)");

    @Test void noMigrationNamesAColumnAfterAPostgresReservedWord() throws IOException {
        var offenders = new ArrayList<String>();
        for (var file : migrations()) {
            var sql = Files.readString(file);
            COLUMN.matcher(sql).results().forEach(match -> {
                if (RESERVED.contains(match.group(1))) {
                    offenders.add(file.getFileName() + " 列 " + match.group(1));
                }
            });
            var added = ADD_COLUMN.matcher(sql);
            while (added.find()) {
                if (RESERVED.contains(added.group(2))) {
                    offenders.add(file.getFileName() + " 新增列 " + added.group(2));
                }
            }
        }
        assertEquals(List.of(), offenders,
                "列名不能是 PostgreSQL 保留字（R/C/T 三类，含 binary）：CREATE TABLE t (binary text) 是语法错误。");
    }

    /** Every table and column carries a comment, so the schema can be read without reading the code. */
    @Test void everyTableAndColumnIsCommented() throws IOException {
        var allText = new StringBuilder();
        for (var file : migrations()) allText.append(Files.readString(file)).append('\n');
        var documented = allText.toString();

        var undocumented = new ArrayList<String>();
        for (var file : migrations()) {
            var sql = Files.readString(file);
            var tables = CREATE_TABLE.matcher(sql);
            while (tables.find()) {
                var table = tables.group(1);
                if (!documented.contains("COMMENT ON TABLE eap." + table + " ")) {
                    undocumented.add("表 " + table);
                }
                for (var column : columnsOf(sql, tables.start())) {
                    if (!documented.contains("COMMENT ON COLUMN eap." + table + "." + column + " ")) {
                        undocumented.add("列 " + table + "." + column);
                    }
                }
            }
            var added = ADD_COLUMN.matcher(sql);
            while (added.find()) {
                if (!documented.contains("COMMENT ON COLUMN eap." + added.group(1) + "." + added.group(2) + " ")) {
                    undocumented.add("新增列 " + added.group(1) + "." + added.group(2));
                }
            }
        }
        assertEquals(List.of(), undocumented, "每张表与每一列都要有 COMMENT，表结构应该不读代码就能读懂");
    }

    /** Guards the reflection above: a broken regex would make "no reserved words" pass vacuously. */
    @Test void theColumnPatternActuallyReadsColumns() throws IOException {
        var found = new ArrayList<String>();
        for (var file : migrations()) {
            var sql = Files.readString(file);
            COLUMN.matcher(sql).results().map(m -> m.group(1).toLowerCase(Locale.ROOT)).forEach(found::add);
        }
        assertTrue(found.size() > 40, "列名正则必须真的匹配到列，否则「没有保留字」是因为什么都没读到：" + found.size());
        assertTrue(found.contains("binary_path"), "应当已经读到修复后的列名 binary_path：" + found);
    }

    /** The column names of one CREATE TABLE body, identified by its start offset. */
    private static List<String> columnsOf(String sql, int createStart) {
        var open = sql.indexOf('(', createStart);
        if (open < 0) return List.of();
        int depth = 0;
        int close = sql.length();
        for (int i = open; i < sql.length(); i++) {
            var c = sql.charAt(i);
            if (c == '(') depth++;
            else if (c == ')' && --depth == 0) { close = i; break; }
        }
        return COLUMN.matcher(sql.substring(open, close)).results()
                .map(match -> match.group(1)).toList();
    }

    private static List<Path> migrations() throws IOException {
        try (var files = Files.list(Path.of("src", "main", "resources", "db", "migration"))) {
            return files.filter(path -> path.getFileName().toString().endsWith(".sql")).sorted().toList();
        }
    }
}
