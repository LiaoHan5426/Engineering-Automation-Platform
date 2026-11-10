package com.lh.eap.core;
import java.util.UUID;

@FunctionalInterface
public interface DatabaseGrantQuery { boolean databaseGranted(String expertId, UUID databaseId); }
