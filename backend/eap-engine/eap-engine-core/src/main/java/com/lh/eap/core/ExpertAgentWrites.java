package com.lh.eap.core;

import java.util.UUID;

/** Creates a reviewable candidate only. Applying it is a separate human-facing service operation. */
public interface ExpertAgentWrites {
    UUID prepare(ExpertAgentJournal.Entry lease, String target);
    UUID propose(ExpertAgentJournal.Entry lease, UUID generation, String target, String content);
}
