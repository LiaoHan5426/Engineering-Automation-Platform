package com.lh.eap.core;

import java.util.Optional;
import java.util.UUID;
import com.lh.eap.domain.model.PrototypeDelivery;

public interface PrototypeDeliveryStore {
    void insert(PrototypeDelivery delivery);

    Optional<PrototypeDelivery> findByVersion(UUID versionId);
}
