package com.lh.eap.application.service;
import com.lh.eap.core.LocalBinaries;
import com.lh.eap.error.CommonErrors;
import com.lh.eap.error.CliProgramErrors;

import com.lh.eap.common.SensitiveData;
import com.lh.eap.domain.expert.ExpertGraph;
import com.lh.eap.domain.model.CliOperation;
import com.lh.eap.domain.model.CliProgram;
import com.lh.eap.persistence.mapper.CapabilityUsage;
import com.lh.eap.persistence.mapper.CliProgramMapper;
import com.lh.eap.application.dto.CliOperationRequest;
import com.lh.eap.application.dto.CliProgramRequest;
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

    public String programIdForCapability(String capability) {
        return mapper.operations().stream().filter(op -> op.capabilityId().equals(capability))
                .map(CliOperation::programId).findFirst()
                .orElseGet(() -> CliChannels.programId(capability));
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
        if (request == null) throw invalid(CommonErrors.INVALID_REQUEST.code());
        var id = identifier(request.id(), "程序标识");
        if (ExpertGraph.CAPABILITIES.contains(id) || id.startsWith("mcp.")) throw invalid(CliProgramErrors.CLI_PROGRAM_ID_RESERVED.code());
        var name = safeText(request.name(), "程序名称", 120, true);
        var binary = safeText(request.binary(), "可执行文件", 500, true);
        if (binary.startsWith("-")) throw invalid(CliProgramErrors.CLI_BINARY_INVALID.code());
        if (mapper.program(id).isPresent()) throw conflict(CliProgramErrors.CLI_PROGRAM_ALREADY_EXISTS.code());
        if (mapper.programs().stream().anyMatch(program -> binaryKey(program.binary()).equals(binaryKey(binary)))) {
            throw conflict(CliProgramErrors.CLI_BINARY_ALREADY_REGISTERED.code());
        }
        var program = new CliProgram(id, name, binary, false);
        mapper.insertProgram(program);
        return program;
    }

    @Transactional
    public CliOperation saveOperation(String programId, String capabilityId, CliOperationRequest request, boolean create) {
        requireProgram(programId);
        mapper.lockProgram(programId);
        if (request == null) throw invalid(CommonErrors.INVALID_REQUEST.code());
        var id = identifier(capabilityId, "操作能力标识");
        if (request.capabilityId() != null && !id.equals(request.capabilityId())) throw invalid(CliProgramErrors.CLI_OPERATION_ID_MISMATCH.code());
        if (id.startsWith("mcp.") || ExpertGraph.CAPABILITIES.contains(id)) throw conflict(CliProgramErrors.CLI_OPERATION_RESERVED.code());
        var existing = mapper.operations().stream().filter(op -> op.capabilityId().equals(id)).findFirst();
        if (create && existing.isPresent()) throw conflict(CliProgramErrors.CLI_OPERATION_ALREADY_EXISTS.code());
        if (!create && (existing.isEmpty() || !existing.get().programId().equals(programId))) throw missing(CliProgramErrors.CLI_OPERATION_NOT_FOUND.code());
        if (!create) { mapper.lockExperts(); refuseInUse(id); }
        var args = request.args();
        if (args == null || args.size() > 100) throw invalid(CliProgramErrors.CLI_ARGUMENTS_INVALID.code());
        var checked = args.stream().map(arg -> safeText(arg, "参数", 2000, false)).toList();
        if (checked.stream().mapToInt(String::length).sum() > 8000) throw invalid(CliProgramErrors.CLI_ARGUMENTS_TOO_LARGE.code());
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
                .findFirst().orElseThrow(() -> missing(CliProgramErrors.CLI_OPERATION_NOT_FOUND.code()));
        if (op.builtin()) throw conflict(CliProgramErrors.CLI_OPERATION_BUILTIN.code());
        refuseInUse(capabilityId);
        mapper.deleteOperation(capabilityId);
        if (!program.builtin() && mapper.operations().stream().noneMatch(item -> item.programId().equals(programId))) mapper.deleteProgram(programId);
    }

    @Transactional
    public void deleteProgram(String id) {
        var program = requireProgram(id); mapper.lockProgram(id); mapper.lockExperts();
        if (program.builtin()) throw conflict(CliProgramErrors.CLI_PROGRAM_BUILTIN.code());
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
    private CliProgram requireProgram(String id) { return mapper.program(id).orElseThrow(() -> missing(CliProgramErrors.CLI_PROGRAM_NOT_FOUND.code())); }
    private void refuseInUse(String id) {
        var users = usage.usage().enabledFor(id);
        if (!users.isEmpty()) throw conflict(CliProgramErrors.CLI_OPERATION_IN_USE.code());
    }
    private static String identifier(String value, String label) {
        var text = safeText(value, label, 81, true);
        if (!text.matches("[a-z0-9][a-z0-9._-]{0,80}")) throw invalid(CliProgramErrors.CLI_IDENTIFIER_INVALID.code());
        return text;
    }
    private static String binaryKey(String binary) {
        var key = LocalBinaries.resolve(binary).map(path -> path.toAbsolutePath().normalize().toString()).orElse(binary);
        return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win") ? key.toLowerCase(Locale.ROOT) : key;
    }
    private static String safeText(String value, String label, int limit, boolean required) {
        var text = value == null ? "" : value;
        if ((required && text.isBlank()) || text.length() > limit || text.chars().anyMatch(Character::isISOControl)) throw invalid(CliProgramErrors.CLI_FIELD_INVALID.code());
        if (SensitiveData.containsSecret(text)) throw invalid(CliProgramErrors.CLI_FIELD_SECRET.code());
        return required ? text.trim() : text;
    }
    private static ResponseStatusException invalid(String text) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, text); }
    private static ResponseStatusException conflict(String text) { return new ResponseStatusException(HttpStatus.CONFLICT, text); }
    private static ResponseStatusException missing(String text) { return new ResponseStatusException(HttpStatus.NOT_FOUND, text); }
}
