package com.lh.eap.core;

import java.util.List;
import java.util.Optional;

/** Definition reads and draft writes used by expert management and execution. */
public interface ExpertDefinitionManagementStore {
    record LockedDefinition(String id, String manifest, boolean enabled, long revision) { }
    record ListedDefinition(String id, String manifest, boolean enabled, long revision, boolean builtin) { }

    /** Read a definition under a shared row lock within the caller's transaction. */
    Optional<LockedDefinition> lockDefinition(String id);

    List<ListedDefinition> listDefinitions();

    /** Save a disabled draft and revoke all grants within the caller's transaction. */
    String saveDraft(String id, String name, String manifest);
}
