package com.lh.eap.runtime.mcp.client;

import com.lh.eap.error.McpErrors;
import java.net.InetAddress;
import java.net.URI;
import java.util.*;
import java.util.function.BooleanSupplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

/** On-demand web materials. Returned data is untrusted evidence, never instructions or authorization. */
@Service
public final class McpWebService {
    public static final int MAX_RESULTS = 8;
    public static final int MAX_TEXT = 32_000;
    private static final java.util.concurrent.Semaphore DNS_SLOTS = new java.util.concurrent.Semaphore(4);
    private final McpClientService client;
    private final JsonMapper mapper = JsonMapper.builder().build();

    @Autowired
    public McpWebService(McpClientService client) {
        this.client=client;
    }

    private List<McpWebBinding> bindings() {
        var result=new ArrayList<McpWebBinding>();
        for(var server:client.registry().usableServers()) {
            var config=client.registry().operationBindings(server.id());
            for(var binding:config.bindings())if(binding instanceof McpOperationBinding.Web web)
                result.add(asWeb(server.id(),config,web));
        }
        return List.copyOf(result);
    }
    private static McpWebBinding asWeb(String serverId,com.lh.eap.persistence.mapper.McpServerRegistry.OperationBindings config,McpOperationBinding.Web b){
        return new McpWebBinding(serverId,config.endpoint(),config.transport(),McpWebBinding.Operation.valueOf(b.operation().name()),
                b.tool(),b.approved(),b.inputSchema(),b.inputArgument(),b.ownerPolicyArgument(),b.resultsField(),b.titleField(),b.urlField(),b.textField());
    }
    public String configuredExpert(String serverId, McpWebBinding.Operation operation) {
        return client.mapped(serverId,McpOperationBinding.Operation.valueOf(operation.name())).binding().expertId();
    }

    /** Caller resolves expert and scope on the server. The live gate must include cancellation/revocation. */
    public record Permission(UUID executionId, String expertId, String selectedServerId,
            Set<McpWebBinding.Operation> operations, BooleanSupplier currentlyAllowed) {
        public Permission { operations = Set.copyOf(operations); Objects.requireNonNull(currentlyAllowed); }
    }

    public record Source(String id, String title, String url, String text, boolean fullText,
            String serverId, String tool, UUID executionId) {}
    public record Material(List<Source> sources) { public Material { sources = List.copyOf(sources); } }

    /** No protocol/network calls: only mappings still approved by the registry and durable expert grant. */
    public Set<McpWebBinding.Operation> available(Permission permission) {
        if (permission == null || !permission.currentlyAllowed().getAsBoolean()) return Set.of();
        var result = EnumSet.noneOf(McpWebBinding.Operation.class);
        for (var binding : bindings()) {
            if (binding.approved() && binding.serverId().equals(permission.selectedServerId())
                    && permission.operations().contains(binding.operation())
                    && mappedAllowed(permission,binding.operation()))
                result.add(binding.operation());
        }
        return Set.copyOf(result);
    }

    /** Safe discovery projection; no endpoint, credentials, schemas, or protocol calls. */
    public record AvailableService(String serverId, boolean search, boolean read) {}
    public List<AvailableService> availableServices() {
        var result=new ArrayList<AvailableService>();
        for(var server:client.registry().usableServers()) {
            boolean search=false,read=false;
            for(var binding:client.registry().operationBindings(server.id()).bindings()) {
                if(binding instanceof McpOperationBinding.Web web && client.mappedAuthorized(client.mapped(server.id(),web.operation()),()->true)) {
                    search|=web.operation()==McpOperationBinding.Operation.SEARCH;
                    read|=web.operation()==McpOperationBinding.Operation.READ;
                }
            }
            if(search||read)result.add(new AvailableService(server.id(),search,read));
        }
        return List.copyOf(result);
    }
    public Material search(Permission permission, String query) {
        if (query == null || query.isBlank() || query.length() > 512) throw invalid();
        return invoke(permission, McpWebBinding.Operation.SEARCH, query.strip());
    }

    public Material read(Permission permission, String url) {
        // Check permission before DNS resolution; disabled web performs no network activity.
        select(permission, McpWebBinding.Operation.READ);
        publicUrl(url, true);
        return invoke(permission, McpWebBinding.Operation.READ, url);
    }

    private McpWebBinding select(Permission permission, McpWebBinding.Operation operation) {
        if (permission == null || !permission.currentlyAllowed().getAsBoolean()
                || !permission.operations().contains(operation) || Thread.currentThread().isInterrupted())
            throw denied();
        return bindings().stream().filter(binding -> binding.approved()
                && binding.serverId().equals(permission.selectedServerId()) && binding.operation() == operation)
                .findFirst().orElseThrow(McpWebService::denied);
    }

    private boolean mappedAllowed(Permission permission,McpWebBinding.Operation operation) {
        try {
            var selected=client.mapped(permission.selectedServerId(),McpOperationBinding.Operation.valueOf(operation.name()));
            return selected.binding().expertId().equals(permission.expertId()) && client.mappedAuthorized(selected,permission.currentlyAllowed());
        }catch(RuntimeException denied){return false;}
    }

    private Material invoke(Permission permission, McpWebBinding.Operation operation, String input) {
        var binding = select(permission, operation);
        McpClientService.Mapped mapped=null;
        {
            mapped=client.mapped(permission.selectedServerId(),McpOperationBinding.Operation.valueOf(operation.name()));
            if(!mapped.binding().expertId().equals(permission.expertId()) || !client.mappedAuthorized(mapped,permission.currentlyAllowed()))throw denied();
            binding=asWeb(mapped.serverId(),new com.lh.eap.persistence.mapper.McpServerRegistry.OperationBindings(mapped.revision(),mapped.endpoint(),mapped.transport(),List.of(mapped.binding())),(McpOperationBinding.Web)mapped.binding());
        }
        var arguments = new LinkedHashMap<String, Object>();
        arguments.put(binding.inputArgument(), input);
        if (operation == McpWebBinding.Operation.READ) {
            // The actual fetching service MUST enforce this contract on DNS resolution and each fetch.
            // An operator approves this mapping only after verifying owner enforcement; EAP cannot pin a remote DNS socket.
            arguments.put(binding.ownerPolicyArgument(), Map.of("publicHttpsOnly", true,
                    "maxRedirects", 0, "maxBytes", 262144, "timeoutMs", 5000));
        }
        var raw=client.callMapped(permission.executionId(),mapped,arguments,permission.currentlyAllowed());
        select(permission, operation); // discard late results after cancellation or revocation
        if (Boolean.TRUE.equals(raw.get("isError")))
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, McpErrors.MCP_TOOL_FAILED.code());
        Object payload = raw.get("structuredContent");
        if (payload == null && raw.get("content") instanceof List<?> content && content.size() == 1
                && content.getFirst() instanceof Map<?, ?> part && "text".equals(part.get("type"))
                && part.get("text") instanceof String text && text.length() <= 262144) {
            try { payload = mapper.readValue(text, Map.class); } catch (RuntimeException malformed) { throw invalid(); }
        }
        if (!(payload instanceof Map<?, ?> object)) throw invalid();
        Object rows = binding.resultsField() == null || binding.resultsField().isBlank()
                ? List.of(object) : object.get(binding.resultsField());
        if (!(rows instanceof List<?> entries) || entries.size() > MAX_RESULTS) throw invalid();
        var sources = new ArrayList<Source>();
        int total = 0;
        for (var entry : entries) {
            if (!(entry instanceof Map<?, ?> row)) throw invalid();
            var title = text(row, binding.titleField(), 512);
            var url = text(row, binding.urlField(), 2048);
            var body = text(row, binding.textField(), MAX_TEXT);
            publicUrl(url, false);
            // Redirects are forbidden by the reader contract; do not attribute another page to this request.
            if (operation == McpWebBinding.Operation.READ && !URI.create(input).equals(URI.create(url))) throw invalid();
            total += body.length();
            if (total > 64_000) throw invalid();
            sources.add(new Source(UUID.randomUUID().toString(),
                    title, url, body, operation == McpWebBinding.Operation.READ,
                    binding.serverId(), binding.tool(), permission.executionId()));
        }
        return new Material(sources);
    }

    private static String text(Map<?, ?> row, String field, int maximum) {
        if (!(row.get(field) instanceof String value) || value.isBlank() || value.length() > maximum) throw invalid();
        return value;
    }

    static void publicUrl(String value, boolean resolve) {
        try {
            if (value == null || value.length() > 2048) throw invalid();
            var uri = URI.create(value);
            var host = uri.getHost();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null || uri.getRawUserInfo() != null
                    || uri.getFragment() != null || (uri.getPort() != -1 && uri.getPort() != 443)
                    || host.equalsIgnoreCase("localhost") || !host.contains(".")) throw invalid();
            if (host.matches("[0-9.]+")) {
                var segments = host.split("\\.", -1);
                if (segments.length != 4) throw invalid();
                for (var segment : segments) {
                    if (!segment.matches("0|[1-9][0-9]{0,2}") || Integer.parseInt(segment) > 255) throw invalid();
                }
            }
            if (resolve || host.matches("[0-9.]+")) {
                for (var address : resolveBounded(host)) {
                    byte[] bytes = address.getAddress();
                    if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
                            || address.isSiteLocalAddress() || address.isMulticastAddress()
                            || (bytes.length == 16 && (bytes[0] & 0xfe) == 0xfc)
                            || (bytes.length == 4 && ((bytes[0] & 255) == 0
                                || (bytes[0] & 255) >= 224
                                || ((bytes[0] & 255) == 100 && (bytes[1] & 255) >= 64 && (bytes[1] & 255) <= 127))))
                        throw invalid();
                }
            } else if (host.contains(":")) {
                throw invalid();
            }
        } catch (Exception invalid) { throw invalid(); }
    }

    private static InetAddress[] resolveBounded(String host) throws Exception {
        if (!DNS_SLOTS.tryAcquire()) throw invalid();
        var result = new java.util.concurrent.CompletableFuture<InetAddress[]>();
        Thread.ofVirtual().name("mcp-web-dns").start(() -> {
            try { result.complete(InetAddress.getAllByName(host)); }
            catch (Exception failure) { result.completeExceptionally(failure); }
            finally { DNS_SLOTS.release(); }
        });
        try { return result.get(1, java.util.concurrent.TimeUnit.SECONDS); }
        catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); throw interrupted; }
        // A native resolver may outlive timeout. Keep its slot until it actually exits: at most four exist.
    }

    private static ResponseStatusException denied() {
        return new ResponseStatusException(HttpStatus.FORBIDDEN, McpErrors.MCP_TOOL_NOT_AUTHORIZED.code());
    }
    private static ResponseStatusException invalid() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, McpErrors.MCP_SERVER_INPUT_INVALID.code());
    }
}
