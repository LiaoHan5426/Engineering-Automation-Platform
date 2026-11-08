package com.lh.eap.api;

/** Durable task identity shared by generation and workflow, independent of chat. */
public record TaskRef(String projectId, java.util.UUID taskId, long revision) {}
