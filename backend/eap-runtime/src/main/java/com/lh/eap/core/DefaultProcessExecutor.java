package com.lh.eap.core;

import com.lh.eap.api.*;
import java.io.IOException; import java.nio.file.Path; import java.util.*;

public final class DefaultProcessExecutor implements ProcessExecutor {
  public Observation run(String capability, Path dir, List<String> command) {
    try { var p = new ProcessBuilder(command).directory(dir.toFile()).start(); var out = new String(p.getInputStream().readAllBytes()); var err = new String(p.getErrorStream().readAllBytes()); var code = p.waitFor(); return new Observation(capability, code == 0, code, out, err, Map.of("command", List.copyOf(command))); }
    catch (IOException e) { return new Observation(capability, false, -1, "", e.getMessage(), Map.of("command", List.copyOf(command))); }
    catch (InterruptedException e) { Thread.currentThread().interrupt(); return new Observation(capability, false, -1, "", "Interrupted", Map.of("command", List.copyOf(command))); }
  }
}
