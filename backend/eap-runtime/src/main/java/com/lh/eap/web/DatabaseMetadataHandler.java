package com.lh.eap.web;

import com.lh.eap.rules.SqlFactVocabulary;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * Reads the operator-registered schema/index snapshot of an explicitly granted database profile.
 *
 * <p>The platform never connects to the business database; it only reads a human-curated snapshot and
 * refuses any profile whose metadata still contains credentials.
 *
 * <p>Both capabilities publish facts ("the snapshot loaded", "something in it does not cover the
 * query"), which is what lets a declarative rule react to snapshot content instead of a Java branch.
 */
@Component
public class DatabaseMetadataHandler implements CapabilityHandler {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String SCHEMA = SqlFactVocabulary.DATABASE_SCHEMA_READ;
    private static final String INDEXES = SqlFactVocabulary.DATABASE_INDEX_READ;

    private final JdbcTemplate jdbc;
    private final ExpertDefinitionService definitions;

    public DatabaseMetadataHandler(JdbcTemplate jdbc, ExpertDefinitionService definitions) {
        this.jdbc = jdbc;
        this.definitions = definitions;
    }

    @Override public Set<String> capabilities() { return Set.of(SCHEMA, INDEXES); }

    @Override public CapabilityKind kind() { return CapabilityKind.COMMAND; }

    @Override public List<CapabilityDescriptor> describe() {
        return List.of(
                new CapabilityDescriptor(SCHEMA, kind(),
                        "读取授权表结构快照",
                        "读取人工登记的脱敏表结构快照，校验关联列是否存在且类型一致。不连接业务数据库、不校验实时 DDL。",
                        List.of("databaseId（专家已授权的资料）", "sql（提供关联列线索）"),
                        List.of("专家启用时授权的数据库资料（eap.expert_database_grant）"),
                        "JdbcTemplate · eap.database_profile 快照",
                        SqlFactVocabulary.factsOf(SCHEMA).stream().map(SqlFactVocabulary.Fact::key).toList(),
                        List.of("tables"),
                        true),
                new CapabilityDescriptor(INDEXES, kind(),
                        "读取授权索引快照",
                        "读取人工登记的脱敏索引快照，判断关联列是否存在前导列匹配的索引。结论限于快照内容，不代表线上真实索引。",
                        List.of("databaseId（专家已授权的资料）", "sql（提供关联列线索）"),
                        List.of("专家启用时授权的数据库资料（eap.expert_database_grant）"),
                        "JdbcTemplate · eap.database_profile 快照",
                        SqlFactVocabulary.factsOf(INDEXES).stream().map(SqlFactVocabulary.Fact::key).toList(),
                        List.of("indexes"),
                        true));
    }

    @SuppressWarnings("unchecked")
    @Override public NodeResult handle(CapabilityContext context) {
        boolean schema = SCHEMA.equals(context.step().capability());
        var facts = SqlFactVocabulary.factsOf(context.step().capability()).stream()
                .map(SqlFactVocabulary.Fact::key).toArray(String[]::new);
        if (context.request().databaseId() == null) {
            context.markNotProduced(facts);
            return new NodeResult(false, true, "未选择数据库资料", Map.of());
        }
        if (!definitions.databaseGranted(context.expertId(), context.request().databaseId())) {
            context.markNotProduced(facts);
            return new NodeResult(false, true, "此专家无权读取所选数据库资料", Map.of());
        }
        var rows = jdbc.queryForList("SELECT metadata::text AS metadata FROM eap.database_profile WHERE id=?",
                context.request().databaseId());
        if (rows.isEmpty()) {
            context.markNotProduced(facts);
            return new NodeResult(false, true, "数据库资料不存在", Map.of());
        }
        var metadata = JSON.readValue((String) rows.getFirst().get("metadata"), Map.class);
        if (SensitiveData.containsSecret(metadata)) {
            context.markNotProduced(facts);
            return new NodeResult(false, false, "资料包含凭据，已阻止读取", Map.of());
        }

        var key = schema ? "tables" : "indexes";
        var value = metadata.get(key);
        if (value == null) {
            context.markNotProduced(facts);
            return new NodeResult(false, true, "资料缺少 " + key + " 字段", Map.of());
        }
        if (!(value instanceof List<?>)) {
            context.markNotProduced(facts);
            return new NodeResult(false, true, "资料字段 " + key + " 必须是列表", Map.of());
        }

        var inspection = schema
                ? SqlMetadataInspector.inspectSchema(value, context.analysis())
                : SqlMetadataInspector.inspectIndexes(value, context.analysis());
        inspection.facts().forEach(context::publish);
        context.advice().add("已读取所选资料的 " + key + "；这是人工登记快照，不代表当前数据库实时状态。");
        context.advice().addAll(inspection.advice());
        return new NodeResult(true, false, "已读取显式授权的脱敏资料", Map.of(key, value, "facts", inspection.facts()));
    }
}
