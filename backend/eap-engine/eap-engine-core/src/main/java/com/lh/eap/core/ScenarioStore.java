package com.lh.eap.core;

import com.lh.eap.domain.model.ScenarioDependencyStatus;
import java.util.List;
import java.util.Optional;

/** Durable local scenario configuration store, independent of resource activation. */
public interface ScenarioStore {
    record Dependency(String name, String state, String where) {
        public Dependency { ScenarioDependencyStatus.fromWire(state); }
    }

    record Definition(String name, String status, List<String> modes, String summary,
                      String instructions, List<String> tools, List<String> skills, List<String> mcp,
                      List<Dependency> dependencies, String workflow) {}

    record Snapshot(String id, long revision, Definition definition) {}

    long countPrototypeVersions();

    List<Snapshot> list();

    Optional<Snapshot> find(String id);

    /** Insert at revision zero when absent; empty result means an existing row won the CAS. */
    Optional<Snapshot> insert(String id, String definitionJson);

    /** Compare-and-set update; empty result means stale revision or a deleted row. */
    Optional<Snapshot> update(String id, long revision, String definitionJson);

    /** Soft delete compare-and-set; false means stale revision or a deleted row. */
    boolean delete(String id, long revision);
}
