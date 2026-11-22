package com.lh.eap.core;

import com.lh.eap.api.TaskRef;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;

/** SQL-only authority for immutable generation evidence, including task/workspace locking. */
public interface CodeGenerationEvidenceStore {
    CodeEvidenceStore.Snapshot capture(TaskRef ref, String workspace, String prototypeId, CodeTaskBinding binding,
                                       Function<CodeEvidenceStore.TaskSnapshot, CodeEvidenceStore.Snapshot> capture);

    void save(CodeEvidenceStore.Snapshot snapshot);

    CodeEvidenceStore.TaskSnapshot planningTask(TaskRef ref, CodeTaskBinding binding);

    Optional<CodeEvidenceStore.Snapshot> find(UUID id);
}
