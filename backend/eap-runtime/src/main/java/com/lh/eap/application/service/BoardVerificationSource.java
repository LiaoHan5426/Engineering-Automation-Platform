package com.lh.eap.application.service;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

/** Metadata and hashes only. No links, hidden inputs, credentials, or generated trees are read. */
@Service
public class BoardVerificationSource {
    public record File(String path, String contentHash, long bytes) {}
    public record Source(String scope, String contentHash, List<File> files, List<String> exclusions) {}
    private static final Set<String> DIRECTORIES = Set.of("node_modules", "dist", "target", "coverage", "build", "out", "cache", "temp", "tmp", "playwright-report", "test-results");
    private static final Set<String> EXTENSIONS = Set.of("vue", "ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "yaml", "yml", "html", "css", "scss", "sass", "less", "md", "mdx", "txt", "svg", "png", "jpg", "jpeg", "gif", "webp", "ico", "woff", "woff2", "lock");
    public static final List<String> EXCLUSIONS = List.of(
        "Scope: frontend only; regular files including untracked files; paths are repository-relative",
        "Excluded directories: node_modules, dist, target, coverage, build, out, cache, temp, tmp, playwright-report, test-results",
        "Excluded: dot/hidden files and directories, *.tsbuildinfo, application*.yml/yaml/properties, .env*, credential/secret/password/private-key files, certificates and key stores; *token(s).json/yaml/yml/txt/lock (design tokens.css is source)",
        "Included extensions only: vue, ts, tsx, js, jsx, mjs, cjs, json, yaml, yml, html, css, scss, sass, less, md, mdx, txt, svg, png, jpg, jpeg, gif, webp, ico, woff, woff2, lock",
        "Limits: 4096 files, 10000 visited entries, 4 MiB/file, 32 MiB total, depth 32, 10 seconds; links and incomplete reads block",
        "Not proven: dependencies, excluded/external inputs, or changes restored between snapshots; directory binding is not a sandbox");
    private static final JsonMapper JSON = JsonMapper.builder().build();
    public Source snapshot(Path repository) {
        try {
            var root = repository.toRealPath(); var scope = root.resolve("frontend");
            if (Files.isSymbolicLink(scope) || !Files.isDirectory(scope, LinkOption.NOFOLLOW_LINKS) || !scope.toRealPath().equals(scope)) throw denied("BOARD_VERIFICATION_SCOPE_UNAVAILABLE");
            var files = new ArrayList<File>(); long[] totals = {0, 0};
            long deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(10);
            Files.walkFileTree(scope, EnumSet.noneOf(FileVisitOption.class), 33, new SimpleFileVisitor<>() {
                private void check(Path path, BasicFileAttributes attrs) throws IOException {
                    if (++totals[1] > 10000 || System.nanoTime() > deadline) throw denied("BOARD_VERIFICATION_SOURCE_LIMIT");
                    if (attrs.isSymbolicLink() || !path.toRealPath().startsWith(scope) || !path.toRealPath().equals(path)) throw denied("BOARD_VERIFICATION_SOURCE_LINK");
                }
                @Override public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) throws IOException {
                    check(dir, attrs);
                    if (!dir.equals(scope) && (hidden(dir) || DIRECTORIES.contains(dir.getFileName().toString().toLowerCase(Locale.ROOT)))) return FileVisitResult.SKIP_SUBTREE;
                    return FileVisitResult.CONTINUE;
                }
                @Override public FileVisitResult visitFile(Path path, BasicFileAttributes attrs) throws IOException {
                    check(path, attrs);
                    if (attrs.isDirectory()) throw denied("BOARD_VERIFICATION_SOURCE_LIMIT");
                    if (excluded(path)) return FileVisitResult.CONTINUE;
                    if (!attrs.isRegularFile()) throw denied("BOARD_VERIFICATION_SOURCE_UNREADABLE");
                    if (files.size() >= 4096 || attrs.size() > 4L * 1024 * 1024 || totals[0] + attrs.size() > 32L * 1024 * 1024) throw denied("BOARD_VERIFICATION_SOURCE_LIMIT");
                    var hash = digest(); long count = 0;
                    try (var channel = Files.newByteChannel(path, Set.of(StandardOpenOption.READ, LinkOption.NOFOLLOW_LINKS))) {
                        var buffer = ByteBuffer.allocate(8192);
                        while (channel.read(buffer) != -1) {
                            buffer.flip(); count += buffer.remaining();
                            if (count > attrs.size() || System.nanoTime() > deadline) throw denied("BOARD_VERIFICATION_SOURCE_CHANGED");
                            hash.update(buffer); buffer.clear();
                        }
                    }
                    var after = Files.readAttributes(path, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
                    if (count != attrs.size() || !Objects.equals(attrs.fileKey(), after.fileKey()) || !attrs.lastModifiedTime().equals(after.lastModifiedTime()) || after.isSymbolicLink()) throw denied("BOARD_VERIFICATION_SOURCE_CHANGED");
                    totals[0] += count;
                    files.add(new File(root.relativize(path).toString().replace('\\', '/'), HexFormat.of().formatHex(hash.digest()), count));
                    return FileVisitResult.CONTINUE;
                }
            });
            files.sort(Comparator.comparing(File::path));
            var immutable = List.copyOf(files);
            return new Source("frontend", GitReviewCapture.hash(JSON.writeValueAsString(List.of("frontend", immutable, EXCLUSIONS))), immutable, EXCLUSIONS);
        } catch (IOException failure) { throw denied("BOARD_VERIFICATION_SOURCE_UNREADABLE"); }
    }
    private static boolean hidden(Path path) throws IOException { return path.getFileName().toString().startsWith(".") || Files.isHidden(path); }
    private static boolean excluded(Path path) throws IOException {
        String name = path.getFileName().toString().toLowerCase(Locale.ROOT);
        if (hidden(path) || name.endsWith(".tsbuildinfo") || name.matches("application.*\\.(yml|yaml|properties)") || name.matches(".*(credential|secret|password|passwd|private[-_]?key|api[-_]?key|certificate|keystore).*")) return true;
        if (name.matches(".*tokens?\\.(json|yaml|yml|txt|lock)")) return true;
        int dot = name.lastIndexOf('.'); return dot < 0 || !EXTENSIONS.contains(name.substring(dot + 1));
    }
    private static MessageDigest digest() {
        try { return MessageDigest.getInstance("SHA-256"); }
        catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
    static ResponseStatusException denied(String reason) { return new ResponseStatusException(HttpStatus.CONFLICT, reason); }
}
