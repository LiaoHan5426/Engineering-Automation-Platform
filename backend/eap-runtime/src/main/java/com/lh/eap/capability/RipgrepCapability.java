package com.lh.eap.capability;
import com.lh.eap.api.*; import java.util.*; import java.util.function.Supplier;
/**
 * Bounded workspace search backed by ripgrep.
 *
 * <p>Like Git, the binary location is operator-managed ({@code CliChannels}) while the command line and
 * its arguments are code. The pattern is appended after {@code --} so a pattern that starts with a dash
 * cannot turn into a flag.
 */
public final class RipgrepCapability implements Capability {
  private final Supplier<String> binary;

  public RipgrepCapability() { this(() -> "rg"); }

  public RipgrepCapability(Supplier<String> binary) { this.binary = binary; }

  public String name() { return "rg-search"; }
  public Observation execute(ExecutionContext c, String... args) { var command = new ArrayList<>(List.of(binary.get(), "--line-number", "--hidden", "--glob", "!.git", "--")); command.addAll(List.of(args)); return c.executor().run(name(), c.workspace(), command); }
}
