package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class AiConnectionStatusTest {
    @TempDir Path root;

    AiConnectionStatus status(String provider, boolean modelPresent, Path authorized) {
        return new AiConnectionStatus(new CapabilityHandlerRegistry(List.of()), root, authorized,
                provider, "offline-model", "https://api.openai.com", modelPresent);
    }

    @Test void disabledDoesNotBecomeAvailableAndDoesNotNeedAModelCall() {
        var status = status("none", false, null);
        assertEquals("disabled", status.read().state());
        status.observe("");
        assertEquals("disabled", status.read().state());
        assertNull(status.read().lastObservedAt());
        assertFalse(status.read().workspaceLabel().contains(root.toString()));
        assertFalse(status.read().configurationRevision().isBlank());
    }

    @Test void missingModelBeanIsNotConfigured() {
        assertEquals("not_configured", status("openai", false, null).read().state());
    }

    @Test void configuredModelStaysUnverifiedUntilARealCall() {
        var status = status("openai", true, null);
        assertEquals("configured_unverified", status.read().state());
        status.observe("TOOL_PERMISSION_DENIED");
        assertEquals("available", status.read().state());
        assertEquals("", status.read().errorCode());
    }

    @Test void providerFailureIsErrorAndConfigurationChangeDropsIt() {
        var status = status("openai", true, null);
        status.observe("AI_RATE_LIMITED");
        assertEquals("error", status.read().state());
        assertEquals("AI_RATE_LIMITED", status.read().errorCode());
        status.observe("AI_NOT_CONFIGURED");
        assertEquals("error", status.read().state());
        String previous = status.read().configurationRevision();
        status.replaceConfiguration("openai", "other-model", "https://user:secret@api.openai.com/v1", true);
        var next = status.read();
        assertEquals("configured_unverified", next.state());
        assertNull(next.lastObservedAt());
        assertNotEquals(previous, next.configurationRevision());
        assertEquals(AiConnectionStatus.revision("openai", "other-model", "https://api.openai.com/v1", false),
                next.configurationRevision());
    }

    @Test void revisionIgnoresUserinfoAndApiKeyMaterial() {
        assertEquals(AiConnectionStatus.revision("openai", "m", "https://user:sk-secret@api.openai.com/v1", true),
                AiConnectionStatus.revision("openai", "m", "https://api.openai.com/v1", true));
        assertNotEquals(AiConnectionStatus.revision("openai", "m", "https://api.openai.com/v1", true),
                AiConnectionStatus.revision("openai", "other", "https://api.openai.com/v1", true));
    }
}
