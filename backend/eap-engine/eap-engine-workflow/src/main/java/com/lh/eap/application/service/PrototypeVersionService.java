package com.lh.eap.application.service;
import com.lh.eap.delivery.PrototypeVersionQuery;
import java.time.temporal.ChronoUnit;
import com.lh.eap.error.CommonErrors;
import com.lh.eap.error.ResourceErrors;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PrototypeVersionService implements PrototypeVersionQuery {
    static final String ONE_DELIVERY = "prototype_delivery_one_version";
    private final PrototypeVersionStore versions;
    private final PrototypeDeliveryStore deliveries;

    public PrototypeVersionService(PrototypeVersionStore versions, PrototypeDeliveryStore deliveries) {
        this.versions = versions;
        this.deliveries = deliveries;
    }

    public PrototypeVersion save(UUID requestId, String sourceRef, String title, String body, List<String> acceptance) {
        if (requestId == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ResourceErrors.PUBLICATION_REQUEST_ID_REQUIRED.code());
        var content = PrototypeCanonical.of(sourceRef, title, body, acceptance);
        var version = new PrototypeVersion(UUID.randomUUID(), requestId, content.sourceRef(), content.title(), content.body(),
                content.acceptance(), content.hash(), Instant.now().truncatedTo(ChronoUnit.MICROS));
        versions.insert(version);
        var stored = publication(requestId);
        if (!stored.contentHash().equals(content.hash()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, ResourceErrors.PUBLICATION_REQUEST_CONTENT_CONFLICT.code());
        return stored;
    }

    public PrototypeVersion publication(UUID requestId) {
        return versions.request(requestId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, ResourceErrors.PUBLICATION_NOT_FOUND.code()));
    }

    @Override
    public PrototypeVersion find(UUID id) {
        return versions.find(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, ResourceErrors.PROTOTYPE_VERSION_NOT_FOUND.code()));
    }

    public List<PrototypeVersion> list(String sourceRef) {
        if (!"builder-alpha".equals(sourceRef) && !"builder-beta".equals(sourceRef)) {
            throw new IllegalArgumentException(ResourceErrors.PROTOTYPE_SOURCE_INVALID.code());
        }
        return versions.list(sourceRef);
    }

    public PrototypeDelivery deliver(UUID versionId) {
        SemanticPrototype.require(find(versionId).body());
        try {
            var created = new PrototypeDelivery(UUID.randomUUID(), versionId, Instant.now().truncatedTo(ChronoUnit.MICROS));
            deliveries.insert(created);
            return created;
        } catch (DuplicateKeyException conflict) {
            if (!namesOneDelivery(conflict)) throw conflict;
            return deliveries.findByVersion(versionId).orElseThrow(() -> conflict);
        } catch (DataAccessException failure) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, CommonErrors.DATA_SERVICE_UNAVAILABLE.code());
        }
    }

    private static boolean namesOneDelivery(DuplicateKeyException conflict) {
        var text = conflict.getMessage();
        var cause = conflict.getMostSpecificCause() == null ? null : conflict.getMostSpecificCause().getMessage();
        return (text != null && text.contains(ONE_DELIVERY)) || (cause != null && cause.contains(ONE_DELIVERY));
    }
}
