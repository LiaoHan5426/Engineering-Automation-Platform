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
import org.springframework.web.filter.OncePerRequestFilter;

/** Browser boundary for chat posts only. Loopback binding alone is not the origin check. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class AiBrowserRequestGuard extends OncePerRequestFilter {
    private static final Set<String> LOOPBACK = Set.of("localhost", "127.0.0.1", "::1", "[::1]");

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"POST".equalsIgnoreCase(request.getMethod()) || !request.getRequestURI().startsWith("/api/ai/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Host");
        String hostName = header == null || header.isBlank() ? request.getServerName() : host(header);
        if (!loopback(hostName) || !loopback(request.getServerName())) {
            reject(response, 403, "HOST_REJECTED");
            return;
        }
        String origin = request.getHeader("Origin");
        if (origin != null && !origin.isBlank() && !allowedOrigin(origin)) {
            reject(response, 403, "ORIGIN_REJECTED");
            return;
        }
        String type = request.getContentType();
        if (type == null || !type.toLowerCase(Locale.ROOT).startsWith("application/json")) {
            reject(response, 415, "CONTENT_TYPE_REJECTED");
            return;
        }
        chain.doFilter(request, response);
    }

    static boolean allowedOrigin(String origin) {
        try {
            URI uri = URI.create(origin);
            if (uri.getUserInfo() != null || uri.getRawQuery() != null) return false;
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
