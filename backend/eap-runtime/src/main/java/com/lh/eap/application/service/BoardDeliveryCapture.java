package com.lh.eap.application.service;

import com.lh.eap.api.ProcessExecutor;
import com.lh.eap.capability.GitCapability;
import com.lh.eap.common.SensitiveData;
import java.nio.ByteBuffer;
import java.nio.charset.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import static com.lh.eap.application.service.BoardVerificationSource.denied;
import static com.lh.eap.application.service.BoardVerificationSource.sourcePath;

/** Raw Git objects and worktree bytes, never GitReviewCapture's display hash. */
@Service
public class BoardDeliveryCapture {
    public record File(String path, String beforeHash, String afterHash, String before, String after) {}
    private record Entry(String mode, String oid) {}
    private final ProcessExecutor executor;
    private final BoardVerificationSource sources;
    private final java.util.function.LongSupplier clock;
    @Autowired
    public BoardDeliveryCapture(ProcessExecutor executor, BoardVerificationSource sources) { this(executor, sources, System::nanoTime); }
    BoardDeliveryCapture(ProcessExecutor executor, BoardVerificationSource sources, java.util.function.LongSupplier clock) { this.executor=executor; this.sources=sources; this.clock=clock; }
    public List<File> capture(Path root, GitCapability git, String base, BoardVerificationSource.Source expected, List<String> paths) {
        validatePaths(paths);
        long deadline=clock.getAsLong()+java.util.concurrent.TimeUnit.SECONDS.toNanos(50);
        requireCurrent(root, git, base, expected, deadline);
        var tree = new HashMap<String, Entry>();
        String listing = invoke(root, git.deliveryCommand("tree", base), deadline);
        for (String line : listing.split("\u0000")) {
            if (line.isEmpty()) continue;
            int tab = line.indexOf('\t');
            if (tab < 0 || tree.size() >= 10000) throw denied("BOARD_DELIVERY_INCOMPLETE");
            var fields = line.substring(0, tab).split(" ");
            if (fields.length != 3 || !fields[2].matches("[a-f0-9]{40}|[a-f0-9]{64}")) throw denied("BOARD_DELIVERY_INCOMPLETE");
            tree.put(line.substring(tab+1), new Entry(fields[0], fields[2]));
        }
        var current = new HashMap<String, BoardVerificationSource.File>();
        expected.files().forEach(file -> current.put(file.path(), file));
        var changes = new TreeSet<String>();
        var bytes = new HashMap<String, byte[]>();
        var conversion = conversion(root, git, expected, deadline);
        for (var file : expected.files()) {
            byte[] value = read(root, file);
            var entry = tree.get(file.path());
            byte[] canonical = conversion.canonical(file.path(), value);
            if (entry == null || !oid(canonical, base.length()).equals(entry.oid())) changes.add(file.path());
            if (paths.contains(file.path())) bytes.put(file.path(), value);
        }
        // Deleted source is not representable in this first slice. Excluded inputs stay excluded.
        for (String path : tree.keySet()) if (!current.containsKey(path) && sourcePath(path)) changes.add(path);
        if (!changes.equals(new TreeSet<>(paths))) throw denied("BOARD_DELIVERY_SCOPE_INCOMPLETE");
        var result = new ArrayList<File>(); int total = 0;
        for (String path : paths) {
            if (!current.containsKey(path)) throw denied("BOARD_DELIVERY_PATH_DENIED");
            var entry = tree.get(path);
            if (entry != null && !Set.of("100644", "100755").contains(entry.mode())) throw denied("BOARD_DELIVERY_PATH_DENIED");
            byte[] afterBytes = bytes.get(path);
            String after = text(afterBytes);
            String before = entry == null ? "" : invoke(root, git.deliveryCommand("blob", entry.oid()), deadline);
            byte[] beforeBytes = before.getBytes(StandardCharsets.UTF_8);
            if (entry != null && !oid(beforeBytes, base.length()).equals(entry.oid())) throw denied("BOARD_DELIVERY_INCOMPLETE");
            text(beforeBytes);
            total += beforeBytes.length + afterBytes.length;
            if (total > 1024 * 1024) throw denied("BOARD_DELIVERY_LIMIT");
            result.add(new File(path, entry == null ? "absent" : hash(beforeBytes), hash(afterBytes), before, after));
        }
        requireCurrent(root, git, base, expected, deadline);
        if (!conversion.equals(conversion(root, git, expected, deadline))) throw denied("BOARD_DELIVERY_SOURCE_STALE");
        return List.copyOf(result);
    }
    private BoardDeliveryConversion.Rules conversion(Path root, GitCapability git, BoardVerificationSource.Source source, long deadline) {
        return BoardDeliveryConversion.inspect(source.files().stream().map(BoardVerificationSource.File::path).toList(),
            (step, paths) -> invoke(root, git.deliveryConversionCommand(step, paths), deadline));
    }
    public void requireCurrent(Path root, GitCapability git, String base, BoardVerificationSource.Source expected) {
        requireCurrent(root, git, base, expected, clock.getAsLong()+java.util.concurrent.TimeUnit.SECONDS.toNanos(50));
    }
    private void requireCurrent(Path root, GitCapability git, String base, BoardVerificationSource.Source expected, long deadline) {
        String reported = invoke(root, git.reviewCommand("root", null, Set.of()), deadline).strip();
        try { if (!root.toRealPath().equals(Path.of(reported).toRealPath())) throw denied("BOARD_WORKSPACE_CHANGED"); }
        catch (java.io.IOException failure) { throw denied("BOARD_WORKSPACE_CHANGED"); }
        if (!base.equals(invoke(root, git.reviewCommand("head", null, Set.of()), deadline).strip()) || !expected.equals(sources.snapshot(root)) || !base.equals(invoke(root, git.reviewCommand("head-after", null, Set.of()), deadline).strip())) throw denied("BOARD_DELIVERY_SOURCE_STALE");
    }
    static void validatePaths(List<String> paths) {
        if (paths == null || paths.isEmpty() || paths.size() > 8 || new HashSet<>(paths).size() != paths.size()) throw new IllegalArgumentException("INVALID_BOARD_DELIVERY_PATHS");
        for (String path : paths) if (path == null || path.length() > 512 || !path.matches("frontend/(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\\.(vue|ts|tsx|js|jsx|mjs|cjs|css|html)") || !sourcePath(path)) throw new IllegalArgumentException("INVALID_BOARD_DELIVERY_PATHS");
    }

    private byte[] read(Path root, BoardVerificationSource.File file) {
        try {
            Path path = root.resolve(file.path());
            for (Path parent=path.getParent(); parent!=null && !parent.equals(root); parent=parent.getParent()) {
                if (Files.exists(parent.resolve(".git"), LinkOption.NOFOLLOW_LINKS)) throw denied("BOARD_DELIVERY_PATH_DENIED");
            }
            if (Files.isSymbolicLink(path) || !path.toRealPath().equals(root.toRealPath().resolve(file.path())) || Files.size(path) != file.bytes()) throw denied("BOARD_DELIVERY_SOURCE_STALE");
            byte[] bytes;
            try (var stream = Files.newInputStream(path, LinkOption.NOFOLLOW_LINKS)) { bytes = stream.readNBytes((int)Math.min(file.bytes()+1, 4L*1024*1024+1)); }
            if (bytes.length != file.bytes() || !hash(bytes).equals(file.contentHash())) throw denied("BOARD_DELIVERY_SOURCE_STALE");
            return bytes;
        } catch (java.io.IOException failure) { throw denied("BOARD_DELIVERY_SOURCE_STALE"); }
    }
    private String invoke(Path root, List<String> command, long deadline) {
        // Leave headroom for the existing 20-second executor, cleanup and durable interlock commit.
        if (clock.getAsLong() >= deadline) throw denied("BOARD_DELIVERY_LIMIT");
        final com.lh.eap.api.Observation result;
        try { result = executor.runIsolated("git-status", root, command, GitCapability.environment()); }
        catch (RuntimeException unknown) { throw denied("BOARD_VERIFICATION_PROCESS_UNKNOWN"); }
        if (!Boolean.TRUE.equals(result.metadata().get("processTreeCleanup"))) throw denied("BOARD_VERIFICATION_PROCESS_UNKNOWN");
        if (!result.success() || result.exitCode()!=0 || !Boolean.TRUE.equals(result.metadata().get("processExited")) || Boolean.TRUE.equals(result.metadata().get("truncated")) || !result.stdout().equals(SensitiveData.redact(result.stdout()))) throw denied("BOARD_DELIVERY_INCOMPLETE");
        return result.stdout();
    }
    private static String text(byte[] bytes) {
        if (bytes.length > 256*1024) throw denied("BOARD_DELIVERY_LIMIT");
        try {
            String value = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
            if (value.indexOf('\0') >= 0 || !value.equals(SensitiveData.redact(value))) throw denied("BOARD_DELIVERY_INCOMPLETE");
            return value;
        } catch (CharacterCodingException invalid) { throw denied("BOARD_DELIVERY_INCOMPLETE"); }
    }
    static String hash(byte[] bytes) { return digest("SHA-256", bytes); }
    private static String oid(byte[] bytes, int length) {
        byte[] prefix = ("blob " + bytes.length + "\0").getBytes(StandardCharsets.UTF_8);
        byte[] object = new byte[prefix.length + bytes.length]; System.arraycopy(prefix,0,object,0,prefix.length); System.arraycopy(bytes,0,object,prefix.length,bytes.length);
        return digest(length == 40 ? "SHA-1" : "SHA-256", object);
    }
    private static String digest(String algorithm, byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance(algorithm).digest(bytes)); }
        catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
}
