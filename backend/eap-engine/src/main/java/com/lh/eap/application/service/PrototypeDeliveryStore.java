package com.lh.eap.application.service;

import java.util.Optional;
import java.util.UUID;

public interface PrototypeDeliveryStore {
    void insert(PrototypeDelivery delivery);

    Optional<PrototypeDelivery> findByVersion(UUID versionId);
}
