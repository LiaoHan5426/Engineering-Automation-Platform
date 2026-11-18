package com.lh.eap.web.i18n;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.MessageSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.support.ResourceBundleMessageSource;

/** Resource ownership remains in each domain; the host composes the available bundles. */
@Configuration(proxyBeanMethods = false)
public class PlatformMessagesConfiguration {
    public static final String COMMON_BASENAME = "i18n/common/messages";
    public static final String PRODUCT_BASENAMES = "i18n/common/messages,i18n/chat/messages,i18n/code/messages,i18n/board/messages,i18n/tool/messages,i18n/agent/messages,i18n/model/messages,i18n/mcp/messages,i18n/resource/messages,i18n/knowledge/messages,i18n/database/messages,i18n/rule/messages";

    @Bean
    public MessageSource messageSource(@Value("${eap.web.message-basenames:" + PRODUCT_BASENAMES + "}") String basenames) {
        return source(basenames);
    }

    public static ResourceBundleMessageSource source(String basenames) {
        var source = new ResourceBundleMessageSource();
        source.setBasenames(basenames.split(","));
        source.setDefaultEncoding("UTF-8");
        source.setFallbackToSystemLocale(false);
        source.setDefaultLocale(RequestLanguage.CHINESE);
        source.setUseCodeAsDefaultMessage(false);
        return source;
    }
}
