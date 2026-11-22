package com.lh.eap.core;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import com.lh.eap.domain.model.Handoff;

public interface HandoffStore {
    void insert(Handoff handoff);

    List<Handoff> list();

    Optional<Handoff> find(UUID id);
}
