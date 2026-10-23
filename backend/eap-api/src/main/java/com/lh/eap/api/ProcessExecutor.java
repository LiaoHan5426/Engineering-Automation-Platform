package com.lh.eap.api;

import java.nio.file.Path;
import java.util.List;

public interface ProcessExecutor {
    default java.util.Optional<CliExecution.Snapshot> status(java.util.UUID id) { return java.util.Optional.empty(); }
    default java.util.List<CliExecution.Snapshot> snapshots() { return java.util.List.of(); }
    default java.util.Optional<CliExecution.Snapshot> cancel(java.util.UUID id) { return java.util.Optional.empty(); }
    default Observation runManaged(java.util.UUID id, String capability, Path directory, List<String> command,
                                   java.util.Map<String,String> environment) {
        return runIsolated(capability,directory,command,environment);
    }
    Observation run(String capability, Path workingDirectory, List<String> command);

    /** Explicit environment execution must fail closed on legacy implementations. */
    default Observation runIsolated(String capability, Path directory, List<String> command,
                                    java.util.Map<String,String> environment) {
        throw new UnsupportedOperationException("Explicit environment execution is not supported");
    }
}
