package com.lh.eap.application.service;

import com.lh.eap.core.BoardCodeProposalStore;
import com.lh.eap.core.BoardDeliveryStore;
import com.lh.eap.core.BoardRunStore;
import com.lh.eap.core.CapabilityUsageQuery;
import com.lh.eap.delivery.CodeGenerationStoreAdapter;
import com.lh.eap.delivery.CodeProposalStoreAdapter;
import com.lh.eap.persistence.jdbc.JdbcCodeGenerationStore;
import com.lh.eap.persistence.jdbc.JdbcCodeProposalStore;
import com.lh.eap.persistence.jdbc.JdbcPrototypeVersionStore;
import org.springframework.transaction.PlatformTransactionManager;
import com.lh.eap.persistence.jdbc.JdbcBoardCodeProposalStore;
import com.lh.eap.persistence.jdbc.JdbcBoardDeliveryStore;
import com.lh.eap.persistence.jdbc.JdbcBoardRunStore;
import com.lh.eap.persistence.jdbc.JdbcBoardTaskStore;
import com.lh.eap.persistence.jdbc.JdbcBoardVerificationStore;
import com.lh.eap.persistence.jdbc.JdbcCapabilitySettingsStore;
import com.lh.eap.persistence.jdbc.JdbcPrototypeDeliveryStore;
import com.lh.eap.persistence.jdbc.JdbcPrototypeVersionStore;
import com.lh.eap.persistence.jdbc.JdbcWorkspaceLockStore;
import org.springframework.jdbc.core.JdbcTemplate;

/** Explicit test-only composition for P4 services that no longer construct adapters themselves. */
public final class P4TestWiring {
    private P4TestWiring() {}

    public static BoardTaskService tasks(JdbcTemplate jdbc) {
        var versions = new PrototypeVersionService(new JdbcPrototypeVersionStore(jdbc), new JdbcPrototypeDeliveryStore(jdbc));
        return new BoardTaskService(new JdbcBoardTaskStore(jdbc), versions, new WorkspaceInterlock(new JdbcWorkspaceLockStore(jdbc)));
    }

    public static CapabilitySettings settings(JdbcTemplate jdbc, CapabilityUsageQuery usage) {
        return new CapabilitySettings(new JdbcCapabilitySettingsStore(jdbc), usage);
    }

    public static JdbcBoardVerificationStore verificationStore(JdbcTemplate jdbc) {
        return new JdbcBoardVerificationStore(jdbc);
    }

    public static BoardCodeProposalStore codeProposalStore(JdbcTemplate jdbc) {
        return new JdbcBoardCodeProposalStore(jdbc);
    }

    public static BoardRunStore runStore(JdbcTemplate jdbc) {
        return new JdbcBoardRunStore(jdbc);
    }

    public static BoardDeliveryStore deliveryStore(JdbcTemplate jdbc) {
        return new JdbcBoardDeliveryStore(jdbc);
    }

    public static CodeGenerationStoreAdapter generations(JdbcTemplate jdbc, PlatformTransactionManager manager) {
        return new CodeGenerationStoreAdapter(new JdbcCodeGenerationStore(jdbc, manager, new JdbcWorkspaceLockStore(jdbc)),
                new BoardCodeTaskBinding(tasks(jdbc), new JdbcPrototypeVersionStore(jdbc)));
    }

    public static CodeProposalStoreAdapter proposals(JdbcTemplate jdbc, PlatformTransactionManager manager,
                                                      BoardApplicationBaseline baseline) {
        return proposals(jdbc, manager, baseline,
                new BoardCodeTaskBinding(tasks(jdbc), new JdbcPrototypeVersionStore(jdbc)));
    }

    public static CodeProposalStoreAdapter proposals(JdbcTemplate jdbc, PlatformTransactionManager manager,
                                                      BoardApplicationBaseline baseline, BoardCodeTaskBinding binding) {
        var locks = new JdbcWorkspaceLockStore(jdbc);
        var evidence = new JdbcCodeGenerationStore(jdbc, manager, locks);
        var generations = new CodeGenerationStoreAdapter(evidence, binding);
        return new CodeProposalStoreAdapter(new JdbcCodeProposalStore(jdbc, manager, locks, evidence),
                generations, generations, baseline);
    }
}
