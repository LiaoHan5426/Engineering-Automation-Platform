package com.lh.eap.ai;

import com.lh.eap.config.RuntimeWorkspace;
import java.nio.file.*;
import java.util.*;
import org.springframework.stereotype.Service;

/** Bounded, read-only directory observations under the process-authorized workspace. */
@Service
public final class WorkspaceFilesService {
    public record Entry(String name, String path, boolean directory) {}
    public record Listing(String path, List<Entry> entries, boolean truncated, String denial) {}
    private static final Set<String> EXCLUDED = Set.of(".git", "node_modules", "target", "dist", ".env", ".eap");
    private final RuntimeWorkspace runtime;
    public WorkspaceFilesService(RuntimeWorkspace runtime) { this.runtime = runtime; }
    public Listing list(String requested) {
        String relative = requested == null ? "" : requested.replace('\\', '/');
        if (!runtime.root().allowed()) return denied(relative, "AUTHORIZED_ROOT_MISSING");
        try {
            Path part = Path.of(relative);
            if (part.isAbsolute() || relative.contains(":")) return denied(relative, "INVALID_DIRECTORY_PATH");
            for (Path segment : part) if (segment.toString().equals("..") || segment.toString().startsWith(".") || EXCLUDED.contains(segment.toString())) return denied(relative, "INVALID_DIRECTORY_PATH");
            Path workspace = runtime.workspace().toRealPath(), root = runtime.root().path().toRealPath();
            Path directory = workspace.resolve(part).normalize();
            if (!workspace.startsWith(root) || !directory.startsWith(workspace)) return denied(relative, "OUTSIDE_AUTHORIZED_ROOT");
            Path cursor = workspace;
            for (Path segment : part) { cursor = cursor.resolve(segment); if (Files.isSymbolicLink(cursor)) return denied(relative, "SYMLINK_NOT_ALLOWED"); }
            if (!Files.isDirectory(directory, LinkOption.NOFOLLOW_LINKS)) return denied(relative, "DIRECTORY_NOT_FOUND");
            if (!directory.toRealPath().startsWith(root)) return denied(relative, "OUTSIDE_AUTHORIZED_ROOT");
            List<Entry> entries = new ArrayList<>(); boolean truncated = false;
            try (var stream = Files.newDirectoryStream(directory)) {
                for (Path file : stream) {
                    String name = file.getFileName().toString();
                    if (name.startsWith(".") || EXCLUDED.contains(name) || Files.isSymbolicLink(file)) continue;
                    if (entries.size() == 200) { truncated = true; break; }
                    entries.add(new Entry(name, workspace.relativize(file).toString().replace('\\', '/'), Files.isDirectory(file, LinkOption.NOFOLLOW_LINKS)));
                }
            }
            entries.sort(Comparator.comparing(Entry::directory).reversed().thenComparing(Entry::name));
            return new Listing(relative, List.copyOf(entries), truncated, "");
        } catch (Exception failure) { return denied(relative, "DIRECTORY_UNAVAILABLE"); }
    }
    private static Listing denied(String path, String denial) { return new Listing(path, List.of(), false, denial); }
}
