package com.lh.eap.ai;
import com.lh.eap.common.SensitiveData;
import java.util.Set;
import com.lh.eap.error.ProtocolErrors;
import com.lh.eap.error.SecurityErrors;
import com.lh.eap.error.ToolErrors;

import com.lh.eap.knowledge.ExpertKnowledgeAccess;
import com.lh.eap.domain.model.CapabilityContext;
import com.lh.eap.domain.model.ExpertManifest;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** One authorized read, not an expert graph run or a model tool. */
@Service
public class ExpertKnowledgeContextService {
    public record Reference(String id, String source, String knowledgeBase, String excerpt, String retrievalMode) {}
    public record Context(KnowledgeExpertRef expertRef, String status, List<Reference> references) {}
    private final ExpertKnowledgeAccess access;
    private final CapabilityHandlerRegistry capabilities;

    public ExpertKnowledgeContextService(ExpertKnowledgeAccess access,
                                        CapabilityHandlerRegistry capabilities) {
        this.access = access;
        this.capabilities = capabilities;
    }

    @Transactional(timeout = 10)
    public Context resolve(KnowledgeExpertRef ref, String query) {
        if (ref == null || query == null || query.isBlank()) throw KnowledgeExpertRef.invalid();
        if (query.length() > 500) throw failure(HttpStatus.BAD_REQUEST, ProtocolErrors.QUERY_TOO_LARGE.code());
        var row = access.lockForKnowledge(ref.id()).orElseThrow(() -> failure(HttpStatus.NOT_FOUND, "NOT_FOUND"));
        if (!(row.get("revision") instanceof Number revision) || revision.longValue() != ref.revision())
            throw failure(HttpStatus.CONFLICT, "STALE");
        if (!Boolean.TRUE.equals(row.get("enabled"))) throw failure(HttpStatus.CONFLICT, "DISABLED");
        var manifest = ExpertManifest.parse((String) row.get("manifest"));
        if (!ref.id().equals(manifest.id()) || !ref.id().equals(row.get("id"))) throw failure(HttpStatus.CONFLICT, "STALE");
        var grants = access.knowledgeGrants(ref.id()).stream()
                .filter(id -> manifest.knowledgeBases() != null && manifest.knowledgeBases().contains(id.toString())).toList();
        if (grants.isEmpty()) throw failure(HttpStatus.FORBIDDEN, SecurityErrors.NOT_AUTHORIZED.code());
        var handler = capabilities.resolveFor(manifest, "knowledge.search")
                .orElseThrow(() -> failure(HttpStatus.FORBIDDEN, ToolErrors.CAPABILITY_UNAVAILABLE.code()));
        var evidence = new ArrayList<Map<String,Object>>();
        var context = new CapabilityContext(new ExpertManifest.Step("chat-knowledge", "Knowledge", "knowledge.search", true),
                null, "", query, ref.id(), UUID.randomUUID(), grants, new HashMap<>(), new HashMap<>(),
                new ArrayList<>(), evidence, List.of(), null, Set.of("knowledge.granted", "knowledge.matches"));
        if (!handler.handle(context).success()) throw failure(HttpStatus.SERVICE_UNAVAILABLE, ToolErrors.CAPABILITY_UNAVAILABLE.code());
        // A second READ COMMITTED observation rejects independent grant/settings writes during retrieval.
        // Activation and draft changes also serialize on the definition row above. Never hold this
        // transaction across a model call: revocation cannot recall data after this snapshot is released.
        if (!access.lockForKnowledge(ref.id()).filter(row::equals).isPresent()) throw failure(HttpStatus.CONFLICT, "STALE");
        var liveGrants = access.knowledgeGrants(ref.id()).stream()
                .filter(id -> manifest.knowledgeBases() != null && manifest.knowledgeBases().contains(id.toString())).toList();
        if (!new HashSet<>(grants).equals(new HashSet<>(liveGrants))) throw failure(HttpStatus.FORBIDDEN, SecurityErrors.NOT_AUTHORIZED.code());
        if (capabilities.resolveFor(manifest, "knowledge.search").isEmpty()) throw failure(HttpStatus.FORBIDDEN, ToolErrors.CAPABILITY_UNAVAILABLE.code());
        var references = evidence.stream().limit(5).map(item -> new Reference(item.get("id").toString(),
                bounded(item.get("source"), 500), bounded(item.get("knowledgeBase"), 200), bounded(item.get("excerpt"), 1200),
                bounded(item.get("retrievalMode"), 40))).toList();
        return new Context(ref, references.isEmpty() ? "no_matches" : "ready", references);
    }
    private static ResponseStatusException failure(HttpStatus status, String reason) {
        return new ResponseStatusException(status, "EXPERT_CONTEXT_" + reason);
    }
    private static String bounded(Object value, int limit) {
        var text = SensitiveData.redact(Objects.toString(value, ""));
        return text.substring(0, Math.min(text.length(), limit));
    }
}
