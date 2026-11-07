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
        entries.add(entry("data-root", workspace.resolve(".eap"), "本机应用数据根（相对工作区）"));
        entries.add(entry("config/model-connections", resolveRelative(connectionStore), "模型连接登记"));
        entries.add(entry("artifacts/ai", resolveRelative(artifactRoot), "AI 执行产物目录"));
        entries.add(entry("workspace/process", workspace, "进程检测到的工作区"));
        var root = runtime.root();
        entries.add(entry(
                "workspace/authorized-root",
                root.path(),
                root.allowed() ? "已绑定的授权工作区根" : "未绑定：" + root.denial()));
        entries.add(entry("cache", workspace.resolve(".eap").resolve("cache"), "可重建缓存（目标布局）"));
        entries.add(entry("logs", workspace.resolve(".eap").resolve("logs"), "有界运行记录（目标布局）"));
        entries.add(entry("tools", workspace.resolve(".eap").resolve("tools"), "受管工具目录（目标布局）"));
        entries.add(entry("tasks", workspace.resolve(".eap").resolve("tasks"), "任务临时与产物（目标布局）"));
        return Map.of("entries", List.copyOf(entries), "physicalMigration", false);
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
