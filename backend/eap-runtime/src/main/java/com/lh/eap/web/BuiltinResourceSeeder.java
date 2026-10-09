package com.lh.eap.web;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Publishes the experts shipped with the platform into {@code eap.expert_definition}.
 *
 * <p>This removes the previous special-casing that made the built-in SQL expert a hard-wired branch in
 * four different services. A shipped expert is now just a row with {@code builtin = true}: it goes
 * through the exact same lookup, grant and execution path as an operator-authored expert, so there is
 * only one code path to reason about.
 *
 * <p>The refresh is deliberately conservative: an existing row is updated only while it is still
 * marked builtin, so an operator who copies and edits an expert never gets their work overwritten.
 */
@Component
public class BuiltinResourceSeeder implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(BuiltinResourceSeeder.class);

    private final JdbcTemplate jdbc;

    public BuiltinResourceSeeder(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Override
    public void run(ApplicationArguments args) {
        for (var entry : resources("classpath*:experts/*.json").entrySet()) {
            var manifest = ExpertManifest.parse(entry.getValue());
            jdbc.update("""
                    INSERT INTO eap.expert_definition(id,name,manifest,builtin,enabled)
                    VALUES (?,?,?::jsonb,true,true)
                    ON CONFLICT(id) DO UPDATE SET
                        name = excluded.name,
                        manifest = excluded.manifest,
                        revision = eap.expert_definition.revision + CASE WHEN eap.expert_definition.manifest IS DISTINCT FROM excluded.manifest THEN 1 ELSE 0 END,
                        updated_at = now()
                    WHERE eap.expert_definition.builtin
                    """, manifest.id(), manifest.name(), entry.getValue());
            log.info("Builtin expert published: {} ({})", manifest.id(), entry.getKey());
        }
    }

    private static Map<String, String> resources(String location) {
        var result = new TreeMap<String, String>();
        try {
            var resources = new PathMatchingResourcePatternResolver(BuiltinResourceSeeder.class.getClassLoader())
                    .getResources(location);
            for (Resource resource : resources) {
                try (var stream = resource.getInputStream()) {
                    result.put(String.valueOf(resource.getFilename()),
                            new String(stream.readAllBytes(), StandardCharsets.UTF_8));
                }
            }
        } catch (IOException error) {
            throw new IllegalStateException("内置专家定义无法读取", error);
        }
        return result;
    }
}
