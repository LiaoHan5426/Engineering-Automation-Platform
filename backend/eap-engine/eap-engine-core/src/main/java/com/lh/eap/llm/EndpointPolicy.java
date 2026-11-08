package com.lh.eap.llm;

import java.net.URI;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;

/**
 * Endpoint policy for model providers. The runtime defaults to a loopback-only endpoint and
 * requires an explicit opt-in plus HTTPS for any remote endpoint. This keeps model traffic local
 * unless the operator deliberately allows otherwise.
 */
public final class EndpointPolicy {
    private static final Set<String> LOOPBACK = Set.of("localhost", "127.0.0.1", "::1", "[::1]");

    private EndpointPolicy() { }

    public static boolean permits(String baseUrl, boolean allowRemote) {
        try {
            var uri = URI.create(baseUrl);
            if (uri.getUserInfo() != null) return false;
            var host = Objects.toString(uri.getHost(), "").toLowerCase(Locale.ROOT);
            var scheme = Objects.toString(uri.getScheme(), "");
            var loopback = LOOPBACK.contains(host);
            return (loopback && Set.of("http", "https").contains(scheme)) || (allowRemote && "https".equals(scheme));
        } catch (IllegalArgumentException invalid) {
            return false;
        }
    }
}
