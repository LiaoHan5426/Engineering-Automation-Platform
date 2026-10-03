package com.lh.eap.capability;
import com.lh.eap.api.*; import java.util.*;
public final class RipgrepCapability implements Capability {
  public String name() { return "rg-search"; }
  public Observation execute(ExecutionContext c, String... args) { var command = new ArrayList<>(List.of("rg", "--line-number", "--hidden", "--glob", "!.git", "--")); command.addAll(List.of(args)); return c.executor().run(name(), c.workspace(), command); }
}
