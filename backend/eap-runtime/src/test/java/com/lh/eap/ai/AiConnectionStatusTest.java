package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.capability.GitCapability;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.core.CapabilityRegistry;
import com.lh.eap.core.DefaultProcessExecutor;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import com.lh.eap.runtime.handler.GitInspectionHandler;
import java.nio.file.Files;
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

    @Test void disabledDoesNotBecomeAvailableAndDoesNotNeedAModelCall() throws Exception {
        var status = status("none", false, null);
        assertEquals("disabled", status.read().state());
        status.observe("");
        assertEquals("disabled", status.read().state());
        assertNull(status.read().lastObservedAt());
        assertFalse(status.read().workspaceLabel().contains(root.toString()));
        assertEquals(root.toRealPath().toString(), status.read().workspacePath());
        assertEquals("", status.read().authorizedRootPath());
        assertEquals("AUTHORIZED_ROOT_MISSING", status.read().authorizedRootDenial());
        assertFalse(status.read().storesUserDirectoryGrants());
        assertFalse(status.read().configurationRevision().isBlank());
    }

    @Test void authorizedRootIsSeparateFromWorkspaceLabel(@TempDir Path other) throws Exception {
        var status = status("openai", true, root);
        var snapshot = status.read();
        assertEquals(root.toRealPath().toString(), snapshot.workspacePath());
        assertEquals(root.toRealPath().toString(), snapshot.authorizedRootPath());
        assertEquals("", snapshot.authorizedRootDenial());
        assertFalse(snapshot.storesUserDirectoryGrants());
        assertFalse(snapshot.workspaceLabel().contains(root.toString()));
        var conflict = new AiConnectionStatus(new CapabilityHandlerRegistry(List.of()), root, null, "ROOT_CONFLICT",
                "none", "", "", false, null);
        assertEquals("ROOT_CONFLICT", conflict.read().authorizedRootDenial());
        assertEquals("", conflict.read().authorizedRootPath());
        assertFalse(conflict.read().storesUserDirectoryGrants());
        assertNotEquals(other.toString(), conflict.read().workspacePath());
    }

    @Test void snapshotNeverClaimsServerStoresUserDirectoryGrants() {
        assertFalse(status("none", false, null).read().storesUserDirectoryGrants());
        assertFalse(status("openai", true, root).read().storesUserDirectoryGrants());
    }

    @Test void snapshotReportsVerificationConfigWithoutClaimingChecksRan() {
        var off = status("none", false, null).read();
        assertFalse(off.verificationEnabled());
        assertTrue(off.verificationCommands().isEmpty());
        var props = new CodeVerificationProperties();
        props.setEnabled(true);
        var command = new CodeVerificationProperties.Command();
        command.setName("git-version");
        command.setRun(List.of("git", "--version"));
        props.setCommands(List.of(command));
        var on = new AiConnectionStatus(new CapabilityHandlerRegistry(List.of()), root, root, "",
                "none", "", "", false, null, props).read();
        assertTrue(on.verificationEnabled());
        assertEquals(List.of("git-version"), on.verificationCommands());
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

    @Test void sharedRootDecisionDrivesChatGitAvailability(@TempDir Path other) throws Exception {
        var handlers = new CapabilityHandlerRegistry(List.of(new GitInspectionHandler(
                new CapabilityRegistry().register(new GitCapability("status")), new DefaultProcessExecutor())));
        assertFalse(chat(handlers, new RuntimeWorkspace(root, " ", "")).gitStatusAvailable());
        assertTrue(chat(handlers, new RuntimeWorkspace(root, "", root.toString())).gitStatusAvailable());
        var nested = Files.createDirectory(root.resolve("repo"));
        assertFalse(chat(handlers, new RuntimeWorkspace(root, nested.toString(), other.toString())).gitStatusAvailable());
    }

    private AiConnectionStatus chat(CapabilityHandlerRegistry handlers, RuntimeWorkspace runtime) {
        return new AiConnectionStatus(handlers, runtime.workspace(),
                runtime.root().allowed() ? runtime.root().path() : null,
                runtime.root().allowed() ? "" : runtime.root().denial(),
                "none", "", "", false, null);
    }

    @Test void revisionIgnoresUserinfoAndApiKeyMaterial() {
        assertEquals(AiConnectionStatus.revision("openai", "m", "https://user:sk-secret@api.openai.com/v1", true),
                AiConnectionStatus.revision("openai", "m", "https://api.openai.com/v1", true));
        assertNotEquals(AiConnectionStatus.revision("openai", "m", "https://api.openai.com/v1", true),
                AiConnectionStatus.revision("openai", "other", "https://api.openai.com/v1", true));
    }
}
