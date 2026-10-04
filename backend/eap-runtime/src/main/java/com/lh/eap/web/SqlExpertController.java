package com.lh.eap.web;

import org.springframework.web.bind.annotation.*;
import java.util.*;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/api/sql")
public class SqlExpertController {
    private static final Pattern SECRET = Pattern.compile("(?i)(password|passwd|token|secret)\\s*=\\s*'[^']*'");
    private final SqlExpertService expert;
    public SqlExpertController(SqlExpertService expert) { this.expert = expert; }

    @PostMapping("/analyze")
    public Map<String, Object> analyze(@RequestBody SqlRequest request) {
        var sql = request.sql() == null ? "" : request.sql().trim();
        if (sql.isBlank()) return Map.of("status", "invalid", "message", "SQL is required");
        var safe = SECRET.matcher(sql).replaceAll("$1 = '[REDACTED]'");
        var safetyChecks = List.of("Credentials redacted before model invocation.", "Database execution is disabled for this request.");
        var modelAdvice = expert.analyze(safe, safetyChecks);
        var response = new LinkedHashMap<String, Object>();
        var deterministic = DeterministicSqlAnalyzer.analyze(safe);
        response.put("status", modelAdvice.isPresent() ? "analyzed" : "deterministic-analyzed"); response.put("sql", safe); response.put("advice", deterministic.get("suggestions"));
        response.put("deterministicAnalysis", deterministic);
        response.put("expertAdvice", modelAdvice.orElse(null));
        response.put("analysisMode", "local-model-required"); response.put("safety", safetyChecks);
        if (modelAdvice.isEmpty()) response.put("message", "Local model unavailable; deterministic SQL analysis is shown.");
        return response;
    }

    public record SqlRequest(String sql) { }
}
