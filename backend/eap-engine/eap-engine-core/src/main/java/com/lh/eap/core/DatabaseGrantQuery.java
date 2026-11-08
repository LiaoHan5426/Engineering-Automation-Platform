package com.lh.eap.core;

@FunctionalInterface
public interface DatabaseGrantQuery { boolean databaseGranted(String expertId, java.util.UUID databaseId); }
