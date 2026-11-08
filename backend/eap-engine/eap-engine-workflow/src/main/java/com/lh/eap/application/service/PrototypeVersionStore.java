package com.lh.eap.application.service;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PrototypeVersionStore {
    void insert(PrototypeVersion version);

    Optional<PrototypeVersion> find(UUID id);

    List<PrototypeVersion> list(String sourceRef);
}
