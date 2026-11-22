package com.lh.eap.core;

import com.lh.eap.domain.model.BoardVerificationStatus;
import com.lh.eap.domain.model.CodeProposalStatus;
import com.lh.eap.domain.model.MissionExecutionStatus;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Single-snapshot read model of active board runtime state. */
public interface BoardRuntimeQuery {
    record Activity(UUID taskId, UUID id, String kind, String status, String storedStatus) {
        public Activity {
            boolean valid = switch (kind) {
                case "RUN" -> MissionExecutionStatus.fromWire(status).blocking() && MissionExecutionStatus.isKnown(storedStatus);
                case "VERIFICATION" -> BoardVerificationStatus.fromWire(status).blocking() && BoardVerificationStatus.isKnown(storedStatus);
                case "SOURCE_WRITE" -> CodeProposalStatus.fromWire(status).blocking() && CodeProposalStatus.isKnown(storedStatus);
                default -> false;
            };
            if (!valid) throw new IllegalArgumentException("INVALID_BOARD_RUNTIME_STATE");
        }
    }

    record Snapshot(String projectId, Instant observedAt, long taskCount, long runCount,
                    long activeRunCount, long unknownRunCount, long activeVerificationCount, long unknownVerificationCount,
                    long activeWriteCount, long unknownWriteCount, List<Activity> items, boolean truncated) {}

    Snapshot inspect(String projectId);
}
