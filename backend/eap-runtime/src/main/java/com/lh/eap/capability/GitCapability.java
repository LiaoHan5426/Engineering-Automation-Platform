package com.lh.eap.capability;

import com.lh.eap.api.*;

import java.util.*;

public final class GitCapability implements Capability {
    private final String operation;

    public GitCapability(String operation) {
        this.operation = operation;
    }

    public String name() {
        return "git-" + operation;
    }

    public Observation execute(ExecutionContext c, String... args) {
        var command = new ArrayList<>(List.of("git", operation));
        command.addAll(List.of(args));
        return c.executor().run(name(), c.workspace(), command);
    }
}
