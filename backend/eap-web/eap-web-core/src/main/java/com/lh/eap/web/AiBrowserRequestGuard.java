package com.lh.eap.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URI;
import java.util.Locale;
import java.util.Set;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.http.server.PathContainer;
import org.springframework.http.server.RequestPath;
import org.springframework.web.filter.OncePerRequestFilter;

/** Browser boundary for every API route and method. Loopback alone is not an origin check. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class AiBrowserRequestGuard extends OncePerRequestFilter {
    private static final Set<String> LOOPBACK = Set.of("localhost", "127.0.0.1", "::1", "[::1]");

    @org.springframework.beans.factory.annotation.Value("${eap.web.allowed-origins:http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,http://localhost:8080,http://127.0.0.1:8080}")
    private String origins = com.lh.eap.config.WebConfiguration.DEFAULT_ORIGINS;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return false;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        // Use the same decoded, matrix-free segments as Spring MVC's PathPattern routing.
        // Raw startsWith checks miss /api/skills;x and encoded literal path segments.
        PathContainer path;
        try {
            path = RequestPath.parse(request.getRequestURI(), request.getContextPath()).pathWithinApplication();
        } catch (IllegalArgumentException malformed) {
            reject(response, 400, "PATH_REJECTED");
            return;
        }
        var segments = path.elements().stream().filter(PathContainer.PathSegment.class::isInstance)
                .map(PathContainer.PathSegment.class::cast).map(PathContainer.PathSegment::valueToMatch).toList();
        if (segments.isEmpty() || !"api".equals(segments.getFirst())) {
            chain.doFilter(request, response);
            return;
        }
        // API writes do not support matrix parameters, even with otherwise trusted headers.
        String rawPath = path.value().toLowerCase(Locale.ROOT);
        if (rawPath.contains(";") || rawPath.contains("%3b")) {
            reject(response, 400, "PATH_REJECTED");
            return;
        }
        String header = request.getHeader("Host");
        String hostName = header == null || header.isBlank() ? request.getServerName() : host(header);
        if (!loopback(hostName) || !loopback(request.getServerName())) {
            reject(response, 403, "HOST_REJECTED");
            return;
        }
        String origin = request.getHeader("Origin");
        if (origin != null && !origin.isBlank() && (!allowedOrigin(origin) || !java.util.Arrays.asList(origins.split(",")).contains(origin))) {
            reject(response, 403, "ORIGIN_REJECTED");
            return;
        }
        String type = request.getContentType();
        if (Set.of("POST", "PUT", "PATCH").contains(request.getMethod().toUpperCase(Locale.ROOT))
                && (request.getContentLengthLong() > 0 || request.getHeader("Transfer-Encoding") != null || type != null)
                && (type == null || !type.split(";", 2)[0].trim().equalsIgnoreCase("application/json"))) {
            reject(response, 415, "CONTENT_TYPE_REJECTED");
            return;
        }
        chain.doFilter(request, response);
    }

    static boolean allowedOrigin(String origin) {
        try {
            URI uri = URI.create(origin);
            if (uri.getUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null) return false;
            String path = uri.getPath();
            if (path != null && !path.isBlank() && !"/".equals(path)) return false;
            return "http".equalsIgnoreCase(uri.getScheme()) && loopback(uri.getHost());
        } catch (IllegalArgumentException invalid) {
            return false;
        }
    }

    private static boolean loopback(String host) {
        if (host == null || host.isBlank()) return false;
        return LOOPBACK.contains(host.toLowerCase(Locale.ROOT));
    }

    private static String host(String header) {
        if (header == null) return "";
        if (header.startsWith("[")) {
            int end = header.indexOf(']');
            return end > 0 ? header.substring(0, end + 1) : header;
        }
        int colon = header.lastIndexOf(':');
        return colon > 0 ? header.substring(0, colon) : header;
    }

    private static void reject(HttpServletResponse response, int status, String detail) throws IOException {
        response.setStatus(status);
        response.setContentType("application/problem+json");
        response.getWriter().write("{\"status\":" + status + ",\"detail\":\"" + detail + "\"}");
    }
}
