package com.lh.eap.api;

import java.nio.file.Path;
import java.util.Objects;

public record ExecutionContext(Path workspace, ProcessExecutor executor) {
  public ExecutionContext { Objects.requireNonNull(workspace); Objects.requireNonNull(executor); }
}
