package com.lh.eap.core;

import com.lh.eap.api.TaskRef;

/**
 * Board-task authorization bridge for code generation and apply. Implemented by the workflow layer,
 * which owns the Board rules; the JDBC adapter receives only this port and never imports a service.
 */
public interface CodeTaskBinding {
    void lock(TaskRef ref);

    CodeEvidenceStore.TaskSnapshot captureLocked(TaskRef ref, String prototypeId);

    CodeEvidenceStore.TaskSnapshot planningLocked(TaskRef ref);

    void validateLocked(CodeEvidenceStore.TaskSnapshot expected);
}
