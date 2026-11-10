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
public class PrototypeVersionService implements com.lh.eap.delivery.PrototypeVersionQuery {
    static final String ONE_DELIVERY = "prototype_delivery_one_version";
    private final PrototypeVersionStore versions;
    private final PrototypeDeliveryStore deliveries;

    public PrototypeVersionService(PrototypeVersionStore versions, PrototypeDeliveryStore deliveries) {
        this.versions = versions;
        this.deliveries = deliveries;
    }

    public PrototypeVersion save(UUID requestId, String sourceRef, String title, String body, List<String> acceptance) {
        if (requestId == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "PUBLICATION_REQUEST_ID_REQUIRED");
        var content = PrototypeCanonical.of(sourceRef, title, body, acceptance);
        var version = new PrototypeVersion(UUID.randomUUID(), requestId, content.sourceRef(), content.title(), content.body(),
                content.acceptance(), content.hash(), Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS));
        versions.insert(version);
        var stored = publication(requestId);
        if (!stored.contentHash().equals(content.hash()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "PUBLICATION_REQUEST_CONTENT_CONFLICT");
        return stored;
    }

    public PrototypeVersion publication(UUID requestId) {
        return versions.request(requestId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "PUBLICATION_NOT_FOUND"));
    }

    @Override
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
        SemanticPrototype.require(find(versionId).body());
        try {
            var created = new PrototypeDelivery(UUID.randomUUID(), versionId, Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS));
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
