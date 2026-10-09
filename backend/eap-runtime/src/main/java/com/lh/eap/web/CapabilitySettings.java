package com.lh.eap.web;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * The one on/off switch for every capability, whatever its kind.
 *
 * <p>A capability is registered by code, so the only thing an operator can decide about its existence is
 * whether this installation should offer it: {@code database.explain} may be pointless without a plan
 * snapshot source, an operator may want a stricter baseline. That decision — plus a note explaining it —
 * lives here, in one table, rather than being spread across the CLI channel and the MCP registry.
 *
 * <p><b>Absent means enabled.</b> Settings are an opt-out: a capability nobody configured must be
 * runnable, otherwise a fresh install would silently offer nothing. Failing closed is right for trust
 * decisions (see {@code McpServerRegistry}) and wrong for a switch whose default is "on".
 *
 * <p>The refusal rule is the same one rule packs and knowledge bases already follow: a capability that an
 * <em>enabled</em> expert runs cannot be switched off, because doing so would turn a working expert into
 * one that fails a node. Draft references do not block anything — they are not running.
 */
@Service
public class CapabilitySettings {
    private static final int NOTES_LIMIT = 500;

    private final JdbcTemplate jdbc;
    private final CapabilityUsage usage;

    public CapabilitySettings(JdbcTemplate jdbc, CapabilityUsage usage) {
        this.jdbc = jdbc;
        this.usage = usage;
    }

    public record Setting(String capability, boolean enabled, String notes, String updatedAt) { }

    /** Every stored setting. An empty map means "nothing has been configured", i.e. everything is on. */
    public Map<String, Setting> all() {
        var result = new LinkedHashMap<String, Setting>();
        List<Map<String, Object>> rows;
        try {
            rows = jdbc.queryForList("SELECT capability,enabled,notes,updated_at FROM eap.capability_setting");
        } catch (RuntimeException error) {
            return result;
        }
        if (rows == null) return result;
        for (var row : rows) {
            var capability = text(row.get("capability"));
            if (capability == null) continue;
            result.put(capability, new Setting(capability, !Boolean.FALSE.equals(row.get("enabled")),
                    Objects.toString(row.get("notes"), ""), Objects.toString(row.get("updated_at"), "")));
        }
        return result;
    }

    public Setting setting(String capability) {
        return all().getOrDefault(capability, new Setting(capability, true, "", ""));
    }

    public boolean enabled(String capability) { return setting(capability).enabled(); }

    /** Capabilities the operator switched off. Absent capabilities are enabled, so this is a real list. */
    public Set<String> disabled() {
        var result = new TreeSet<String>();
        for (var setting : all().values()) if (!setting.enabled()) result.add(setting.capability());
        return result;
    }

    /**
     * Turn a capability on or off and record why.
     *
     * @throws IllegalStateException when an enabled expert still runs it — the caller turns that into a
     *                               refusal listing the experts, so the operator can decide which to
     *                               disable first instead of discovering it as a failing node later
     */
    public void save(String capability, boolean enabled, String notes) {
        var note = notes == null ? "" : notes.trim();
        if (note.length() > NOTES_LIMIT) throw new IllegalArgumentException("备注最多" + NOTES_LIMIT + "字符");
        if (!enabled) {
            var experts = usage.enabledExpertsUsing(capability);
            if (!experts.isEmpty()) {
                throw new IllegalStateException("能力 " + capability + " 仍被已启用专家引用：" + String.join("、", experts)
                        + "。停用会让这些专家的节点在执行时失败；请先停用这些专家，或从它们的流程中移除该节点。");
            }
        }
        jdbc.update("INSERT INTO eap.capability_setting (capability,enabled,notes,updated_at) VALUES (?,?,?,now()) "
                        + "ON CONFLICT (capability) DO UPDATE SET enabled=EXCLUDED.enabled, notes=EXCLUDED.notes, updated_at=now()",
                capability, enabled, note);
    }

    private static String text(Object value) {
        if (value == null) return null;
        var text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
    }
}
