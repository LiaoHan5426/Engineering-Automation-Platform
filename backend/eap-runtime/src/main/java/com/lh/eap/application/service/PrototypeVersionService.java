package com.lh.eap.application.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PrototypeVersionService {
    static final String ONE_DELIVERY = "prototype_delivery_one_version";
    private final PrototypeVersionStore versions;
    private final PrototypeDeliveryStore deliveries;

    public PrototypeVersionService(PrototypeVersionStore versions, PrototypeDeliveryStore deliveries) {
        this.versions = versions;
        this.deliveries = deliveries;
    }

    public PrototypeVersion save(String sourceRef, String title, String body, int buttonPresses, List<String> acceptance) {
        var content = PrototypeCanonical.of(sourceRef, title, body, buttonPresses, acceptance);
        var version = new PrototypeVersion(UUID.randomUUID(), content.sourceRef(), content.title(), content.body(),
                content.buttonPresses(), content.interaction(), content.acceptance(), content.hash(), Instant.now());
        versions.insert(version);
        return version;
    }

    public PrototypeVersion find(UUID id) {
        return versions.find(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "原型版本不存在"));
    }

    public List<PrototypeVersion> list(String sourceRef) {
        if (!"builder-alpha".equals(sourceRef) && !"builder-beta".equals(sourceRef)) {
            throw new IllegalArgumentException("原型版本只属于 builder-alpha 或 builder-beta");
        }
        return versions.list(sourceRef);
    }

    public PrototypeDelivery deliver(UUID versionId) {
        find(versionId);
        try {
            var created = new PrototypeDelivery(UUID.randomUUID(), versionId, Instant.now());
            deliveries.insert(created);
            return created;
        } catch (DuplicateKeyException conflict) {
            if (!namesOneDelivery(conflict)) throw conflict;
            return deliveries.findByVersion(versionId).orElseThrow(() -> conflict);
        } catch (DataAccessException failure) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "数据服务暂不可用，请检查数据库、迁移和后端日志");
        }
    }

    private static boolean namesOneDelivery(DuplicateKeyException conflict) {
        var text = conflict.getMessage();
        var cause = conflict.getMostSpecificCause() == null ? null : conflict.getMostSpecificCause().getMessage();
        return (text != null && text.contains(ONE_DELIVERY)) || (cause != null && cause.contains(ONE_DELIVERY));
    }
}
