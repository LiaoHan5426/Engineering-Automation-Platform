package com.lh.eap.web;

import java.util.Map;

/** The outcome of a single capability node. Mirrors the previous private record. */
public record NodeResult(boolean success, boolean incomplete, String message, Map<String, Object> data) { }
