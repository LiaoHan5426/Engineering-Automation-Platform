package com.lh.eap.spring;
import com.lh.eap.web.i18n.PlatformMessagesConfiguration;
import com.lh.eap.web.i18n.ProblemResponses;
import org.springframework.context.MessageSource;
import com.lh.eap.config.WebConfiguration;
import com.lh.eap.web.AiBrowserRequestGuard;
import com.lh.eap.web.controller.ApiErrorHandler;
import com.lh.eap.web.controller.WorkspaceFilesController;
import com.lh.eap.application.service.WorkspaceFilesService;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.*;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@AutoConfiguration(after = EapLocalAutoConfiguration.class)
@ConditionalOnClass(WebConfiguration.class)
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@ConditionalOnProperty(name = "eap.web.enabled", matchIfMissing = true)
public class EapWebAutoConfiguration {
    @Bean @ConditionalOnMissingBean WebConfiguration webConfiguration() { return new WebConfiguration(); }
    @Bean @ConditionalOnMissingBean ProblemResponses problemResponses(MessageSource messages) { return new ProblemResponses(messages); }
    @Bean @ConditionalOnMissingBean(name = "messageSource") MessageSource messageSource() { return PlatformMessagesConfiguration.source(PlatformMessagesConfiguration.COMMON_BASENAME); }
    @Bean @ConditionalOnMissingBean AiBrowserRequestGuard aiBrowserRequestGuard(ProblemResponses problems) { return new AiBrowserRequestGuard(problems); }
    @Bean @ConditionalOnMissingBean ApiErrorHandler apiErrorHandler(ProblemResponses problems) { return new ApiErrorHandler(problems); }
    @Configuration(proxyBeanMethods = false)
    @ConditionalOnClass(WorkspaceFilesController.class)
    @ConditionalOnBean(WorkspaceFilesService.class)
    @ConditionalOnProperty(name = "eap.local.enabled", matchIfMissing = true)
    static class LocalHttp {
        @Bean @ConditionalOnMissingBean WorkspaceFilesController workspaceFilesController(WorkspaceFilesService files) {
            return new WorkspaceFilesController(files);
        }
    }
}
