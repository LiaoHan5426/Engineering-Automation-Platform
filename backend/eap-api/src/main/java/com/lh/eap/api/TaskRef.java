package com.lh.eap.api;
import java.util.UUID;

/** Durable task identity shared by generation and workflow, independent of chat. */
public record TaskRef(String projectId, UUID taskId, long revision) {}
