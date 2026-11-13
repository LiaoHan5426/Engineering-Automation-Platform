package com.lh.eap.config;
import com.lh.eap.ai.AiChatApplication;
import com.lh.eap.ai.AiConnectionStatus;
import com.lh.eap.ai.AiConversationRegistry;
import com.lh.eap.ai.ChatExecutionJournal;
import com.lh.eap.ai.ChatGptLogin;
import com.lh.eap.ai.ChatGptOAuthProtocol;
import com.lh.eap.ai.EngineeringAiConfiguration;
import com.lh.eap.ai.ExpertKnowledgeContextService;
import com.lh.eap.ai.FileWorkingMemoryStore;
import com.lh.eap.ai.ModelConnections;
import com.lh.eap.ai.ModelDiscovery;
import com.lh.eap.ai.SpringAiModelClientSource;
import com.lh.eap.ai.SqlExpertAgentScheduler;
import com.lh.eap.ai.SqlExpertAgentService;
import com.lh.eap.application.service.BoardApplicationEvidence;
import com.lh.eap.application.service.BoardCodeProposalService;
import com.lh.eap.application.service.BoardCodeTaskBinding;
import com.lh.eap.application.service.BoardDeliveryCapture;
import com.lh.eap.application.service.BoardDeliveryService;
import com.lh.eap.application.service.BoardPrototypeService;
import com.lh.eap.application.service.BoardReviewService;
import com.lh.eap.application.service.BoardRunService;
import com.lh.eap.application.service.BoardRuntimeService;
import com.lh.eap.application.service.BoardTaskService;
import com.lh.eap.application.service.BoardVerificationPlanSupport;
import com.lh.eap.application.service.BoardVerificationService;
import com.lh.eap.application.service.BoardVerificationSource;
import com.lh.eap.application.service.CapabilityCatalog;
import com.lh.eap.application.service.CapabilitySettings;
import com.lh.eap.application.service.CliProgramService;
import com.lh.eap.application.service.DatabaseProfileService;
import com.lh.eap.application.service.ExpertAgentApprovalService;
import com.lh.eap.application.service.ExpertAgentRecovery;
import com.lh.eap.application.service.ExpertDefinitionService;
import com.lh.eap.application.service.ExpertExecutionService;
import com.lh.eap.application.service.ExpertManagementService;
import com.lh.eap.application.service.GitReviewCapture;
import com.lh.eap.application.service.HandoffService;
import com.lh.eap.application.service.JdbcCliChannelStore;
import com.lh.eap.application.service.KnowledgeManagementService;
import com.lh.eap.application.service.McpServerService;
import com.lh.eap.application.service.MissionExecutionRecovery;
import com.lh.eap.application.service.MissionGitExecutionService;
import com.lh.eap.application.service.MissionService;
import com.lh.eap.application.service.PrototypeVersionService;
import com.lh.eap.application.service.RulePackManagementService;
import com.lh.eap.application.service.RuntimeDataLayoutService;
import com.lh.eap.application.service.ScenarioService;
import com.lh.eap.application.service.SqlExpertAnalysisPolicy;
import com.lh.eap.application.service.SqlExpertService;
import com.lh.eap.application.service.TaskService;
import com.lh.eap.application.service.ToolExecutionService;
import com.lh.eap.application.service.TrustedToolCatalogService;
import com.lh.eap.application.service.WorkflowExpertAgentAccess;
import com.lh.eap.application.service.WorkflowExpertKnowledgeAccess;
import com.lh.eap.core.ExpertAnalysisPolicyResolver;
import com.lh.eap.core.ExpertBehaviorCatalog;
import com.lh.eap.decision.RuleBasedDecisionProvider;
import com.lh.eap.delivery.CapabilityDirtyRunner;
import com.lh.eap.delivery.CodeChangeService;
import com.lh.eap.delivery.SourceWriteReview;
import com.lh.eap.delivery.CodeVerificationProperties;
import com.lh.eap.delivery.CodeVerificationService;
import com.lh.eap.delivery.JdbcCodeGenerationStore;
import com.lh.eap.delivery.JdbcCodeProposalStore;
import com.lh.eap.domain.model.ExpertBehaviorBinding;
import com.lh.eap.llm.LlmGateway;
import com.lh.eap.llm.OpenAiCompatibleProvider;
import com.lh.eap.llm.PromptPreprocessor;
import com.lh.eap.persistence.mapper.CapabilityUsage;
import com.lh.eap.persistence.mapper.CliProgramMapper;
import com.lh.eap.persistence.mapper.DatabaseProfileMapper;
import com.lh.eap.persistence.mapper.ExpertDefinitionMapper;
import com.lh.eap.persistence.mapper.JdbcExpertAgentJournal;
import com.lh.eap.persistence.mapper.JdbcHandoffStore;
import com.lh.eap.persistence.mapper.JdbcMissionExecutionStore;
import com.lh.eap.persistence.mapper.JdbcMissionStore;
import com.lh.eap.persistence.mapper.JdbcPrototypeDeliveryStore;
import com.lh.eap.persistence.mapper.JdbcPrototypeVersionStore;
import com.lh.eap.persistence.mapper.JdbcToolExecutionStore;
import com.lh.eap.persistence.mapper.KnowledgeManagementMapper;
import com.lh.eap.persistence.mapper.KnowledgeRepository;
import com.lh.eap.persistence.mapper.McpServerRegistry;
import com.lh.eap.persistence.mapper.RulePackMapper;
import com.lh.eap.persistence.mapper.TaskRepository;
import com.lh.eap.rules.RulePackService;
import com.lh.eap.runtime.handler.CapabilityHandler;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import com.lh.eap.runtime.handler.CliOperationHandler;
import com.lh.eap.runtime.handler.DatabaseExplainHandler;
import com.lh.eap.runtime.handler.DatabaseMetadataHandler;
import com.lh.eap.runtime.handler.GitInspectionHandler;
import com.lh.eap.runtime.handler.KnowledgeSearchHandler;
import com.lh.eap.runtime.handler.McpReadonlyHandler;
import com.lh.eap.runtime.handler.SqlKnowledgeQueryEnricher;
import com.lh.eap.runtime.handler.SqlParseHandler;
import com.lh.eap.runtime.handler.WorkspaceSearchHandler;
import com.lh.eap.runtime.mcp.McpSessionRegistry;
import com.lh.eap.runtime.mcp.client.McpClientService;
import com.lh.eap.skill.SkillController;
import com.lh.eap.skill.SkillService;
import com.lh.eap.skill.SkillTextParser;
import com.lh.eap.web.AiBrowserRequestGuard;
import com.lh.eap.web.controller.AiChatController;
import com.lh.eap.web.controller.ApiErrorHandler;
import com.lh.eap.web.controller.BoardCodeProposalController;
import com.lh.eap.web.controller.SourceWriteReviewController;
import com.lh.eap.web.controller.BoardDeliveryController;
import com.lh.eap.web.controller.BoardPrototypeController;
import com.lh.eap.web.controller.BoardReviewController;
import com.lh.eap.web.controller.BoardRunController;
import com.lh.eap.web.controller.BoardRuntimeController;
import com.lh.eap.web.controller.BoardTaskController;
import com.lh.eap.web.controller.BoardVerificationController;
import com.lh.eap.web.controller.CapabilityManagementController;
import com.lh.eap.web.controller.ChatGptLoginController;
import com.lh.eap.web.controller.CliExecutionController;
import com.lh.eap.web.controller.CliProgramController;
import com.lh.eap.web.controller.DatabaseInfoController;
import com.lh.eap.web.controller.ExpertAgentQueueController;
import com.lh.eap.web.controller.ExpertController;
import com.lh.eap.web.controller.ExpertExecutionController;
import com.lh.eap.web.controller.HandoffController;
import com.lh.eap.web.controller.KnowledgeController;
import com.lh.eap.web.controller.McpManagementController;
import com.lh.eap.web.controller.MissionController;
import com.lh.eap.web.controller.MissionExecutionController;
import com.lh.eap.web.controller.PrototypeVersionController;
import com.lh.eap.web.controller.RulePackController;
import com.lh.eap.web.controller.RuntimeController;
import com.lh.eap.web.controller.RuntimeDataController;
import com.lh.eap.web.controller.ScenarioController;
import com.lh.eap.web.controller.SqlExpertAgentController;
import com.lh.eap.web.controller.SqlExpertController;
import com.lh.eap.web.controller.ToolExecutionController;
import com.lh.eap.web.controller.WorkspaceFilesController;
import com.lh.eap.web.i18n.PlatformMessagesConfiguration;
import com.lh.eap.web.i18n.ProblemResponses;
import java.util.List;
import java.util.Set;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;

import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

/** Explicit full product composition; adding a jar alone never activates its components here. */
@Configuration(proxyBeanMethods = false)
@Import({
    PlatformMessagesConfiguration.class,
    ProblemResponses.class,
    ToolExecutionService.class,
    JdbcToolExecutionStore.class,
    ToolExecutionController.class,
    SqlExpertAnalysisPolicy.class,
    WorkflowExpertKnowledgeAccess.class,
    SqlKnowledgeQueryEnricher.class,
    AiChatApplication.class,
    com.lh.eap.ai.TaskDescriptionOptimizer.class,
    com.lh.eap.web.controller.TaskDescriptionOptimizationController.class,
    AiConnectionStatus.class,
    AiConversationRegistry.class,
    ChatExecutionJournal.class,
    ChatGptLogin.class,
    ChatGptOAuthProtocol.class,
    EngineeringAiConfiguration.class,
    ExpertKnowledgeContextService.class,
    FileWorkingMemoryStore.class,
    ModelConnections.class,
    ModelDiscovery.class,
    SpringAiModelClientSource.class,
    com.lh.eap.application.service.BoardApplicationBaseline.class,
    BoardApplicationEvidence.class,
    BoardCodeTaskBinding.class,
    BoardCodeProposalService.class,
    BoardDeliveryCapture.class,
    BoardDeliveryService.class,
    BoardPrototypeService.class,
    BoardReviewService.class,
    BoardRunService.class,
    BoardTaskService.class,
    BoardRuntimeService.class,
    BoardVerificationPlanSupport.class,
    BoardVerificationService.class,
    BoardVerificationSource.class,
    CapabilityCatalog.class,
    CapabilitySettings.class,
    JdbcCliChannelStore.class,
    CliProgramService.class,
    DatabaseProfileService.class,
    ExpertDefinitionService.class,
    ExpertExecutionService.class,
    ExpertManagementService.class,
    GitReviewCapture.class,
    HandoffService.class,
    KnowledgeManagementService.class,
    McpServerService.class,
    MissionExecutionRecovery.class,
    MissionGitExecutionService.class,
    MissionService.class,
    PrototypeVersionService.class,
    RulePackManagementService.class,
    RuntimeDataLayoutService.class,
    ScenarioService.class,
    SqlExpertService.class,
    TaskService.class,
    TrustedToolCatalogService.class,
    BuiltinResourceSeeder.class,
    CliRetentionConfiguration.class,
    RuntimeConfiguration.class,
    WebConfiguration.class,
    RuleBasedDecisionProvider.class,
    CapabilityDirtyRunner.class,
    CodeChangeService.class,
    SourceWriteReview.class,
    CodeVerificationProperties.class,
    CodeVerificationService.class,
    JdbcCodeGenerationStore.class,
    JdbcCodeProposalStore.class,
    LlmGateway.class,
    OpenAiCompatibleProvider.class,
    PromptPreprocessor.class,
    CapabilityUsage.class,
    CliProgramMapper.class,
    DatabaseProfileMapper.class,
    ExpertDefinitionMapper.class,
    JdbcHandoffStore.class,
    JdbcMissionExecutionStore.class,
    JdbcMissionStore.class,
    JdbcPrototypeDeliveryStore.class,
    JdbcPrototypeVersionStore.class,
    KnowledgeManagementMapper.class,
    KnowledgeRepository.class,
    McpServerRegistry.class,
    RulePackMapper.class,
    TaskRepository.class,
    RulePackService.class,
    CliOperationHandler.class,
    DatabaseExplainHandler.class,
    DatabaseMetadataHandler.class,
    GitInspectionHandler.class,
    KnowledgeSearchHandler.class,
    McpReadonlyHandler.class,
    SqlParseHandler.class,
    WorkspaceSearchHandler.class,
    McpSessionRegistry.class,
    McpClientService.class,
    SkillController.class,
    SkillService.class,
    SkillTextParser.class,
    AiBrowserRequestGuard.class,
    AiChatController.class,
    ApiErrorHandler.class,
    BoardDeliveryController.class,
    BoardCodeProposalController.class,
    SourceWriteReviewController.class,
    BoardPrototypeController.class,
    BoardReviewController.class,
    BoardRunController.class,
    BoardTaskController.class,
    BoardRuntimeController.class,
    BoardVerificationController.class,
    CapabilityManagementController.class,
    ChatGptLoginController.class,
    CliExecutionController.class,
    CliProgramController.class,
    DatabaseInfoController.class,
    ExpertController.class,
    ExpertExecutionController.class,
    HandoffController.class,
    KnowledgeController.class,
    McpManagementController.class,
    MissionController.class,
    MissionExecutionController.class,
    PrototypeVersionController.class,
    RulePackController.class,
    RuntimeController.class,
    RuntimeDataController.class,
    ScenarioController.class,
    SqlExpertController.class,
    WorkspaceFilesController.class,
    WorkflowExpertAgentAccess.class,
    JdbcExpertAgentJournal.class,
    ExpertAgentApprovalService.class,
    ExpertAgentRecovery.class,
    SqlExpertAgentService.class,
    SqlExpertAgentScheduler.class,
    ExpertAgentQueueController.class,
    SqlExpertAgentController.class
})
public class FullApplicationConfiguration {
    /** Legacy manifests use SQL v1; explicit bindings must match an installed behavior version. */
    @Bean
    @ConditionalOnMissingBean(ExpertAnalysisPolicyResolver.class)
    ExpertAnalysisPolicyResolver expertAnalysisPolicyResolver(
            SqlExpertAnalysisPolicy sqlPolicy) {
        var binding = new ExpertBehaviorBinding("sql-analysis", 1);
        return new ExpertBehaviorCatalog(List.of(
                new ExpertBehaviorCatalog.Registration(binding, "SQL 专业分析", sqlPolicy),
                new ExpertBehaviorCatalog.Registration(SqlExpertAgentService.BINDING,
                        "SQL 只读取证 Agent", sqlPolicy, "agent", SqlExpertAgentService.TOOLS, Set.of("sql.parse"))));
    }

    @Bean
    CapabilityHandlerRegistry capabilityHandlerRegistry(
            List<CapabilityHandler> handlers,
            CapabilitySettings settings) {
        return new CapabilityHandlerRegistry(handlers, settings);
    }

}
