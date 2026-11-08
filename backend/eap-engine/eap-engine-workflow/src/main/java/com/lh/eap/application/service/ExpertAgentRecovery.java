package com.lh.eap.application.service;

import com.lh.eap.core.ExpertAgentJournal;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.*;

@Configuration
public class ExpertAgentRecovery {
    @Bean ApplicationRunner recoverExpertAgents(ExpertAgentJournal journal, ExpertAgentApprovalService approvals) {
        return args -> { journal.recoverExpired(); approvals.recoverInterruptedApprovals(); };
    }
}
