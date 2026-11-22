package com.lh.eap.core;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** SQL-only boundary for expert definition lookup and grant activation. */
public interface ExpertDefinitionStore {
    record Definition(String manifest, boolean enabled, boolean builtin) { }

    Optional<Definition> find(String id);

    /** SELECT ... FOR UPDATE snapshot for activation. */
    Optional<Definition> lock(String id);

    boolean isBuiltin(String id);

    List<UUID> knowledgeGrants(String id);

    boolean databaseGranted(String expertId, UUID databaseId);

    /** {@code table} is a service-owned constant, never caller input. */
    boolean referenceExists(String table, UUID id);

    /** Replace all three grant sets in the caller's transaction; enabled=false clears them. */
    void replaceGrants(String id, List<UUID> knowledgeBases, List<UUID> databaseProfiles, List<String> capabilities);

    void setEnabled(String id, boolean enabled);
}
