package com.lh.eap.capability;

import com.lh.eap.api.*;

import java.util.*;
import java.util.function.Supplier;

/**
 * Read-only {@code git status} / {@code git diff}.
 *
 * <p>The binary is a supplier rather than a string because it is an operator-managed value: the
 * capability code decides <em>what</em> to run and with which arguments, while {@code CliChannels}
 * decides <em>where</em> the executable is on this machine. Resolving it per execution keeps an override
 * live instead of requiring a restart, and the argument array is never interpolated into a shell.
 */
public final class GitCapability implements Capability {
    private final String operation;
    private final Supplier<String> binary;

    public GitCapability(String operation) {
        this(operation, () -> "git");
    }

    public GitCapability(String operation, Supplier<String> binary) {
        this.operation = operation;
        this.binary = binary;
    }

    public String name() {
        return "git-" + operation;
    }

    public Observation execute(ExecutionContext c, String... args) {
        var command = new ArrayList<>(List.of(binary.get(), operation));
        command.addAll(List.of(args));
        return c.executor().run(name(), c.workspace(), command);
    }
}
