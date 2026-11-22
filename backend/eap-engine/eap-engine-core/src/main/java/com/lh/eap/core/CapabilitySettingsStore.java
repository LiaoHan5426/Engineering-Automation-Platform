package com.lh.eap.core;

import java.util.List;

/**
 * Authoritative store for the single on/off switch every capability carries, whatever its kind.
 *
 * <p>A successful empty read means "nothing has been configured" (absent means enabled). An
 * unreadable store is deliberately <em>not</em> an empty table: the orchestration layer turns a failed
 * read into a refusal, so an operator's persisted switch is never silently bypassed.
 */
public interface CapabilitySettingsStore {
    /** One raw persisted row; nullable fields are normalized by the owning service. */
    record Row(String capability, Boolean enabled, String notes, String updatedAt) {}

    /** Every stored row, or an empty list when nothing has been configured. */
    List<Row> loadAll();

    /** Insert or update one setting; the row is identified by capability. */
    void save(String capability, boolean enabled, String notes);
}
