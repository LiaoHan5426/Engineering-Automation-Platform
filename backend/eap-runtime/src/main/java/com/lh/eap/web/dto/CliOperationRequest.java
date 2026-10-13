package com.lh.eap.web.dto;

import java.util.List;

public record CliOperationRequest(String capabilityId, String title, List<String> args, String description) { }
