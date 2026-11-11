package com.lh.eap.web.controller;

import com.lh.eap.delivery.SourceWriteReview;
import com.lh.eap.error.CodeErrors;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/board/source-write-reviews")
public class SourceWriteReviewController {
    private final SourceWriteReview review;

    public SourceWriteReviewController(SourceWriteReview review) { this.review = review; }

    @GetMapping
    public List<SourceWriteReview.Item> list() { return review.list(); }

    @GetMapping("/{id}")
    public SourceWriteReview.Detail inspect(@PathVariable UUID id) { return review.inspect(id); }

    @PostMapping("/{id}/close")
    public SourceWriteReview.Detail close(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        if (!body.keySet().equals(Set.of("requestId", "digest", "note", "confirmed"))
                || !(body.get("requestId") instanceof String requestId)
                || !(body.get("digest") instanceof String digest)
                || !(body.get("note") instanceof String note)
                || !Boolean.TRUE.equals(body.get("confirmed"))) throw invalid();
        UUID request;
        try {
            request = UUID.fromString(requestId);
            if (!request.toString().equals(requestId)) throw invalid();
        } catch (IllegalArgumentException invalid) {
            throw invalid();
        }
        return review.close(id, new SourceWriteReview.Close(request, digest, note, true));
    }

    private static IllegalArgumentException invalid() {
        return new IllegalArgumentException(CodeErrors.INVALID_CODE_REVIEW.code());
    }
}
