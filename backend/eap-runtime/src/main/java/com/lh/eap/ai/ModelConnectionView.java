package com.lh.eap.ai;

import java.util.UUID;

/** Browser view of a model connection. The secret stays on the server. */
public record ModelConnectionView(UUID id, String name, String kind, boolean enabled, String baseUrl, String model,
        boolean secretPresent, long revision, boolean defaultSelected, boolean environment, String configurationRevision) {}
