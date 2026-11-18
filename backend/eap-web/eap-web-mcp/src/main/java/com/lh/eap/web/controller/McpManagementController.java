package com.lh.eap.web.controller;
import com.lh.eap.runtime.mcp.client.OfficialReadonlyMcpMatrix;
import com.lh.eap.error.CommonErrors;
import com.lh.eap.application.dto.McpServerRequest;
import com.lh.eap.application.dto.McpServerActivationRequest;
import com.lh.eap.application.service.McpServerService;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class McpManagementController {
    private final McpServerService mcp;
    public McpManagementController(McpServerService mcp) { this.mcp = mcp; }
    @GetMapping("/mcp-servers")
    public Map<String, Object> mcpServers() {
        return Map.of(
                "items", mcp.list(),
                "productionMatrix", OfficialReadonlyMcpMatrix.views());
    }

    @GetMapping("/mcp-servers/{id}/operation-bindings")
    public Map<String,Object> operationBindings(@PathVariable String id) {
        try {return mcp.operationBindings(id);}
        catch(NoSuchElementException e){throw new ResponseStatusException(HttpStatus.NOT_FOUND,e.getMessage());}
        catch(IllegalArgumentException e){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,e.getMessage());}
    }
    @PutMapping("/mcp-servers/{id}/operation-bindings")
    public Map<String,Object> saveOperationBindings(@PathVariable String id,@RequestBody String json) {
        final Object parsed;
        try {parsed=tools.jackson.databind.json.JsonMapper.builder().enable(tools.jackson.core.StreamReadFeature.STRICT_DUPLICATE_DETECTION).build().readValue(json,Object.class);}
        catch(RuntimeException malformed){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,CommonErrors.INVALID_JSON.code());}
        if(!(parsed instanceof Map<?,?> body)||!body.keySet().equals(Set.of("expectedRevision","bindings"))
            ||!(body.get("expectedRevision") instanceof Number revision)||!(revision instanceof Integer||revision instanceof Long)||revision.longValue()<0)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,CommonErrors.INVALID_REQUEST.code());
        try{return mcp.saveOperationBindings(id,revision.longValue(),body.get("bindings"));}
        catch(NoSuchElementException e){throw new ResponseStatusException(HttpStatus.NOT_FOUND,e.getMessage());}
        catch(IllegalStateException e){throw new ResponseStatusException(HttpStatus.CONFLICT,e.getMessage());}
        catch(IllegalArgumentException e){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,e.getMessage());}
    }

    /** Register a server, or update one that is already registered. */
    @PostMapping("/mcp-servers")
    public Map<String, Object> registerServer(@RequestBody McpServerRequest request) {
        return saveServer(request == null ? null : request.id(), request);
    }

    @PutMapping("/mcp-servers/{id}")
    public Map<String, Object> updateServer(@PathVariable String id, @RequestBody McpServerRequest request) {
        return saveServer(id, request);
    }

    /**
     * Flip enabled/trusted without rewriting the rest of the record. Each flag alone is not enough to
     * make a server usable — see {@code McpServerRegistry.McpServer.usable()} — so the response reports
     * the resulting state rather than the flag that was sent.
     */
    @PutMapping("/mcp-servers/{id}/activation")
    public Map<String, Object> activateServer(@PathVariable String id, @RequestBody McpServerActivationRequest request) {
        try {
            return mcp.activate(id, request == null ? null : request.enabled(), request == null ? null : request.trusted());
        } catch (NoSuchElementException error) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, error.getMessage());
        } catch (IllegalStateException error) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, error.getMessage());
        } catch (IllegalArgumentException error) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, error.getMessage());
        }
    }

    /**
     * Remove a server. Refused while an enabled expert holds a grant for one of its tools, for the same
     * reason a rule pack cannot be deleted while an enabled expert references it.
     */
    @DeleteMapping("/mcp-servers/{id}")
    public Map<String, Object> deleteServer(@PathVariable String id) {
        try {
            mcp.delete(id);
        } catch (IllegalStateException error) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, error.getMessage());
        } catch (IllegalArgumentException error) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, error.getMessage());
        }
        return Map.of("id", id, "status", "deleted");
    }

    /** Transport-level check only; protocol initialization/discovery/calls are separate operations. */
    @PostMapping("/mcp-servers/{id}/probe")
    public Map<String, Object> probeServer(@PathVariable String id) {
        try {
            return mcp.probe(id);
        } catch (IllegalArgumentException error) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, error.getMessage());
        }
    }

    private Map<String, Object> saveServer(String id, McpServerRequest request) {
        if (request == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,CommonErrors.INVALID_REQUEST.code());
        try {
            mcp.save(id, request.name(), request.transport(), request.endpoint(), request.tools(),
                    Boolean.TRUE.equals(request.trusted()), Boolean.TRUE.equals(request.enabled()));
        } catch (IllegalStateException error) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, error.getMessage());
        } catch (IllegalArgumentException error) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, error.getMessage());
        }
        var result = new LinkedHashMap<String, Object>();
        result.put("id", id);
        result.put("saved", true);
        return result;
    }

}
