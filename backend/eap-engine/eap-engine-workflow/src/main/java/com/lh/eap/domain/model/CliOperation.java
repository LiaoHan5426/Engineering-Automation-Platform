package com.lh.eap.domain.model;

import java.util.List;

public record CliOperation(String capabilityId, String programId, String title,
                           List<String> args, String description, boolean builtin) {
    public CliOperation { args = List.copyOf(args); }
}
