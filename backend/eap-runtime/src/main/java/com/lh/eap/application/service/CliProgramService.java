package com.lh.eap.application.service;

import com.lh.eap.common.SensitiveData;
import com.lh.eap.domain.expert.ExpertGraph;
import com.lh.eap.domain.model.CliOperation;
import com.lh.eap.domain.model.CliProgram;
import com.lh.eap.persistence.mapper.CapabilityUsage;
import com.lh.eap.persistence.mapper.CliProgramMapper;
import com.lh.eap.web.dto.CliOperationRequest;
import com.lh.eap.web.dto.CliProgramRequest;
import java.nio.file.Path;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CliProgramService {
    private final CliProgramMapper mapper;
    private final CliChannels channels;
    private final CapabilityUsage usage;
    public CliProgramService(CliProgramMapper mapper, CliChannels channels, CapabilityUsage usage) {
        this.mapper = mapper; this.channels = channels; this.usage = usage;
    }

    public List<Map<String, Object>> list() {
        var operations = mapper.operations();
        return mapper.programs().stream().map(program -> {
            var view = new LinkedHashMap<String, Object>();
            view.put("id", program.id()); view.put("name", program.name()); view.put("binary", program.binary());
            view.put("builtin", program.builtin());
            view.put("channel", channels.channel(program.id(), program.binary()));
            view.put("operations", operations.stream().filter(op -> op.programId().equals(program.id())).toList());
            return (Map<String, Object>) view;
        }).toList();
    }

    @Transactional
    public CliProgram register(CliProgramRequest request) {
        if (request == null) throw invalid("缺少请求体");
        var id = identifier(request.id(), "程序标识");
        if (ExpertGraph.CAPABILITIES.contains(id) || id.startsWith("mcp.")) throw invalid("程序标识不能使用保留的能力标识");
        var name = safeText(request.name(), "程序名称", 120, true);
        var binary = safeText(request.binary(), "可执行文件", 500, true);
        if (binary.startsWith("-")) throw invalid("可执行文件不能以 - 开头");
        if (mapper.program(id).isPresent()) throw conflict("程序已登记，请在已有程序下增加操作：" + id);
        if (mapper.programs().stream().anyMatch(program -> binaryKey(program.binary()).equals(binaryKey(binary)))) {
            throw conflict("该可执行文件已有程序登记，请在已有程序下增加操作");
        }
        var program = new CliProgram(id, name, binary, false);
        mapper.insertProgram(program);
        return program;
    }

    @Transactional
    public CliOperation saveOperation(String programId, String capabilityId, CliOperationRequest request, boolean create) {
        requireProgram(programId);
        mapper.lockProgram(programId);
        if (request == null) throw invalid("缺少请求体");
        var id = identifier(capabilityId, "操作能力标识");
        if (request.capabilityId() != null && !id.equals(request.capabilityId())) throw invalid("操作标识与路径不一致");
        if (id.startsWith("mcp.") || ExpertGraph.CAPABILITIES.contains(id)) throw conflict("不能覆盖预置或专家级能力：" + id);
        var existing = mapper.operations().stream().filter(op -> op.capabilityId().equals(id)).findFirst();
        if (create && existing.isPresent()) throw conflict("操作能力标识已存在：" + id);
        if (!create && (existing.isEmpty() || !existing.get().programId().equals(programId))) throw missing("操作不存在：" + id);
        if (!create) { mapper.lockExperts(); refuseInUse(id); }
        var args = request.args();
        if (args == null || args.size() > 100) throw invalid("参数必须是最多100项的数组");
        var checked = args.stream().map(arg -> safeText(arg, "参数", 2000, false)).toList();
        if (checked.stream().mapToInt(String::length).sum() > 8000) throw invalid("参数总长度最多8000字符");
        var op = new CliOperation(id, programId, safeText(request.title(), "操作名称", 120, true), checked,
                safeText(request.description(), "用途说明", 500, false), false);
        mapper.saveOperation(op, create);
        return op;
    }

    @Transactional
    public void deleteOperation(String programId, String capabilityId) {
        var program = requireProgram(programId);
        mapper.lockProgram(programId); mapper.lockExperts();
        var op = mapper.operations().stream().filter(item -> item.programId().equals(programId) && item.capabilityId().equals(capabilityId))
                .findFirst().orElseThrow(() -> missing("操作不存在：" + capabilityId));
        if (op.builtin()) throw conflict("预置操作不可删除");
        refuseInUse(capabilityId);
        mapper.deleteOperation(capabilityId);
        if (!program.builtin() && mapper.operations().stream().noneMatch(item -> item.programId().equals(programId))) mapper.deleteProgram(programId);
    }

    @Transactional
    public void deleteProgram(String id) {
        var program = requireProgram(id); mapper.lockProgram(id); mapper.lockExperts();
        if (program.builtin()) throw conflict("预置程序不可删除");
        var operations = mapper.operations().stream().filter(op -> op.programId().equals(id)).toList();
        operations.forEach(op -> refuseInUse(op.capabilityId()));
        operations.forEach(op -> mapper.deleteOperation(op.capabilityId()));
        mapper.deleteProgram(id);
    }

    @Transactional
    public CliChannels.Channel configure(String id, String binary) {
        var program = requireProgram(id); channels.configure(id, binary);
        return channels.channel(id, program.binary());
    }
    public Map<String, Object> probe(String id, Path workspace) {
        var program = requireProgram(id); return channels.probe(id, program.binary(), workspace);
    }
    private CliProgram requireProgram(String id) { return mapper.program(id).orElseThrow(() -> missing("CLI 程序不存在：" + id)); }
    private void refuseInUse(String id) {
        var users = usage.usage().enabledFor(id);
        if (!users.isEmpty()) throw conflict("操作仍被已启用专家引用：" + String.join("、", users));
    }
    private static String identifier(String value, String label) {
        var text = safeText(value, label, 81, true);
        if (!text.matches("[a-z0-9][a-z0-9._-]{0,80}")) throw invalid(label + "格式不正确");
        return text;
    }
    private static String binaryKey(String binary) {
        var key = com.lh.eap.core.LocalBinaries.resolve(binary).map(path -> path.toAbsolutePath().normalize().toString()).orElse(binary);
        return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win") ? key.toLowerCase(Locale.ROOT) : key;
    }
    private static String safeText(String value, String label, int limit, boolean required) {
        var text = value == null ? "" : value;
        if ((required && text.isBlank()) || text.length() > limit || text.chars().anyMatch(Character::isISOControl)) throw invalid(label + "为空、过长或包含控制字符");
        if (SensitiveData.containsSecret(text)) throw invalid(label + "不能包含凭据");
        return required ? text.trim() : text;
    }
    private static ResponseStatusException invalid(String text) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, text); }
    private static ResponseStatusException conflict(String text) { return new ResponseStatusException(HttpStatus.CONFLICT, text); }
    private static ResponseStatusException missing(String text) { return new ResponseStatusException(HttpStatus.NOT_FOUND, text); }
}
