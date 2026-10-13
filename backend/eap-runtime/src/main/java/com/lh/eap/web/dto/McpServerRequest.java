package com.lh.eap.web.dto;

import java.util.*;

public record McpServerRequest(String id, String name, String transport, String endpoint, List<String> tools, Boolean trusted, Boolean enabled) { }
