package com.lh.eap.application.service;

import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MissionExecutionRecovery {
    @Bean
    ApplicationRunner markUnknownBoardVerifications(BoardVerificationService verification) {
        return args -> verification.markRestartUnknown();
    }

    @Bean
    ApplicationRunner markUnknownMissionExecutions(MissionGitExecutionService executions) {
        return args -> executions.markRestartUnknown();
    }
}
