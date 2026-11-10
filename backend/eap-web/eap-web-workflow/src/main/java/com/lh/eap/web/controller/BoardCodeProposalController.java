package com.lh.eap.web.controller;

import com.lh.eap.application.service.BoardCodeProposalService;
import com.lh.eap.delivery.CodeChangeService;
import java.util.Set;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@RestController
@RequestMapping("/api/board/tasks/{taskId}/code-proposals")
public class BoardCodeProposalController {
    private static final JsonMapper JSON=JsonMapper.builder().build();
    private final BoardCodeProposalService service;
    public BoardCodeProposalController(BoardCodeProposalService service){this.service=service;}
    @GetMapping public BoardCodeProposalService.Page list(@PathVariable UUID taskId,@RequestParam String projectId){return service.list(taskId,projectId);}
    @GetMapping("/{proposalId}") public CodeChangeService.ProposalStatus get(@PathVariable UUID taskId,@PathVariable UUID proposalId,@RequestParam String projectId){return service.get(taskId,proposalId,projectId);}
    @PostMapping("/{proposalId}/apply") public CodeChangeService.Applied apply(@PathVariable UUID taskId,@PathVariable UUID proposalId,@RequestBody String body){return service.apply(taskId,proposalId,action(body));}
    @PostMapping("/{proposalId}/refuse") public CodeChangeService.ProposalStatus refuse(@PathVariable UUID taskId,@PathVariable UUID proposalId,@RequestBody String body){return service.refuse(taskId,proposalId,action(body));}
    private static BoardCodeProposalService.Action action(String body){
        Object parsed;
        try {parsed=JSON.readValue(body,Object.class);}catch(RuntimeException invalid){throw invalid();}
        if(!(parsed instanceof Map<?,?> map)||!map.keySet().equals(Set.of("projectId","revision","confirmed"))
            ||!(map.get("projectId") instanceof String project)||project.isBlank()||project.length()>120
            ||!(map.get("revision") instanceof Integer||map.get("revision") instanceof Long)
            ||((Number)map.get("revision")).longValue()<1||!Boolean.TRUE.equals(map.get("confirmed")))throw invalid();
        return new BoardCodeProposalService.Action(project,((Number)map.get("revision")).longValue(),true);
    }
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("INVALID_BOARD_CODE_PROPOSAL_ACTION");}
}
