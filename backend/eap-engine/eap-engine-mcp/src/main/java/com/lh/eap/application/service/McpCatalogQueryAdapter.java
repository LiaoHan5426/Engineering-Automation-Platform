package com.lh.eap.application.service;

import com.lh.eap.core.McpCatalogQuery;
import com.lh.eap.persistence.mapper.McpServerRegistry;
import com.lh.eap.runtime.mcp.client.OfficialReadonlyMcpMatrix;
import java.util.Collection;
import java.util.List;
import java.util.Map;

/**
 * MCP-side implementation of the catalog port.
 *
 * <p>Delegates to the existing registry, management service and static allow-list without changing any
 * of their behaviour. Keeping the adapter in the MCP module lets the orchestration layer describe MCP
 * capabilities through {@link McpCatalogQuery} while this module owns every JDBC/protocol detail.
 */
public class McpCatalogQueryAdapter implements McpCatalogQuery {
    private final McpServerRegistry registry;
    private final McpServerService service;

    public McpCatalogQueryAdapter(McpServerRegistry registry, McpServerService service) {
        this.registry = registry;
        this.service = service;
    }

    @Override
    public Map<String, List<String>> grantsByCapability() {
        return registry.grantsByCapability();
    }

    @Override
    public Collection<String> capabilityIds() {
        return registry.capabilityIds();
    }

    @Override
    public List<Map<String, Object>> serverViews() {
        return service.list();
    }

    @Override
    public List<Map<String, Object>> productionMatrix() {
        return OfficialReadonlyMcpMatrix.views();
    }
}
