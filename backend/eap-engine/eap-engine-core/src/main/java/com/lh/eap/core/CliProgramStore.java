package com.lh.eap.core;

import com.lh.eap.domain.model.CliOperation;
import com.lh.eap.domain.model.CliProgram;
import java.util.List;
import java.util.Optional;

/** Persisted CLI programs and operations; callers own validation and transactions. */
public interface CliProgramStore {
    List<CliProgram> programs();
    Optional<CliProgram> program(String id);
    List<CliOperation> operations();
    void insertProgram(CliProgram program);
    void saveOperation(CliOperation operation, boolean create);
    void lockProgram(String id);
    void lockExperts();
    void deleteOperation(String capability);
    void deleteProgram(String id);
}
