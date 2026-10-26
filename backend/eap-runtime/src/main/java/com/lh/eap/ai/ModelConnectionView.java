package com.lh.eap.ai;

import java.util.UUID;

/** Browser view of a model connection. The secret stays on the server. */
public record ModelConnectionView(UUID id, String name, String kind, boolean enabled, String baseUrl, String defaultModel,
        boolean secretPresent, long revision, boolean defaultSelected, String configurationRevision,
        java.util.List<ModelOption> models, java.util.List<String> allowedModels, String discoveredAt, String discoveryError) {}
