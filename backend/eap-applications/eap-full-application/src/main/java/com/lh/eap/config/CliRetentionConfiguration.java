package com.lh.eap.config;

import com.lh.eap.api.CliExecution.Retention;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;

/** Policy only. No scheduled deletion or filesystem side effects. */
@Configuration
public class CliRetentionConfiguration {
    @Bean Retention cliRetention(
            @Value("${eap.cli.retention.metadata-days:30}") long metadata,
            @Value("${eap.cli.retention.log-days:7}") long logs,
            @Value("${eap.cli.retention.artifact-days:7}") long artifacts) {
        return new Retention(Duration.ofDays(metadata),Duration.ofDays(logs),Duration.ofDays(artifacts));
    }
}
