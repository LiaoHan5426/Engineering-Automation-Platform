package com.lh.eap.ai;

import com.lh.eap.llm.EndpointPolicy;
import java.util.UUID;

/** Immutable connection material captured for one revision. The secret is never part of {@link #toString()}. */
public final class ModelConnectionSnapshot {
    public final UUID id;
    public final String name;
    public final String kind;
    public final boolean enabled;
    public final String baseUrl;
    public final String model;
    public final String secret;
    public final long revision;
    public final boolean defaultSelected;
    public final String configurationRevision;

    public ModelConnectionSnapshot(UUID id, String name, String kind, boolean enabled, String baseUrl, String model,
            String secret, long revision, boolean defaultSelected, String configurationRevision) {
        this.id = id;
        this.name = name;
        this.kind = kind;
        this.enabled = enabled;
        this.baseUrl = baseUrl;
        this.model = model;
        this.secret = secret;
        this.revision = revision;
        this.defaultSelected = defaultSelected;
        this.configurationRevision = configurationRevision;
    }

    public boolean usable() {
        return enabled && secret != null && !secret.isBlank() && model != null && !model.isBlank()
                && EndpointPolicy.permits(baseUrl, true);
    }

    public ModelConnectionView view() {
        return new ModelConnectionView(id, name, kind, enabled, baseUrl, model, secret != null && !secret.isBlank(),
                revision, defaultSelected, configurationRevision, java.util.List.of(), java.util.List.of(), "", "");
    }

    public ModelConnectionSnapshot withModel(String selected) {
        if (model.equals(selected)) return this;
        return new ModelConnectionSnapshot(id, name, kind, enabled, baseUrl, selected, secret, revision,
                defaultSelected, configurationRevision + ":" + selected);
    }

    @Override
    public String toString() {
        return "connection " + id + " revision " + revision;
    }
}
