package com.lh.eap.delivery;
import com.lh.eap.api.TaskRef;
import com.lh.eap.common.SensitiveData;
import com.lh.eap.error.LocalizedFailure;
import java.nio.ByteBuffer;
import java.time.temporal.ChronoUnit;
import java.util.stream.Stream;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import com.lh.eap.error.WorkspaceErrors;
import com.lh.eap.error.GitErrors;
import com.lh.eap.error.ExecutionErrors;
import com.lh.eap.error.CodeErrors;
import com.lh.eap.delivery.CodeProposalStore;
import com.lh.eap.delivery.CodeVerificationService;
import com.lh.eap.delivery.CodeGenerationStore;

import com.lh.eap.config.RuntimeWorkspace;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

/** Small review-and-save boundary. No shell, agent loop, scheduling, or automatic execution. */
@Service
public final class CodeChangeService {
    public record Change(String path, String before, String content, String baseHash) {}
    public record Generation(UUID id, String targetPath, String baseHash, Instant capturedAt,
                             String prototypeVersionId, String prototypeContentHash, TaskRef taskBinding,
                             List<ComponentGraph.Baseline> companionFiles) {
        public Generation { companionFiles=List.copyOf(companionFiles); }
        public Generation(UUID id,String targetPath,String baseHash,Instant capturedAt,String prototypeVersionId,String prototypeContentHash,TaskRef taskBinding) {
            this(id,targetPath,baseHash,capturedAt,prototypeVersionId,prototypeContentHash,taskBinding,List.of());
        }
        public Generation(UUID id, String targetPath, String baseHash, Instant capturedAt, String prototypeVersionId, String prototypeContentHash) {
            this(id, targetPath, baseHash, capturedAt, prototypeVersionId, prototypeContentHash, null);
        }
    }
    public record Proposal(UUID id, UUID conversationId, String workspace, String summary, List<Change> files, Instant createdAt,
                           boolean applied, boolean writeAllowed, String verification, Generation generation) {
        public Proposal(UUID id, UUID conversationId, String workspace, String summary, List<Change> files, Instant createdAt,
                        boolean applied, boolean writeAllowed, String verification) {
            this(id, conversationId, workspace, summary, files, createdAt, applied, writeAllowed, verification, null);
        }
    }
    public record Applied(UUID id, List<String> written, String verification, List<CodeVerificationService.Check> checks,
                          String status, String afterHash, String reason) {
        public Applied { CodeProposalStatus.fromWire(status); }
        public Applied(UUID id, List<String> written, String verification, List<CodeVerificationService.Check> checks) {
            this(id, written, verification, checks, CodeProposalStatus.APPLIED.wire(), null, "");
        }
    }
    public record ProposalStatus(Proposal proposal, String status, Applied result, String reason) {
        public ProposalStatus { CodeProposalStatus.fromWire(status); }
        @com.fasterxml.jackson.annotation.JsonProperty(access = com.fasterxml.jackson.annotation.JsonProperty.Access.READ_ONLY)
        public List<ComponentGraph.Edge> dependencies() {
            return ComponentGraph.validate(proposal.files().getFirst().path(), proposal.files());
        }
    }
    /** Read-only snapshot for delivery gates. Does not return file contents. */
    public record Baseline(String path, boolean exists, String baseHash, String denial) {}
    public record PreparationFile(String path, boolean exists, String baseHash, int bytes) {}
    public record Preparation(String workspace, List<PreparationFile> files, int totalBytes) {}

    /** Read-only preparation uses exactly the same path/read/size contract as generation. */
    public Preparation inspectPreparation(String relative, List<String> companions) {
        validateSelection(relative, companions);
        try {
            String workspace = runtime.workspace().toRealPath().toString();
            var paths = Stream.concat(Stream.of(relative), companions.stream()).toList();
            for (String path : paths) target(path, true);
            var sources = generationSources(paths);
            if (!workspace.equals(runtime.workspace().toRealPath().toString())) throw contextUnavailable();
            var files = sources.stream().map(file -> new PreparationFile(file.path(), file.content() != null,
                    file.baseHash(), file.content() == null ? 0 : file.content().getBytes(StandardCharsets.UTF_8).length)).toList();
            return new Preparation(workspace, files, files.stream().mapToInt(PreparationFile::bytes).sum());
        } catch (IOException unavailable) { throw contextUnavailable(); }
    }
    /** Bounded source material for planning, without a generation snapshot or write authority. */
    public List<SourceExcerpt> planningSources(String entry, List<String> companions) {
        validateSelection(entry, companions);
        try {
            var sources = generationSources(Stream.concat(Stream.of(entry), companions.stream()).toList());
            return sources.stream().map(file -> new SourceExcerpt(file.path(), file.content() != null,
                    file.baseHash(), file.content() == null ? 0 : file.content().getBytes(StandardCharsets.UTF_8).length,
                    file.content() == null ? "" : file.content(), "")).toList();
        } catch (IOException unavailable) { throw contextUnavailable(); }
    }

    /** Complete read-only reference snapshots, bounded by the existing attachment contract. */
    public List<SourceExcerpt> inspectReferences(List<String> paths) {
        if (paths == null || paths.size() > 6 || new java.util.HashSet<>(paths).size() != paths.size()
                || paths.stream().anyMatch(path -> path == null || path.isBlank() || path.length() > 150))
            throw rejected(CodeErrors.CODE_GRAPH_TARGETS_INVALID.code());
        try {
            String workspace = runtime.workspace().toRealPath().toString();
            var result = new ArrayList<SourceExcerpt>();
            int characters = 0;
            for (String path : paths) {
                target(path, true); // same explicit workspace grant as implementation preparation
                String content = generationSource(path);
                if (content == null) throw contextUnavailable();
                characters += content.length();
                if (content.length() > 16000 || characters > 24000)
                    throw rejected(CodeErrors.CODE_GRAPH_CONTEXT_TOO_LARGE.code());
                result.add(new SourceExcerpt(path, true, hash(content), content.getBytes(StandardCharsets.UTF_8).length, content, ""));
            }
            if (!workspace.equals(runtime.workspace().toRealPath().toString())) throw contextUnavailable();
            return List.copyOf(result);
        } catch (IOException unavailable) { throw contextUnavailable(); }
    }

    public CodeGenerationStore.TaskSnapshot planningTask(TaskRef ref) {
        if (generations == null) throw contextUnavailable();
        return generations.planningTask(ref);
    }

    /** Explicit read-only discovery; never grants writes or creates generation intent. */
    public Preparation inspectDependencies(String entry) {
        validateSelection(entry, List.of());
        if (!ComponentGraph.deliveryPath(entry) || ComponentGraph.resource(entry))
            throw rejected(CodeErrors.CODE_GRAPH_PATH_DENIED.code());
        try {
            var paths = new ArrayList<String>();
            paths.add(entry);
            for (int index = 0; index < paths.size(); index++) {
                var sources = generationSources(paths); // enforce complete-source and aggregate budgets
                var source = sources.get(index);
                if (source.content() == null) continue;
                var edges = ComponentGraph.dependencies(new Change(source.path(), null, source.content(), source.baseHash()), candidate -> {
                    try { return Files.isRegularFile(target(candidate, false), LinkOption.NOFOLLOW_LINKS); }
                    catch (IOException failure) { throw contextUnavailable(); }
                });
                for (var edge : edges) {
                    if (edge.from().equals(edge.to())) throw rejected(CodeErrors.CODE_GRAPH_CYCLE.code());
                    if (paths.contains(edge.to())) continue;
                    if (paths.size() >= 8) throw rejected(CodeErrors.CODE_GRAPH_TARGETS_INVALID.code());
                    paths.add(edge.to());
                }
            }
            var sources = generationSources(paths);
            ComponentGraph.validate(entry, sources.stream().map(file -> new Change(file.path(), null,
                    file.content() == null ? "" : file.content(), file.baseHash())).toList());
            return inspectPreparation(entry, paths.subList(1, paths.size()));
        } catch (IOException unavailable) { throw contextUnavailable(); }
    }

    /**
     * Read-only generation-prep excerpt. Does not grant write authorization.
     * @param excerpt truncated UTF-8 text for UI/model binding; empty when denied or missing
     */
    public record SourceExcerpt(String path, boolean exists, String baseHash, int bytes, String excerpt, String denial) {}
    /**
     * Read-only dirty-file summary from {@code git status --porcelain}.
     * {@code requested=false} means the server did not run git (authorization or runner gap).
     */
    public record DirtySummary(boolean requested, String denial, int count, List<String> paths, String detail) {}
    /**
     * Safe verification probe result. {@code requested=false} means the probe did not run
     * (missing root / runner). Never marks apply verification as passed.
     */
    public record VerificationProbe(boolean requested, String denial, String name, Integer exitCode, String summary) {}
    public interface DirtyRunner {
        String porcelain(Path workspace) throws Exception;
    }
    private final RuntimeWorkspace runtime;
    private final CodeVerificationService verification;
    private final DirtyRunner dirtyRunner;
    private final CodeGenerationStore generations;
    private final CodeProposalStore durable;
    private final Map<UUID, Proposal> proposals = new LinkedHashMap<>();
    private final Map<UUID, Applied> appliedResults = new HashMap<>();
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Set<String> EXTENSIONS = Set.of("vue", "ts", "tsx", "js", "jsx", "css", "html", "json", "md", "sql", "java");
    private static final int SOURCE_EXCERPT_LIMIT = 4000;
    static final int MAX_PROPOSAL_CONTENT_CHARS = 160000;
    // JSON can encode each UTF-16 code unit as six characters; reserve bounded envelope space.
    public static final int MAX_PROPOSAL_RESPONSE_CHARS = 6 * MAX_PROPOSAL_CONTENT_CHARS + 16384;
    private static final int DIRTY_PATH_LIMIT = 40;
    public CodeChangeService(RuntimeWorkspace runtime) { this(runtime, null, null); }
    public CodeChangeService(RuntimeWorkspace runtime, CodeVerificationService verification) {
        this(runtime, verification, null);
    }
    public CodeChangeService(RuntimeWorkspace runtime,
            @Autowired(required = false) CodeVerificationService verification,
            DirtyRunner dirtyRunner) {
        this(runtime, verification, dirtyRunner, null);
    }
    public CodeChangeService(RuntimeWorkspace runtime,
            @Autowired(required = false) CodeVerificationService verification,
            DirtyRunner dirtyRunner, CodeGenerationStore generations) {
        this(runtime, verification, dirtyRunner, generations, null);
    }
    @Autowired
    public CodeChangeService(RuntimeWorkspace runtime,
                             @Autowired(required = false) CodeVerificationService verification,
                             DirtyRunner dirtyRunner, CodeGenerationStore generations, CodeProposalStore durable) {
        this.runtime = runtime;
        this.verification = verification;
        this.generations = generations;
        this.durable = durable;
        // Compatibility constructors have no execution authority. Production requires the shared runner.
        this.dirtyRunner = dirtyRunner == null ? workspace -> null : dirtyRunner;
    }

    /**
     * Generation-prep baseline for one workspace-relative source file.
     * Requires an authorized root that covers the workspace; never returns file body.
     */
    public Baseline inspectBaseline(String relative) {
        String path = relative == null ? "" : relative;
        if (!runtime.root().allowed()) {
            String denial = runtime.root().denial();
            return new Baseline(path, false, "", denial == null || denial.isBlank() ? WorkspaceErrors.AUTHORIZED_ROOT_MISSING.code() : denial);
        }
        try {
            Path file = target(path, false);
            Path authorized = runtime.root().path();
            Path real = Files.exists(file) ? file.toRealPath() : file.toAbsolutePath().normalize();
            if (!real.startsWith(authorized.toRealPath())) {
                return new Baseline(path, false, "", WorkspaceErrors.OUTSIDE_AUTHORIZED_ROOT.code());
            }
            if (!Files.exists(file)) return new Baseline(path, false, "absent", "");
            if (!Files.isRegularFile(file)) return new Baseline(path, false, "", CodeErrors.INVALID_CODE_PATH.code());
            if (Files.size(file) > 640000) return new Baseline(path, true, "", CodeErrors.EXISTING_FILE_TOO_LARGE.code());
            String content = Files.readString(file, StandardCharsets.UTF_8);
            if (content.length() > 160000) return new Baseline(path, true, "", CodeErrors.EXISTING_FILE_TOO_LARGE.code());
            return new Baseline(path, true, hash(content), "");
        } catch (ResponseStatusException expected) {
            return new Baseline(path, false, "", expected.getReason() == null ? CodeErrors.INVALID_CODE_PATH.code() : expected.getReason());
        } catch (Exception failure) {
            return new Baseline(path, false, "", CodeErrors.BASELINE_UNAVAILABLE.code());
        }
    }

    /**
     * Read-only dirty paths under the authorized workspace. Never writes and never widens grants.
     */
    public DirtySummary inspectDirty() {
        if (!runtime.root().allowed()) {
            String denial = runtime.root().denial();
            return new DirtySummary(false, denial == null || denial.isBlank() ? WorkspaceErrors.AUTHORIZED_ROOT_MISSING.code() : denial, 0, List.of(), "");
        }
        try {
            Path workspace = runtime.workspace().toRealPath();
            Path authorized = runtime.root().path().toRealPath();
            if (!workspace.startsWith(authorized)) {
                return new DirtySummary(false, WorkspaceErrors.OUTSIDE_AUTHORIZED_ROOT.code(), 0, List.of(), "");
            }
            String porcelain = dirtyRunner.porcelain(workspace);
            if (porcelain == null) return new DirtySummary(false, GitErrors.GIT_STATUS_UNAVAILABLE.code(), 0, List.of(), "");
            var paths = new ArrayList<String>();
            for (String line : porcelain.replace("\r\n", "\n").split("\n")) {
                String entry = dirtyPath(line);
                if (entry.isBlank()) continue;
                if (entry.length() > 240) entry = entry.substring(0, 240);
                paths.add(entry);
                if (paths.size() >= DIRTY_PATH_LIMIT) break;
            }
            return new DirtySummary(true, "", paths.size(), List.copyOf(paths), paths.isEmpty() ? "clean" : "dirty");
        } catch (Exception failure) {
            String detail = failure.getMessage() == null || failure.getMessage().isBlank()
                    ? failure.getClass().getSimpleName()
                    : failure.getMessage();
            if (detail.length() > 120) detail = detail.substring(0, 120);
            return new DirtySummary(false, GitErrors.GIT_STATUS_FAILED.code(), 0, List.of(), detail);
        }
    }

    /**
     * Safe {@code git --version} probe under the process-bound root.
     * Independent of {@code eap.runtime.verification.enabled}; never runs configured heavy checks.
     */
    public VerificationProbe probeVerification() {
        if (!runtime.root().allowed()) {
            String denial = runtime.root().denial();
            return new VerificationProbe(false,
                    denial == null || denial.isBlank() ? WorkspaceErrors.AUTHORIZED_ROOT_MISSING.code() : denial,
                    "", null, "");
        }
        if (verification == null) {
            return new VerificationProbe(false, ExecutionErrors.VERIFICATION_UNAVAILABLE.code(), "", null, "");
        }
        try {
            Path workspace = runtime.workspace().toRealPath();
            Path authorized = runtime.root().path().toRealPath();
            if (!workspace.startsWith(authorized)) {
                return new VerificationProbe(false, WorkspaceErrors.OUTSIDE_AUTHORIZED_ROOT.code(), "", null, "");
            }
            var check = verification.probe(workspace);
            return new VerificationProbe(true, "", check.name(), check.exitCode(), check.summary() == null ? "" : check.summary());
        } catch (Exception failure) {
            String detail = failure.getMessage() == null || failure.getMessage().isBlank()
                    ? failure.getClass().getSimpleName()
                    : failure.getMessage();
            if (detail.length() > 120) detail = detail.substring(0, 120);
            return new VerificationProbe(false, ExecutionErrors.PROBE_FAILED.code(), "", null, detail);
        }
    }

    /**
     * Read a bounded excerpt from the runtime workspace for generation prep.
     * Does not require authorized-root and never enables writes.
     */
    public SourceExcerpt inspectSource(String relative) {
        String path = relative == null ? "" : relative;
        try {
            Path file = target(path, false);
            if (!Files.exists(file)) return new SourceExcerpt(path, false, "absent", 0, "", "");
            if (!Files.isRegularFile(file)) return new SourceExcerpt(path, false, "", 0, "", CodeErrors.INVALID_CODE_PATH.code());
            if (Files.size(file) > 640000) return new SourceExcerpt(path, true, "", 0, "", CodeErrors.EXISTING_FILE_TOO_LARGE.code());
            String content = Files.readString(file, StandardCharsets.UTF_8);
            if (content.length() > 160000) return new SourceExcerpt(path, true, "", content.length(), "", CodeErrors.EXISTING_FILE_TOO_LARGE.code());
            String excerpt = content.length() <= SOURCE_EXCERPT_LIMIT ? content : content.substring(0, SOURCE_EXCERPT_LIMIT);
            return new SourceExcerpt(path, true, hash(content), content.length(), excerpt, "");
        } catch (ResponseStatusException expected) {
            return new SourceExcerpt(path, false, "", 0, "", expected.getReason() == null ? CodeErrors.INVALID_CODE_PATH.code() : expected.getReason());
        } catch (Exception failure) {
            return new SourceExcerpt(path, false, "", 0, "", WorkspaceErrors.SOURCE_UNAVAILABLE.code());
        }
    }

    public synchronized Proposal propose(UUID conversation, String answer) {
        return propose(conversation, answer, true, "");
    }

    public synchronized Proposal propose(UUID conversation, String answer, boolean writeAllowed) {
        return propose(conversation, answer, writeAllowed, "");
    }

    /**
     * Parse a model JSON proposal. When {@code expectedTargetPath} is non-blank (code delivery),
     * the proposal must include that relative path so candidates cannot abandon the bound page shell.
     */
    public synchronized Proposal propose(UUID conversation, String answer, boolean writeAllowed, String expectedTargetPath) {
        return parseProposal(conversation, answer, writeAllowed, expectedTargetPath, null);
    }

    public synchronized Proposal proposePrepared(String principal, UUID conversation, UUID generationId,
                                                String answer, boolean writeAllowed) {
        var snapshot = loadGeneration(generationId);
        if (!snapshot.principal().equals(principal) || !snapshot.conversationId().equals(conversation))
            throw rejected(CodeErrors.CODE_GENERATION_SCOPE_MISMATCH.code());
        verifyGeneration(snapshot);
        if (durable == null) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, CodeErrors.CODE_PROPOSAL_STORE_UNAVAILABLE.code());
        return parseProposal(conversation, answer, writeAllowed, snapshot.targetPath(), snapshot);
    }

    private Proposal parseProposal(UUID conversation, String answer, boolean writeAllowed, String expectedTargetPath,
                                   CodeGenerationStore.Snapshot generation) {
        try {
            if (answer.length() > MAX_PROPOSAL_RESPONSE_CHARS) throw rejected(CodeErrors.CODE_PROPOSAL_TOO_LARGE.code());
            String value = answer.strip();
            if (value.startsWith("```")) value = value.substring(value.indexOf('\n') + 1, value.lastIndexOf("```")).strip();
            var root = JSON.readTree(value);
            var entries = root.path("files");
            if (!entries.isArray() || entries.size() < 1 || entries.size() > 8) throw rejected(CodeErrors.INVALID_CODE_PROPOSAL.code());
            if (generation != null && (entries.size() != generation.sources().size() || !entries.get(0).path("path").asString("").equals(generation.targetPath())))
                throw rejected(CodeErrors.CODE_GENERATION_SCOPE_MISMATCH.code());
            var files = new ArrayList<Change>();
            var names = new HashSet<String>();
            var targets = new ArrayList<Path>();
            int total = 0;
            for (var entry : entries) {
                String name = entry.path("path").asString(""), content = entry.path("content").asString("");
                if (!entry.path("content").isString() || !names.add(name)) throw rejected(CodeErrors.INVALID_CODE_PROPOSAL.code());
                total += content.length();
                if (total > MAX_PROPOSAL_CONTENT_CHARS) throw rejected(CodeErrors.CODE_PROPOSAL_TOO_LARGE.code());
                Path path = target(name, false);
                for (Path previous : targets) {
                    if (previous.equals(path) || (Files.exists(previous) && Files.exists(path) && Files.isSameFile(previous, path))) {
                        throw rejected(CodeErrors.INVALID_CODE_PROPOSAL.code());
                    }
                }
                targets.add(path);
                if (Files.exists(path) && Files.size(path) > 640000) throw rejected(CodeErrors.EXISTING_FILE_TOO_LARGE.code());
                String before = generation != null ? generation.sources().stream().filter(file->file.path().equals(name)).findFirst()
                    .orElseThrow(()->rejected(CodeErrors.CODE_GENERATION_SCOPE_MISMATCH.code())).content() : Files.exists(path) ? Files.readString(path, StandardCharsets.UTF_8) : null;
                if (before != null && before.length() > 160000) throw rejected(CodeErrors.EXISTING_FILE_TOO_LARGE.code());
                files.add(new Change(name, before, content, hash(before)));
            }
            if(generation!=null && !files.stream().map(Change::path).toList().equals(generation.sources().stream().map(ComponentGraph.Source::path).toList()))throw rejected(CodeErrors.CODE_GENERATION_SCOPE_MISMATCH.code());
            if(generation!=null)ComponentGraph.validate(generation.targetPath(),files);
            String expected = expectedTargetPath == null ? "" : expectedTargetPath.trim();
            if (!expected.isBlank() && !names.contains(expected)) {
                throw rejected(CodeErrors.TARGET_PATH_REQUIRED.code());
            }
            var proposal = new Proposal(UUID.randomUUID(), conversation, runtime.workspace().toRealPath().toString(), root.path("summary").asString(""),
                    List.copyOf(files), Instant.now(), false, writeAllowed, "not_requested", generation == null ? null : generation.reference());
            if (generation != null) verifyGeneration(generation);
            if (generation != null) {
                try {
                    durable.save(generation.principal(), proposal);
                    var saved = durable.find(generation.principal(), conversation, proposal.id()).orElseThrow();
                    if (!saved.proposal().equals(proposal)) throw new IllegalStateException("proposal readback mismatch");
                    return saved.proposal();
                } catch (Exception failure) {
                    throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, CodeErrors.CODE_PROPOSAL_STORE_UNAVAILABLE.code());
                }
            }
            sweep();
            if (proposals.size() >= 32) {
                UUID oldest = proposals.keySet().iterator().next();
                proposals.remove(oldest);
                appliedResults.remove(oldest);
            }
            proposals.put(proposal.id(), proposal);
            return proposal;
        } catch (ResponseStatusException expected) { throw expected; }
        catch (Exception invalid) { throw rejected(CodeErrors.INVALID_CODE_PROPOSAL.code()); }
    }

    public synchronized Applied apply(UUID conversation, UUID id, boolean confirmed) {
        if (durable != null) return apply(RuntimeWorkspace.OPERATOR_LABEL, conversation, id, confirmed);
        if (!confirmed) throw rejected(CodeErrors.WRITE_CONFIRMATION_REQUIRED.code());
        sweep();
        var proposal = proposals.get(id);
        if (proposal == null || !proposal.conversationId().equals(conversation)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, CodeErrors.UNKNOWN_CODE_PROPOSAL.code());
        if (!proposal.writeAllowed()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, CodeErrors.READ_ONLY_PROPOSAL.code());
        if (proposal.applied()) {
            return appliedResults.get(id);
        }
        var written = new ArrayList<String>();
        try {
            // Check every base before the first write. User changes since generation must be reviewed again.
            for (var file : proposal.files()) {
                Path path = target(file.path(), true);
                if (!runtime.workspace().toRealPath().toString().equals(proposal.workspace())) throw rejected(WorkspaceErrors.WORKSPACE_CHANGED.code());
                String current = Files.exists(path) ? Files.readString(path, StandardCharsets.UTF_8) : null;
                if (!hash(current).equals(file.baseHash())) throw new ResponseStatusException(HttpStatus.CONFLICT, CodeErrors.FILE_CHANGED_SINCE_PROPOSAL.code());
            }
            for (var file : proposal.files()) {
                Path path = target(file.path(), true);
                String current = Files.exists(path) ? Files.readString(path, StandardCharsets.UTF_8) : null;
                if (!hash(current).equals(file.baseHash())) throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "FILE_CHANGED_SINCE_PROPOSAL; written=" + String.join(",", written));
                Files.createDirectories(path.getParent());
                Path temp = Files.createTempFile(path.getParent(), ".eap-code-", ".tmp");
                try {
                    Files.writeString(temp, file.content(), StandardCharsets.UTF_8);
                    if (file.before() == null) Files.move(temp, path); // never overwrite a concurrently created file
                    else Files.move(temp, path, StandardCopyOption.REPLACE_EXISTING);
                    written.add(file.path());
                } finally { Files.deleteIfExists(temp); }
            }
            var checks = verification != null && verification.enabled()
                    ? verification.run(runtime.workspace().toRealPath())
                    : List.<CodeVerificationService.Check>of();
            String status = checks.isEmpty() ? "not_requested" : "requested";
            var result = new Applied(id, List.copyOf(written), status, List.copyOf(checks));
            appliedResults.put(id, result);
            proposals.put(id, new Proposal(proposal.id(), conversation, proposal.workspace(), proposal.summary(), proposal.files(), proposal.createdAt(), true, true, status, proposal.generation()));
            return result;
        } catch (ResponseStatusException failure) { throw failure; }
        catch (IOException failure) {
            // Do not claim transactional filesystem writes or roll back user files blindly.
            throw new ResponseStatusException(HttpStatus.CONFLICT, "CODE_WRITE_FAILED; written=" + String.join(",", written));
        }
    }

    public ProposalStatus proposal(String principal, UUID conversation, UUID id) {
        if (durable == null) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, CodeErrors.CODE_PROPOSAL_STORE_UNAVAILABLE.code());
        var row = durable.find(principal, conversation, id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, CodeErrors.UNKNOWN_CODE_PROPOSAL.code()));
        return new ProposalStatus(row.proposal(), row.status(), row.result(), row.reason());
    }

    public ProposalStatus refuse(String principal, UUID conversation, UUID id) {
        if (durable == null) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, CodeErrors.CODE_PROPOSAL_STORE_UNAVAILABLE.code());
        return durable.withoutTransaction(() -> {
            proposal(principal, conversation, id);
            durable.refuse(principal, conversation, id, ExecutionErrors.OPERATOR_REFUSED.code());
            return proposal(principal, conversation, id);
        });
    }

    @EventListener(ApplicationReadyEvent.class)
    public void recoverInterruptedApplications() throws IOException {
        if (durable != null) durable.recoverInterrupted(runtime.workspace().toRealPath().toString());
    }

    /** Durable apply: intent commits before filesystem effects; never runs verification. */
    public Applied apply(String principal, UUID conversation, UUID id, boolean confirmed) {
        if (durable == null) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, CodeErrors.CODE_PROPOSAL_STORE_UNAVAILABLE.code());
        return durable.withoutTransaction(() -> applyDurable(principal, conversation, id, confirmed));
    }
    private Applied applyDurable(String principal, UUID conversation, UUID id, boolean confirmed) {
        if (!confirmed) throw rejected(CodeErrors.WRITE_CONFIRMATION_REQUIRED.code());
        var saved = proposal(principal, conversation, id);
        if (saved.status().equals(CodeProposalStatus.APPLIED.wire())) return saved.result();
        if (!saved.status().equals(CodeProposalStatus.PROPOSED.wire())) throw new ResponseStatusException(HttpStatus.CONFLICT, "CODE_APPLICATION_" + saved.status());
        var proposal = saved.proposal();
        if (!proposal.writeAllowed()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, CodeErrors.READ_ONLY_PROPOSAL.code());
        if (!durable.claim(principal, conversation, id)) {
            var current = proposal(principal, conversation, id);
            if (current.status().equals(CodeProposalStatus.APPLIED.wire())) return current.result();
            throw new ResponseStatusException(HttpStatus.CONFLICT, "CODE_APPLICATION_" + current.status());
        }
        boolean effectStarted = false;
        var temporary = new ArrayList<Path>();
        try {
            var snapshot = loadGeneration(proposal.generation().id());
            if (!snapshot.principal().equals(principal) || !snapshot.conversationId().equals(conversation)
                    || !snapshot.workspace().equals(proposal.workspace()) || !snapshot.reference().equals(proposal.generation())
                    || proposal.files().size()!=snapshot.sources().size()) throw rejected(CodeErrors.CODE_GENERATION_SCOPE_MISMATCH.code());
            for(int i=0;i<snapshot.sources().size();i++) {
                var source=snapshot.sources().get(i);var change=proposal.files().get(i);
                if(!change.path().equals(source.path())||!change.baseHash().equals(source.baseHash())||!Objects.equals(change.before(),source.content()))
                    throw rejected(CodeErrors.CODE_GENERATION_SCOPE_MISMATCH.code());
            }
            ComponentGraph.validate(snapshot.targetPath(),proposal.files());
            if(!runtime.workspace().toRealPath().toString().equals(snapshot.workspace()))throw rejected(WorkspaceErrors.WORKSPACE_CHANGED.code());
            // Every baseline must pass before staging or replacing any selected source.
            for(var source:snapshot.sources()) {
                target(source.path(),true);
                if(!hash(generationSource(source.path())).equals(source.baseHash()))
                    throw new ResponseStatusException(HttpStatus.CONFLICT,CodeErrors.FILE_CHANGED_SINCE_PROPOSAL.code());
            }
            effectStarted=true;
            for(var change:proposal.files()) {
                var destination=target(change.path(),true);Files.createDirectories(destination.getParent());
                var temp=Files.createTempFile(destination.getParent(),".eap-code-",".tmp");temporary.add(temp);
                Files.writeString(temp,change.content(),StandardCharsets.UTF_8);
            }
            for(var source:snapshot.sources())if(!hash(generationSource(source.path())).equals(source.baseHash()))
                throw new ResponseStatusException(HttpStatus.CONFLICT,CodeErrors.FILE_CHANGED_SINCE_PROPOSAL.code());
            for(int i=0;i<proposal.files().size();i++) {
                var change=proposal.files().get(i);var path=target(change.path(),true);
                if(!hash(generationSource(change.path())).equals(change.baseHash()))throw new IOException("baseline changed during component apply");
                if(change.before()==null)Files.move(temporary.get(i),path);
                else Files.move(temporary.get(i),path,StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);
            }
            for(var change:proposal.files()) {
                var path=target(change.path(),true);byte[] bytes;
                try(var input=Files.newInputStream(path,LinkOption.NOFOLLOW_LINKS)){bytes=input.readNBytes(640001);}
                if(bytes.length>640000||!hash(StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(bytes)).toString()).equals(hash(change.content())))
                    throw new IOException("component readback mismatch");
                target(change.path(),true);
            }
            var result = new Applied(id,proposal.files().stream().map(Change::path).toList(),"not_requested",List.of(),CodeProposalStatus.APPLIED.wire(),hash(proposal.files().getFirst().content()),"");
            durable.finish(principal,conversation,id,CodeProposalStatus.APPLIED.wire(),result,"");
            var persisted=proposal(principal,conversation,id);
            if(!persisted.status().equals(CodeProposalStatus.APPLIED.wire())||!result.equals(persisted.result()))throw new IllegalStateException("result readback mismatch");
            return persisted.result();
        } catch(Exception failure) {
            String reason=effectStarted?CodeErrors.CODE_APPLICATION_UNKNOWN.code():failure instanceof ResponseStatusException denied?denied.getReason():CodeErrors.CODE_APPLICATION_FAILED.code();
            try{durable.finish(principal,conversation,id,effectStarted?CodeProposalStatus.UNKNOWN.wire():CodeProposalStatus.FAILED.wire(),null,reason);}
            catch(RuntimeException ignored){ /* Original APPLYING remains the durable interlock. */ }
            if(!effectStarted&&failure instanceof ResponseStatusException denied)throw denied;
            throw new ResponseStatusException(HttpStatus.CONFLICT,reason);
        } finally {
            for(var temp:temporary)try{Files.deleteIfExists(temp);}catch(IOException ignored){ /* Never roll back another editor's source. */ }
        }
    }

    /** Capture once, persist before model invocation, and use these exact UTF-8 bytes as context. */
    public CodeGenerationStore.Snapshot prepareGeneration(String principal, UUID conversation, String relative,
                                                          String prototypeVersionId, String prototypeContentHash) {
        return prepareGeneration(principal, conversation, relative, prototypeVersionId, prototypeContentHash, null);
    }
    public CodeGenerationStore.Snapshot prepareGeneration(String principal, UUID conversation, String relative,
                                                          String prototypeVersionId, String prototypeContentHash, TaskRef taskRef) {
        return prepareGeneration(principal,conversation,relative,prototypeVersionId,prototypeContentHash,taskRef,List.of());
    }
    public CodeGenerationStore.Snapshot prepareGeneration(String principal, UUID conversation, String relative,
            String prototypeVersionId,String prototypeContentHash,TaskRef taskRef,List<String> componentPaths) {
        validateSelection(relative, componentPaths);
        if (generations == null) throw contextUnavailable();
        if (prototypeVersionId == null || prototypeContentHash == null
                || (taskRef == null && prototypeVersionId.isBlank() != prototypeContentHash.isBlank())) throw contextUnavailable();
        try {
            String workspace = runtime.workspace().toRealPath().toString();
            var snapshot = generations.capture(taskRef, workspace, prototypeVersionId, task -> {
                try {
                    var sources = generationSources(Stream.concat(Stream.of(relative), componentPaths.stream()).toList());
                    var entry = sources.getFirst();
                    String prototypeHash = task == null ? prototypeContentHash : task.prototype() == null ? "" : task.prototype().contentHash();
                    return new CodeGenerationStore.Snapshot(UUID.randomUUID(), principal, conversation,
                            workspace, relative, entry.baseHash(), entry.content(), prototypeVersionId, prototypeHash,
                            Instant.now().truncatedTo(ChronoUnit.MICROS), task, sources.subList(1, sources.size()));
                } catch (IOException failure) { throw contextUnavailable(); }
            });
            if (!snapshot.equals(loadGeneration(snapshot.id()))) throw contextUnavailable();
            return loadGeneration(snapshot.id());
        } catch (ResponseStatusException expected) { throw expected; }
        catch (LocalizedFailure expected) { throw expected; }
        catch (Exception failure) { throw contextUnavailable(); }
    }

    private static void validateSelection(String relative, List<String> componentPaths) {
        if (relative == null || relative.isBlank()) throw rejected(CodeErrors.CODE_GENERATION_TARGET_REQUIRED.code());
        if(componentPaths==null||componentPaths.size()>7||new HashSet<>(componentPaths).size()!=componentPaths.size()||componentPaths.contains(relative))throw rejected(CodeErrors.CODE_GRAPH_TARGETS_INVALID.code());
        if(!componentPaths.isEmpty())for(String path:Stream.concat(Stream.of(relative),componentPaths.stream()).toList())
            if(!ComponentGraph.deliveryPath(path) || (path.equals(relative) && ComponentGraph.resource(path)))
                throw rejected(CodeErrors.CODE_GRAPH_PATH_DENIED.code());
    }

    private List<ComponentGraph.Source> generationSources(List<String> paths) throws IOException {
        var sources = new ArrayList<ComponentGraph.Source>();
        var targets = new HashSet<Path>();
        int total = 0;
        for (String path : paths) {
            if (!targets.add(target(path, false))) throw rejected(CodeErrors.CODE_GRAPH_DUPLICATE_TARGET.code());
            String content = generationSource(path);
            total += content == null ? 0 : content.getBytes(StandardCharsets.UTF_8).length;
            if (total > 48000) throw new LocalizedFailure(LocalizedFailure.Kind.INVALID, CodeErrors.CODE_GRAPH_CONTEXT_TOO_LARGE, 48000);
            sources.add(new ComponentGraph.Source(path, hash(content), content));
        }
        return List.copyOf(sources);
    }

    private CodeGenerationStore.Snapshot loadGeneration(UUID id) {
        if (generations == null) throw contextUnavailable();
        try { return generations.find(id).orElseThrow(CodeChangeService::contextUnavailable); }
        catch (Exception failure) { throw contextUnavailable(); }
    }

    private void verifyGeneration(CodeGenerationStore.Snapshot snapshot) {
        try {
            if (!runtime.workspace().toRealPath().toString().equals(snapshot.workspace()))
                throw rejected(CodeErrors.CODE_GENERATION_SCOPE_MISMATCH.code());
            for(var file:snapshot.sources())if (!hash(generationSource(file.path())).equals(file.baseHash()))
                throw new ResponseStatusException(HttpStatus.CONFLICT, CodeErrors.CODE_GENERATION_BASELINE_CHANGED.code());
        } catch (ResponseStatusException expected) { throw expected; }
        catch (Exception failure) { throw contextUnavailable(); }
    }

    /** Recheck authority and immutable source/task evidence before an agent can observe a snapshot. */
    public void checkAgentGeneration(CodeGenerationStore.Snapshot snapshot) {
        if (snapshot == null || snapshot.taskSnapshot() == null || !snapshot.equals(loadGeneration(snapshot.id())))
            throw rejected(CodeErrors.CODE_GENERATION_SCOPE_MISMATCH.code());
        try {
            for (var file : snapshot.sources()) target(file.path(), true);
            if (!snapshot.taskSnapshot().equals(generations.planningTask(snapshot.taskSnapshot().binding())))
                throw rejected(CodeErrors.CODE_TASK_SNAPSHOT_CHANGED.code());
            verifyGeneration(snapshot);
        } catch (IOException unavailable) { throw contextUnavailable(); }
    }

    private String generationSource(String relative) throws IOException {
        Path path = target(relative, false);
        // Each selected source is complete and bounded, never a truncated excerpt.
        if (!Files.exists(path, LinkOption.NOFOLLOW_LINKS)) return null;
        byte[] bytes;
        try (var input = Files.newInputStream(path, LinkOption.NOFOLLOW_LINKS)) { bytes = input.readNBytes(24001); }
        if (bytes.length > 24000) throw contextUnavailable();
        String source = StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(bytes)).toString();
        if (source.indexOf('\0') >= 0 || unsafeSource(source)) throw contextUnavailable();
        target(relative, false); // recheck workspace/symlink boundaries after the read
        return source;
    }

    private static boolean unsafeSource(String source) {
        String lower = source.toLowerCase(Locale.ROOT);
        return SensitiveData.containsSecret(source)
                || lower.contains("[redacted") || lower.contains("«redacted")
                || lower.contains("private key-----") || lower.matches("(?s).*bearer\\s+[a-z0-9._~+/-]{8,}.*");
    }

    private static ResponseStatusException contextUnavailable() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, CodeErrors.CODE_GENERATION_CONTEXT_UNAVAILABLE.code());
    }

    Path target(String relative, boolean writing) throws IOException {
        if (relative.isBlank() || relative.length() > 240 || relative.contains("\\") || relative.contains(":")) throw rejected(CodeErrors.INVALID_CODE_PATH.code());
        var parts = relative.split("/", -1);
        for (String part : parts) {
            String key = part.toLowerCase(Locale.ROOT);
            if (key.matches(".*(credential|secret|password|passwd|private[-_]?key|api[-_]?key|certificate|keystore).*")
                    || key.matches(".*tokens?\\.(json|yaml|yml|txt|lock)")) throw rejected(CodeErrors.SOURCE_FILES_ONLY.code());
            if (part.isBlank() || part.startsWith(".") || part.endsWith(".") || part.endsWith(" ")
                    || key.equals("node_modules") || key.equals("target") || key.equals("dist")) throw rejected(CodeErrors.INVALID_CODE_PATH.code());
        }
        String extension = relative.substring(relative.lastIndexOf('.') + 1);
        String policyPath = relative.toLowerCase(Locale.ROOT);
        if (!EXTENSIONS.contains(extension) || policyPath.endsWith("package.json") || policyPath.endsWith("pom.xml")) throw rejected(CodeErrors.SOURCE_FILES_ONLY.code());
        Path workspace = runtime.workspace().toRealPath();
        if (writing && (!runtime.root().allowed() || !workspace.startsWith(runtime.root().path())))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, WorkspaceErrors.WORKSPACE_WRITE_NOT_AUTHORIZED.code());
        Path candidate = workspace;
        for (String part : parts) {
            candidate = candidate.resolve(part);
            if (Files.exists(candidate.resolve(".git"), LinkOption.NOFOLLOW_LINKS)) throw rejected(CodeErrors.CODE_NESTED_REPOSITORY.code());
            if (Files.isSymbolicLink(candidate) || (Files.exists(candidate) && !candidate.toRealPath().startsWith(workspace))) throw rejected(CodeErrors.CODE_PATH_ESCAPES_WORKSPACE.code());
        }
        if (Files.exists(candidate) && !Files.isRegularFile(candidate)) throw rejected(CodeErrors.INVALID_CODE_PATH.code());
        return candidate;
    }
    private void sweep() {
        proposals.values().removeIf(item -> item.createdAt().isBefore(Instant.now().minusSeconds(1800)));
        appliedResults.keySet().retainAll(proposals.keySet());
    }
    static String hash(String value) {
        if (value == null) return "absent";
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception impossible) { throw new IllegalStateException(impossible); }
    }
    /** Porcelain path only; ignores status letters and rename arrows. */
    public static String dirtyPath(String line) {
        if (line == null || line.isBlank() || line.length() < 4) return "";
        String rest = line.substring(3).strip();
        int arrow = rest.lastIndexOf(" -> ");
        if (arrow >= 0) rest = rest.substring(arrow + 4).strip();
        if (rest.length() >= 2 && rest.charAt(0) == '"' && rest.charAt(rest.length() - 1) == '"') {
            rest = rest.substring(1, rest.length() - 1);
        }
        return rest.replace('\\', '/');
    }
    private static ResponseStatusException rejected(String code) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, code); }


}
