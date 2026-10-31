package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;

import com.lh.eap.config.RuntimeWorkspace;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.web.server.ResponseStatusException;

class CodeChangeBoundaryTest {
    @TempDir Path root;

    private CodeChangeService service() {
        return new CodeChangeService(new RuntimeWorkspace(root, root.toString(), ""));
    }

    private static String candidate(String path) {
        return "{\"files\":[{\"path\":\"" + path + "\",\"content\":\"updated\"}]}";
    }

    @Test void protectedNamesCannotBeBypassedWithCaseOrWindowsTrailingAliases() {
        var changes = service();
        for (String path : List.of("frontend/Package.json", "NODE_MODULES/entry.ts", "src/TARGET/entry.ts",
                "Dist/entry.ts", "node_modules /entry.ts", "src./entry.ts", "src/entry.ts ")) {
            assertThrows(ResponseStatusException.class, () -> changes.propose(UUID.randomUUID(), candidate(path)), path);
            assertFalse(changes.inspectSource(path).denial().isBlank(), path);
            assertFalse(changes.inspectBaseline(path).denial().isBlank(), path);
        }
    }

    @Test void onePhysicalFileCannotAppearTwiceInAProposal() throws Exception {
        Path original = root.resolve("original.ts");
        Files.writeString(original, "before");
        Path alias = root.resolve("alias.ts");
        Files.createLink(alias, original);
        var changes = service();
        var failure = assertThrows(ResponseStatusException.class, () -> changes.propose(UUID.randomUUID(),
                "{\"files\":[{\"path\":\"original.ts\",\"content\":\"one\"},{\"path\":\"alias.ts\",\"content\":\"two\"}]}"));
        assertEquals("INVALID_CODE_PROPOSAL", failure.getReason());
        assertEquals("before", Files.readString(original));
    }

    @Test void caseAliasesCannotDuplicateAFileOnCaseInsensitiveFilesystems() throws Exception {
        Path original = root.resolve("source.ts");
        Files.writeString(original, "before");
        Path alias = root.resolve("Source.ts");
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(alias) && Files.isSameFile(original, alias));
        var failure = assertThrows(ResponseStatusException.class, () -> service().propose(UUID.randomUUID(),
                "{\"files\":[{\"path\":\"source.ts\",\"content\":\"one\"},{\"path\":\"Source.ts\",\"content\":\"two\"}]}"));
        assertEquals("INVALID_CODE_PROPOSAL", failure.getReason());
    }

    @Test void applyRetryReplaysFailedVerificationWithoutRewritingOrRerunning() throws Exception {
        var calls = new AtomicInteger();
        var verification = new CodeVerificationService(true, 5,
                List.of(new CodeVerificationService.Spec("typecheck", List.of("test-only"))),
                (workspace, command, timeout) -> {
                    calls.incrementAndGet();
                    return new CodeVerificationService.ProcessResult(7, "typecheck failed");
                });
        var changes = new CodeChangeService(new RuntimeWorkspace(root, root.toString(), ""), verification);
        var conversation = UUID.randomUUID();
        var proposal = changes.propose(conversation, candidate("source.ts"));
        var first = changes.apply(conversation, proposal.id(), true);
        Files.writeString(root.resolve("source.ts"), "later user edit");
        var retry = changes.apply(conversation, proposal.id(), true);
        assertEquals(first, retry);
        assertEquals(7, retry.checks().getFirst().exitCode());
        assertEquals(1, calls.get());
        assertEquals("later user edit", Files.readString(root.resolve("source.ts")));
        assertThrows(ResponseStatusException.class, () -> changes.apply(UUID.randomUUID(), proposal.id(), true));
        assertThrows(ResponseStatusException.class, () -> changes.apply(conversation, proposal.id(), false));
    }
}
