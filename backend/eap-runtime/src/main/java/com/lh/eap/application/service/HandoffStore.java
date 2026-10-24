package com.lh.eap.application.service;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface HandoffStore {
    void insert(Handoff handoff);

    List<Handoff> list();

    Optional<Handoff> find(UUID id);
}
