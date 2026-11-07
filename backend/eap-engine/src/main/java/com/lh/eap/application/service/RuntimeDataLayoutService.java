package com.lh.eap.application.service;

import com.lh.eap.config.RuntimeWorkspace;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** FS-01: read-only probe of logical data paths; no migration or writes. */
@Service
public class RuntimeDataLayoutService {
    private final RuntimeWorkspace runtime;
    private final Path workspace;
    private final String artifactRoot;
    private final String connectionStore;

    public RuntimeDataLayoutService(RuntimeWorkspace runtime, Path workspace,
                                    @Value("${eap.ai.artifact-root:.eap-ai-artifacts}") String artifactRoot,
                                    @Value("${eap.ai.connection-store:.eap/model-connections.json}") String connectionStore) {
        this.runtime = runtime;
        this.workspace = workspace;
        this.artifactRoot = artifactRoot;
        this.connectionStore = connectionStore;
    }

    public Map<String, Object> layout() {
        var entries = new ArrayList<Map<String, Object>>();
        var dataRoot = workspace.resolve(".eap");
        var probeCache = dataRoot.resolve("cache").resolve("trusted-tool-probes.json");
        var connections = resolveRelative(connectionStore);
        var artifacts = resolveRelative(artifactRoot);
        entries.add(entry("data-root", dataRoot, "本机应用数据根（相对工作区）"));
        entries.add(entry("config/model-connections", connections, "模型连接登记"));
        entries.add(entry("artifacts/ai", artifacts, "AI 执行产物目录"));
        entries.add(entry("workspace/process", workspace, "进程检测到的工作区"));
        var root = runtime.root();
        entries.add(entry(
                "workspace/authorized-root",
                root.path(),
                root.allowed() ? "已绑定的授权工作区根" : "未绑定：" + root.denial()));
        entries.add(entry("cache", dataRoot.resolve("cache"), "可重建缓存（目标布局）"));
        entries.add(entry("cache/trusted-tool-probes", probeCache, "TD-01 版本探测持久缓存"));
        entries.add(entry("logs", dataRoot.resolve("logs"), "有界运行记录（目标布局）"));
        entries.add(entry("tools", dataRoot.resolve("tools"), "受管工具目录（目标布局）"));
        entries.add(entry("tasks", dataRoot.resolve("tasks"), "任务临时与产物（目标布局）"));
        return Map.of(
                "entries", List.copyOf(entries),
                "physicalMigration", false,
                "migrationReadiness", migrationReadiness(connections, artifacts, probeCache));
    }

    private Map<String, Object> migrationReadiness(Path connections, Path artifacts, Path probeCache) {
        var candidates = new ArrayList<Map<String, Object>>();
        addCandidate(candidates, "legacy-ai-artifacts", artifacts,
                "当前配置的 AI 产物路径；目标归属仍待批准后迁入 data-root/artifacts",
                exists(artifacts) && !underDataRoot(artifacts));
        addCandidate(candidates, "model-connections", connections,
                "模型连接登记文件；迁移合同未批准前保持原路径可读",
                exists(connections));
        addCandidate(candidates, "trusted-tool-probes", probeCache,
                "TD-01 探测缓存已按目标 cache 布局落盘；不是物理迁移动作",
                exists(probeCache));
        var present = candidates.stream().anyMatch(row -> Boolean.TRUE.equals(row.get("present")));
        var readiness = new LinkedHashMap<String, Object>();
        readiness.put("status", present ? "candidates_present" : "inventory_only");
        readiness.put("physicalMigration", false);
        readiness.put("approved", false);
        readiness.put("note", "只读盘点旧/现路径存在性；未批准不执行物理迁移或删除。");
        readiness.put("candidates", List.copyOf(candidates));
        return Map.copyOf(readiness);
    }

    private void addCandidate(List<Map<String, Object>> candidates, String id, Path path,
                              String note, boolean present) {
        var row = new LinkedHashMap<String, Object>();
        row.put("id", id);
        row.put("resolved", path == null ? "" : path.toAbsolutePath().normalize().toString());
        row.put("present", present);
        row.put("note", note);
        candidates.add(row);
    }

    private boolean underDataRoot(Path path) {
        if (path == null) return false;
        var dataRoot = workspace.resolve(".eap").toAbsolutePath().normalize();
        var normalized = path.toAbsolutePath().normalize();
        return normalized.startsWith(dataRoot);
    }

    private static boolean exists(Path path) {
        return path != null && Files.exists(path.toAbsolutePath().normalize());
    }

    private Map<String, Object> entry(String logical, Path path, String note) {
        var row = new LinkedHashMap<String, Object>();
        row.put("logical", logical);
        row.put("note", note);
        if (path == null) {
            row.put("resolved", "");
            row.put("exists", false);
            return row;
        }
        var normalized = path.toAbsolutePath().normalize();
        row.put("resolved", normalized.toString());
        row.put("exists", Files.exists(normalized));
        return row;
    }

    private Path resolveRelative(String configured) {
        if (configured == null || configured.isBlank()) return workspace.resolve(".eap");
        var path = Path.of(configured.trim());
        return path.isAbsolute() ? path : workspace.resolve(path).normalize();
    }
}
