package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.api.ProcessExecutor;
import com.lh.eap.capability.GitCapability;
import com.lh.eap.core.DefaultProcessExecutor;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;

class BoardDeliveryCaptureTest {
    @TempDir Path repo;
    DefaultProcessExecutor executor = new DefaultProcessExecutor();
    @AfterEach void close() { executor.close(); }
    @Test void capturesRealBaselineAndChangedBytesFromAnIsolatedGitRepository() throws Exception {
        Files.createDirectories(repo.resolve("frontend"));
        Files.writeString(repo.resolve("frontend/source.ts"), "export const value = 1;\n");
        git("init"); git("add", "frontend"); git("-c", "user.name=EAP Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "baseline");
        var head = git("rev-parse", "HEAD").strip();
        Files.writeString(repo.resolve("frontend/source.ts"), "export const value = 2;\n");
        var type = assertDoesNotThrow(() -> Class.forName("com.lh.eap.application.service.BoardDeliveryCapture"), "delivery capture is missing");
        var capture = type.getConstructor(ProcessExecutor.class, BoardVerificationSource.class).newInstance(executor, new BoardVerificationSource());
        var files = type.getMethod("capture", Path.class, GitCapability.class, String.class, BoardVerificationSource.Source.class, List.class)
            .invoke(capture, repo, new GitCapability("status"), head, new BoardVerificationSource().snapshot(repo), List.of("frontend/source.ts"));
        var json = JsonMapper.builder().build().valueToTree(files);
        assertEquals(1, json.size()); assertEquals("export const value = 1;\n", json.get(0).get("before").asText());
        assertEquals("export const value = 2;\n", json.get(0).get("after").asText());
        assertNotEquals(json.get(0).get("beforeHash"), json.get(0).get("afterHash"));
    }
    @Test void normalCrlfCheckoutDoesNotBecomeAnUnselectedChange() throws Exception {
        String head = baseline();
        git("config", "core.autocrlf", "true");
        Files.delete(repo.resolve("frontend/source.ts")); git("checkout", "--", "frontend/source.ts");
        assertEquals("export const value = 1;\r\n", Files.readString(repo.resolve("frontend/source.ts")));
        Files.writeString(repo.resolve("frontend/new.ts"), "export const added = true;\r\n");
        var result = new BoardDeliveryCapture(executor, new BoardVerificationSource()).capture(repo, new GitCapability("status"), head,
            new BoardVerificationSource().snapshot(repo), List.of("frontend/new.ts"));
        assertEquals("frontend/new.ts", result.getFirst().path());
    }
    @Test void trackedLicenseAndUnsupportedExtensionsStayOutsideTheSourceManifest() throws Exception {
        baseline();
        Files.createDirectories(repo.resolve("frontend/tooltip"));
        for (String path : List.of("frontend/tooltip/LICENSE", "frontend/opaque.xyz", "frontend/credentials.json", "frontend/.hidden.ts"))
            Files.writeString(repo.resolve(path), "excluded baseline\n");
        git("add", "frontend"); commit();
        String head = git("rev-parse", "HEAD").strip();
        Files.writeString(repo.resolve("frontend/source.ts"), "real change\n");
        var result = capture(head, "frontend/source.ts");
        assertEquals(1, result.size());
        Files.delete(repo.resolve("frontend/opaque.xyz"));
        assertEquals(1, capture(head, "frontend/source.ts").size());
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"\n", "\r\n"})
    void realEditsRetainRawEvidenceAndVerificationHashes(String eol) throws Exception {
        String head = baseline(); git("config", "core.autocrlf", "true");
        String value = "export const value = 2;" + eol;
        Files.writeString(repo.resolve("frontend/source.ts"), value);
        var source = new BoardVerificationSource().snapshot(repo);
        var file = capture(head, "frontend/source.ts").getFirst();
        assertEquals(value, file.after());
        assertEquals(BoardDeliveryCapture.hash(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)), file.afterHash());
        assertEquals(source.files().getFirst().contentHash(), file.afterHash());
        assertEquals(BoardDeliveryCapture.hash("export const value = 1;\n".getBytes(java.nio.charset.StandardCharsets.UTF_8)), file.beforeHash());
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"--assume-unchanged", "--skip-worktree"})
    void indexFlagsAndCachedMetadataCannotHideUnselectedCurrentEdits(String flag) throws Exception {
        String head = baseline(); git("config", "core.autocrlf", "true");
        Path path = repo.resolve("frontend/source.ts"); var time = Files.getLastModifiedTime(path);
        git("update-index", flag, "frontend/source.ts");
        Files.writeString(path, "export const value = 2;\n"); Files.setLastModifiedTime(path, time);
        Files.writeString(repo.resolve("frontend/new.ts"), "new\n");
        assertEquals("BOARD_DELIVERY_SCOPE_INCOMPLETE", assertThrows(org.springframework.web.server.ResponseStatusException.class,
            () -> capture(head, "frontend/new.ts")).getReason());
        assertEquals(2, capture(head, "frontend/source.ts", "frontend/new.ts").size());
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"-text", "binary"})
    void explicitlyNonTextLineEndingChangesAreRealChanges(String attribute) throws Exception {
        String head = baseline(); git("config", "core.autocrlf", "true");
        Files.writeString(repo.resolve(".gitattributes"), "frontend/source.ts " + attribute + "\n");
        Files.writeString(repo.resolve("frontend/source.ts"), "export const value = 1;\r\n");
        assertEquals("export const value = 1;\r\n", capture(head, "frontend/source.ts").getFirst().after());
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"text", "text=auto", "eol=lf", "eol=crlf", "text=auto eol=lf"})
    void explicitGitTextAttributesNormalizeOnlyForChangeDetection(String attributes) throws Exception {
        String head = baseline(); git("config", "core.autocrlf", "false");
        Files.writeString(repo.resolve(".gitattributes"), "frontend/source.ts " + attributes + "\n");
        Files.writeString(repo.resolve("frontend/source.ts"), "export const value = 1;\r\n");
        Files.writeString(repo.resolve("frontend/new.ts"), "new\n");
        assertEquals(1, capture(head, "frontend/new.ts").size());
    }
    @Test void autocrlfFalseDoesNotEraseLineEndingChanges() throws Exception {
        String head = baseline(); git("config", "core.autocrlf", "false");
        Files.writeString(repo.resolve("frontend/source.ts"), "export const value = 1;\r\n");
        assertEquals(1, capture(head, "frontend/source.ts").size());
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    void blankAutocrlfInspectionUsesGitsTypedBooleanSemantics(boolean valueless) throws Exception {
        baseline();
        Files.writeString(repo.resolve(".git/config"), "\n[core]\n\tautocrlf" + (valueless ? "\n" : " =\n"), StandardOpenOption.APPEND);
        assertEquals("", git("config", "--get", "core.autocrlf").strip());
        var command = assertDoesNotThrow(() -> new GitCapability("status").deliveryConversionCommand("autocrlf-bool", List.of()));
        assertTrue(command.contains("core.fsmonitor=false"));
        assertTrue(command.contains("--no-replace-objects"));
        assertTrue(command.contains("protocol.allow=never"));
        assertEquals(List.of("config", "--type=bool", "--default", "false", "--get", "core.autocrlf"), command.subList(command.indexOf("config"), command.size()));
        var result = executor.runIsolated("fixture", repo, command, GitCapability.environment());
        assertEquals(0, result.exitCode(), result.stderr());
        assertEquals(Boolean.toString(valueless), result.stdout().strip());
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    void blankAutocrlfPreservesExplicitEmptyVersusValuelessChangeDetection(boolean valueless) throws Exception {
        String head = baseline();
        Files.writeString(repo.resolve(".git/config"), "\n[core]\n\tautocrlf" + (valueless ? "\n" : " =\n"), StandardOpenOption.APPEND);
        assertEquals(Boolean.toString(valueless), git("config", "--type=bool", "--get", "core.autocrlf").strip());
        String value = "export const value = 1;\r\n";
        Files.writeString(repo.resolve("frontend/source.ts"), value);
        Files.writeString(repo.resolve("frontend/new.ts"), "new\n");
        if (valueless) {
            assertEquals(1, capture(head, "frontend/new.ts").size());
        } else {
            assertEquals("BOARD_DELIVERY_SCOPE_INCOMPLETE", assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> capture(head, "frontend/new.ts")).getReason());
            var files = capture(head, "frontend/source.ts", "frontend/new.ts");
            assertEquals(2, files.size());
            var changed = files.stream().filter(file -> file.path().equals("frontend/source.ts")).findFirst().orElseThrow();
            assertEquals(value, changed.after());
            assertEquals(BoardDeliveryCapture.hash(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)), changed.afterHash());
        }
    }
    @Test void autoConversionHonorsTheCrlfIndexGuardWithoutTrustingIndexFreshness() throws Exception {
        String head = baseline(); git("config", "core.autocrlf", "false");
        Files.writeString(repo.resolve("frontend/source.ts"), "export const value = 1;\r\n");
        git("add", "frontend/source.ts"); git("config", "core.autocrlf", "true");
        assertTrue(git("ls-files", "--eol", "--", "frontend/source.ts").startsWith("i/crlf"));
        assertEquals(1, capture(head, "frontend/source.ts").size());
    }
    @Test void autoBinaryBytesAreNeverCrlfNormalized() throws Exception {
        baseline(); git("config", "core.autocrlf", "true");
        Files.write(repo.resolve("frontend/image.png"), new byte[] {0, 1, '\n'});
        git("add", "frontend/image.png"); commit(); String head = git("rev-parse", "HEAD").strip();
        Files.writeString(repo.resolve("frontend/source.ts"), "changed\n");
        assertEquals(1, capture(head, "frontend/source.ts").size());
        Files.write(repo.resolve("frontend/image.png"), new byte[] {0, 1, '\r', '\n'});
        assertEquals("BOARD_DELIVERY_SCOPE_INCOMPLETE", assertThrows(org.springframework.web.server.ResponseStatusException.class,
            () -> capture(head, "frontend/source.ts")).getReason());
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"filter=unsafe", "ident", "working-tree-encoding=UTF-16", "crlf", "-crlf", "text=unknown"})
    void unsupportedConversionsFailClosedWithoutExecutingHelpers(String attributes) throws Exception {
        String head = baseline();
        git("config", "filter.unsafe.clean", "echo invoked > helper-ran; cat");
        git("config", "filter.unsafe.process", "echo invoked > helper-ran; exit 1");
        git("config", "filter.unsafe.required", "true");
        Files.writeString(repo.resolve(".gitattributes"), "frontend/source.ts " + attributes + "\n");
        Files.writeString(repo.resolve("frontend/source.ts"), "changed\r\n");
        assertEquals("BOARD_DELIVERY_CONVERSION_UNSUPPORTED", assertThrows(org.springframework.web.server.ResponseStatusException.class,
            () -> capture(head, "frontend/source.ts")).getReason());
        assertFalse(Files.exists(repo.resolve("helper-ran")));
    }
    @Test void diffTextconvAndFsmonitorHelpersAreNotExecuted() throws Exception {
        String head = baseline();
        for (String key : List.of("diff.external", "diff.unsafe.command", "diff.unsafe.textconv", "core.fsmonitor"))
            git("config", key, "echo invoked > helper-ran");
        Files.writeString(repo.resolve(".gitattributes"), "frontend/source.ts diff=unsafe\n");
        Files.writeString(repo.resolve("frontend/source.ts"), "changed\n");
        assertEquals(1, capture(head, "frontend/source.ts").size());
        assertFalse(Files.exists(repo.resolve("helper-ran")));
    }
    @Test void hundredsOfNormalCrlfFilesAreBatchedWithoutChangingTheEvidenceScope() throws Exception {
        baseline(); git("config", "core.autocrlf", "true");
        for (int i = 0; i < 292; i++) Files.writeString(repo.resolve("frontend/normal-" + i + ".ts"), "unchanged\r\n");
        git("add", "frontend"); commit(); String head = git("rev-parse", "HEAD").strip();
        Files.writeString(repo.resolve("frontend/source.ts"), "changed\r\n");
        assertEquals(1, capture(head, "frontend/source.ts").size());
    }
    @Test void inputModeAlsoNormalizesCrlfButUnsupportedAutoControlsFailClosed() throws Exception {
        String head = baseline(); git("config", "core.autocrlf", "input");
        Files.writeString(repo.resolve("frontend/source.ts"), "export const value = 1;\r\n");
        Files.writeString(repo.resolve("frontend/new.ts"), "new\n");
        assertEquals(1, capture(head, "frontend/new.ts").size());
        Files.writeString(repo.resolve("frontend/source.ts"), "escape\u001b\r\n");
        assertEquals("BOARD_DELIVERY_CONVERSION_UNSUPPORTED", assertThrows(org.springframework.web.server.ResponseStatusException.class,
            () -> capture(head, "frontend/source.ts", "frontend/new.ts")).getReason());
    }
    @Test void conversionInspectionCommandsAreBoundedLiteralAndHelperFree() {
        var capability = new GitCapability("status");
        for (String step : List.of("attributes", "index-eol")) {
            var command = capability.deliveryConversionCommand(step, List.of("frontend/a[1].ts"));
            assertTrue(command.contains("--literal-pathspecs"));
            assertTrue(command.contains("core.fsmonitor=false"));
            assertTrue(command.contains("--no-replace-objects"));
            assertTrue(command.contains("protocol.allow=never"));
            assertEquals("frontend/a[1].ts", command.getLast());
            for (String path : List.of("--filters", "frontend/../outside.ts", "frontend/./source.ts", "frontend/a\0b.ts"))
                assertThrows(IllegalArgumentException.class, () -> capability.deliveryConversionCommand(step, List.of(path)));
            assertThrows(IllegalArgumentException.class, () -> capability.deliveryConversionCommand(step, Collections.nCopies(65, "frontend/a.ts")));
        }
        assertThrows(IllegalArgumentException.class, () -> capability.deliveryConversionCommand("clean", List.of("frontend/a.ts")));
    }
    List<BoardDeliveryCapture.File> capture(String head, String... paths) {
        return new BoardDeliveryCapture(executor, new BoardVerificationSource()).capture(repo, new GitCapability("status"), head,
            new BoardVerificationSource().snapshot(repo), List.of(paths));
    }
    void commit() { git("-c", "user.name=EAP Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "fixture"); }
    @Test void rejectsHeadChangesDuringFinalSourceSnapshot() throws Exception {
        String head = baseline(); var source = new BoardVerificationSource().snapshot(repo);
        var racing = org.mockito.Mockito.mock(BoardVerificationSource.class);
        org.mockito.Mockito.when(racing.snapshot(repo)).thenAnswer(call -> { git("-c", "user.name=EAP Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "changed head"); return source; });
        var failure = assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> new BoardDeliveryCapture(executor, racing).requireCurrent(repo, new GitCapability("status"), head, source));
        assertEquals("BOARD_DELIVERY_SOURCE_STALE", failure.getReason());
    }
    @Test void omittedChangedOrDeletedSourceBlocksTheEntireDelivery() throws Exception {
        String head=baseline(); Files.writeString(repo.resolve("frontend/source.ts"),"changed"); Files.writeString(repo.resolve("frontend/other.ts"),"omitted");
        var capture=new BoardDeliveryCapture(executor,new BoardVerificationSource());
        assertEquals("BOARD_DELIVERY_SCOPE_INCOMPLETE",assertThrows(org.springframework.web.server.ResponseStatusException.class,()->capture.capture(repo,new GitCapability("status"),head,new BoardVerificationSource().snapshot(repo),List.of("frontend/source.ts"))).getReason());
        Files.delete(repo.resolve("frontend/source.ts"));
        assertEquals("BOARD_DELIVERY_SCOPE_INCOMPLETE",assertThrows(org.springframework.web.server.ResponseStatusException.class,()->capture.capture(repo,new GitCapability("status"),head,new BoardVerificationSource().snapshot(repo),List.of("frontend/other.ts"))).getReason());
    }
    @Test void addedFileUsesAbsentBaselineAndNeverReadsExcludedSecretsOrGeneratedFiles() throws Exception {
        String head=baseline(); Files.writeString(repo.resolve("frontend/new.ts"),"export const added = true;\n");
        Files.writeString(repo.resolve("frontend/credentials.json"),"not source"); Files.createDirectories(repo.resolve("frontend/dist")); Files.writeString(repo.resolve("frontend/dist/generated.ts"),"not source");
        var result=new BoardDeliveryCapture(executor,new BoardVerificationSource()).capture(repo,new GitCapability("status"),head,new BoardVerificationSource().snapshot(repo),List.of("frontend/new.ts"));
        assertEquals("absent",result.getFirst().beforeHash()); assertEquals("",result.getFirst().before());
    }
    @Test void invalidPathsAndLimitsFailBeforeAnyProcess() {
        var process=org.mockito.Mockito.mock(ProcessExecutor.class); var capture=new BoardDeliveryCapture(process,new BoardVerificationSource());
        for (var paths:List.of(List.<String>of(),List.of("frontend/../outside.ts"),List.of("frontend/.env.ts"),List.of("frontend/node_modules/a.ts"),List.of("frontend/secret.ts"),List.of("frontend/package.json"),List.of("frontend/source.ts","frontend/source.ts"),Collections.nCopies(9,"frontend/source.ts")))
            assertThrows(IllegalArgumentException.class,()->capture.capture(repo,new GitCapability("status"),"a".repeat(40),null,paths));
        org.mockito.Mockito.verifyNoInteractions(process);
    }
    @Test void nonUtf8BinaryOversizedAndRedactedContentsNeverBecomeCompleteEvidence() throws Exception {
        String head=baseline(); var path=repo.resolve("frontend/source.ts"); var capture=new BoardDeliveryCapture(executor,new BoardVerificationSource());
        for (byte[] value:List.of(new byte[]{(byte)0xff},new byte[]{0,1},new byte[256*1024+1],"password=super-secret-value".getBytes(java.nio.charset.StandardCharsets.UTF_8))) {
            Files.write(path,value); assertThrows(org.springframework.web.server.ResponseStatusException.class,()->capture.capture(repo,new GitCapability("status"),head,new BoardVerificationSource().snapshot(repo),List.of("frontend/source.ts")));
        }
    }
    @Test void truncatedAndUnconfirmedGitOutputAreNotEvidence() throws Exception {
        String head=baseline(); var source=new BoardVerificationSource().snapshot(repo);
        for(boolean unknown:List.of(false,true)) {
            var process=org.mockito.Mockito.mock(ProcessExecutor.class);
            org.mockito.Mockito.when(process.runIsolated(org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.anyList(),org.mockito.ArgumentMatchers.anyMap())).thenReturn(new com.lh.eap.api.Observation("git-status",true,0,repo.toString(),"",Map.of("processTreeCleanup",!unknown,"processExited",true,"truncated",!unknown)));
            assertEquals(unknown?"BOARD_VERIFICATION_PROCESS_UNKNOWN":"BOARD_DELIVERY_INCOMPLETE",assertThrows(org.springframework.web.server.ResponseStatusException.class,()->new BoardDeliveryCapture(process,new BoardVerificationSource()).requireCurrent(repo,new GitCapability("status"),head,source)).getReason());
        }
    }
    @Test void caseAliasesCannotReadADifferentLiteralPath() throws Exception {
        String head=baseline(); Files.writeString(repo.resolve("frontend/source.ts"),"changed");
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->new BoardDeliveryCapture(executor,new BoardVerificationSource()).capture(repo,new GitCapability("status"),head,new BoardVerificationSource().snapshot(repo),List.of("frontend/SOURCE.ts")));
    }
    @Test void nestedRepositoriesCannotBeDeliveredAsRegularSource() throws Exception {
        String head=baseline(); Files.createDirectories(repo.resolve("frontend/nested/.git")); Files.writeString(repo.resolve("frontend/nested/new.ts"),"nested source");
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->new BoardDeliveryCapture(executor,new BoardVerificationSource()).capture(repo,new GitCapability("status"),head,new BoardVerificationSource().snapshot(repo),List.of("frontend/nested/new.ts")));
    }
    @Test void captureStopsStartingProcessesBeforeItsIndependentTransactionBudgetExpires() throws Exception {
        String head=baseline(); Files.writeString(repo.resolve("frontend/source.ts"),"changed");
        var clock=new java.util.concurrent.atomic.AtomicLong();
        var constructor=assertDoesNotThrow(()->BoardDeliveryCapture.class.getDeclaredConstructor(ProcessExecutor.class,BoardVerificationSource.class,java.util.function.LongSupplier.class));
        var capture=constructor.newInstance(executor,new BoardVerificationSource(),(java.util.function.LongSupplier)()->clock.getAndAdd(java.util.concurrent.TimeUnit.SECONDS.toNanos(15)));
        assertEquals("BOARD_DELIVERY_LIMIT",assertThrows(org.springframework.web.server.ResponseStatusException.class,()->capture.capture(repo,new GitCapability("status"),head,new BoardVerificationSource().snapshot(repo),List.of("frontend/source.ts"))).getReason());
    }
    @Test void objectInspectionForbidsTransportAndReplacementObjects() {
        for (String step:List.of("tree","blob")) {
            var command=new GitCapability("status").deliveryCommand(step,"a".repeat(40));
            assertTrue(command.contains("--no-replace-objects")); assertTrue(command.contains("protocol.allow=never"));
            assertFalse(command.contains("--textconv")); assertFalse(command.contains("--filters"));
        }
        assertThrows(IllegalArgumentException.class,()->new GitCapability("status").deliveryCommand("blob","HEAD:frontend/source.ts"));
    }
    String baseline() throws Exception {
        Files.createDirectories(repo.resolve("frontend")); Files.writeString(repo.resolve("frontend/source.ts"), "export const value = 1;\n");
        git("init"); git("add", "frontend"); git("-c", "user.name=EAP Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "baseline");
        return git("rev-parse", "HEAD").strip();
    }
    String git(String... args) { var command = new ArrayList<String>(); command.add("git"); command.addAll(List.of(args)); var result = executor.runIsolated("fixture", repo, command, GitCapability.environment()); assertEquals(0, result.exitCode(), result.stderr()); return result.stdout(); }
}
