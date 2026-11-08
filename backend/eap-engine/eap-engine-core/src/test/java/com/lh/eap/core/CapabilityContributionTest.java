package com.lh.eap.core;
import com.lh.eap.runtime.handler.*;
import com.lh.eap.domain.model.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
class CapabilityContributionTest {
    @Test void dynamicContributionsRefreshAndPreserveDenial() {
        var names = new HashSet<String>();
        CapabilityHandler dynamic = new CapabilityHandler() {
            public boolean dynamicCapabilities() { return true; }
            public Set<String> capabilities() { return Set.copyOf(names); }
            public CapabilityScope scope() { return CapabilityScope.EXPERT; }
            public NodeResult handle(CapabilityContext context) { throw new AssertionError("Lookup must not execute"); }
        };
        var registry = new CapabilityHandlerRegistry(List.of(dynamic), name -> false);
        assertTrue(registry.names().isEmpty());
        names.add("custom.read");
        assertTrue(registry.find("custom.read").isPresent());
        assertTrue(registry.resolveFor(null,"custom.read").isEmpty());
        assertEquals(Set.of("custom.read"), registry.expertScopedNames());
        assertTrue(registry.platformNames().isEmpty());
        names.clear(); assertTrue(registry.names().isEmpty());
    }
    @Test void collisionsBetweenStaticAndDynamicContributionsFailClosed() {
        CapabilityHandler fixed = new CapabilityHandler() {
            public Set<String> capabilities() { return Set.of("same"); }
            public NodeResult handle(CapabilityContext context) { throw new AssertionError(); }
        };
        CapabilityHandler dynamic = new CapabilityHandler() {
            public boolean dynamicCapabilities() { return true; }
            public Set<String> capabilities() { return Set.of("same"); }
            public NodeResult handle(CapabilityContext context) { throw new AssertionError(); }
        };
        assertThrows(IllegalStateException.class, () -> new CapabilityHandlerRegistry(List.of(fixed,dynamic)).find("same"));
    }
}
