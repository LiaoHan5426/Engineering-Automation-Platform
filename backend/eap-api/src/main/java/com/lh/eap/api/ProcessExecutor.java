package com.lh.eap.api;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import java.nio.file.Path;
import java.util.List;

public interface ProcessExecutor {
    /** Fail closed when an executor cannot observe cancellation before process start. */
    default Observation runManaged(UUID id, String capability, Path directory, List<String> command,
                                   Map<String,String> environment, ManagedProcessControl control) {
        throw new UnsupportedOperationException("Controlled managed execution is not supported");
    }
    default Optional<CliExecution.Snapshot> status(UUID id) { return Optional.empty(); }
    default List<CliExecution.Snapshot> snapshots() { return List.of(); }
    default Optional<CliExecution.Snapshot> cancel(UUID id) { return Optional.empty(); }
    default Observation runManaged(UUID id, String capability, Path directory, List<String> command,
                                   Map<String,String> environment) {
        return runIsolated(capability,directory,command,environment);
    }
    Observation run(String capability, Path workingDirectory, List<String> command);

    /** Explicit environment execution must fail closed on legacy implementations. */
    default Observation runIsolated(String capability, Path directory, List<String> command,
                                    Map<String,String> environment) {
        throw new UnsupportedOperationException("Explicit environment execution is not supported");
    }
}
