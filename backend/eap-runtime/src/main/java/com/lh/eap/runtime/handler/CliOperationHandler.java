package com.lh.eap.runtime.handler;

import com.lh.eap.api.ProcessExecutor;
import com.lh.eap.application.service.CliChannels;
import com.lh.eap.common.SensitiveData;
import com.lh.eap.core.LocalBinaries;
import com.lh.eap.domain.model.*;
import com.lh.eap.persistence.mapper.CliProgramMapper;
import java.util.*;
import org.springframework.stereotype.Component;

/** Operator-defined operations produce process evidence, never rule facts. */
@Component
public class CliOperationHandler implements CapabilityHandler {
    private final CliProgramMapper mapper;
    private final CliChannels channels;
    private final ProcessExecutor executor;
    public CliOperationHandler(CliProgramMapper mapper, CliChannels channels, ProcessExecutor executor) {
        this.mapper = mapper; this.channels = channels; this.executor = executor;
    }
    @Override public Set<String> capabilities() {
        var names = new LinkedHashSet<String>();
        mapper.operations().stream().filter(op -> !op.builtin()).forEach(op -> names.add(op.capabilityId()));
        return names;
    }
    @Override public CapabilityKind kind() { return CapabilityKind.CLI; }
    @Override public List<CapabilityDescriptor> describe() {
        return mapper.operations().stream().filter(op -> !op.builtin()).map(op -> {
            var program = mapper.program(op.programId()).orElseThrow();
            return new CapabilityDescriptor(op.capabilityId(), kind(), op.title(), op.description(),
                    List.of("工作空间目录、固定参数数组"), List.of(), "ProcessExecutor · " + program.id(), program.binary(),
                    List.of(), List.of("脱敏 stdout / stderr 与退出码"), false);
        }).toList();
    }
    @Override public NodeResult handle(CapabilityContext context) {
        var op = mapper.operations().stream().filter(item -> item.capabilityId().equals(context.step().capability()) && !item.builtin()).findFirst().orElseThrow();
        var program = mapper.program(op.programId()).orElseThrow();
        var binary = channels.binaryFor(program.id(), program.binary());
        if (LocalBinaries.resolve(binary).isEmpty()) return new NodeResult(false, false, "缺少可执行文件：" + binary, Map.of());
        var command = new ArrayList<String>(); command.add(binary); command.addAll(op.args());
        var observation = executor.run(op.capabilityId(), context.workspace(), List.copyOf(command));
        var data = Map.<String, Object>of("programId", program.id(), "args", op.args(), "exitCode", observation.exitCode(),
                "stdout", redact(observation.stdout()), "stderr", redact(observation.stderr()));
        context.evidence().add(Map.of("source", op.capabilityId(), "programId", program.id(), "data", data));
        return new NodeResult(observation.success(), false, observation.success() ? "CLI 操作执行完成" : "CLI 操作执行失败", data);
    }
    private static String redact(String text) {
        var safe = SensitiveData.redact(text);
        return safe.length() > 8000 ? safe.substring(0, 8000) + "…" : safe;
    }
}
