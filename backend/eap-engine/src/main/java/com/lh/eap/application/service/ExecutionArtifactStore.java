package com.lh.eap.application.service;

import com.lh.eap.api.CliExecution;
import java.io.IOException;
import java.util.UUID;

/** Stores already-redacted execution evidence, never provider-controlled file paths. */
public interface ExecutionArtifactStore {
    CliExecution.Artifact save(UUID executionId,String kind,byte[] redactedContent)throws IOException;
}
