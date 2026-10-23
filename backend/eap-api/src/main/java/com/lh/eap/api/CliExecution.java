package com.lh.eap.api;

import java.nio.file.Path;
import java.time.Instant;
import java.time.Duration;
import java.util.*;

/** Execution evidence is distinct from approval and independent business verification. */
public final class CliExecution {
    private CliExecution() {}
    public enum Status { CREATED, RUNNING, CANCELLING, SUCCEEDED, FAILED, REJECTED, TIMED_OUT, CANCELLED }
    public record Snapshot(UUID executionId, Status status, boolean cleanupComplete) {}
    public enum Approval { NOT_REQUIRED, PENDING, APPROVED, DENIED }
    public enum Verification { UNVERIFIED, PASSED, FAILED }
    public record Request(UUID executionId, String capability, Path directory,
                          List<String> arguments, Map<String,String> environment, Approval approval) {
        public Request {
            Objects.requireNonNull(executionId); Objects.requireNonNull(capability);
            Objects.requireNonNull(directory); Objects.requireNonNull(approval);
            arguments = List.copyOf(arguments); environment = Map.copyOf(environment);
        }
    }
    /** Server-owned policy; never construct it from an untrusted execution request. */
    public record Policy(Path authorizedRoot, String executable, List<String> argumentTemplate,
                         Set<String> allowedEnvironment, Set<Integer> sensitiveArguments,
                         boolean executionAllowed, boolean approvalRequired) {
        public Policy {
            Objects.requireNonNull(authorizedRoot); Objects.requireNonNull(executable);
            argumentTemplate = List.copyOf(argumentTemplate);
            allowedEnvironment = Set.copyOf(allowedEnvironment);
            sensitiveArguments = Set.copyOf(sensitiveArguments);
        }
    }
    public record Event(UUID executionId, long sequence, Instant timestamp, Status status) {}
    /** Runtime-owned reference; never an arbitrary path supplied by an external agent. */
    public record Artifact(UUID artifactId, UUID executionId, String kind, String relativePath,
                           String sha256, long sizeBytes) {}
    public record ReceivedLine(long sequence, Instant receivedAt, String text) {}
    public record Trace(Map<String,Instant> phases, List<ReceivedLine> stdoutLines,
                        String stderr, boolean truncated, String toolError) {
        public Trace { phases=Map.copyOf(phases);stdoutLines=List.copyOf(stdoutLines); }
        public static Trace empty(){return new Trace(Map.of(),List.of(),"",false,"");}
    }
    public record Result(UUID executionId, Status status, Approval approval, Verification verification,
                         Instant startedAt, long durationMillis, Integer exitCode, String error,
                         List<String> commandSummary, Set<String> environmentNames,
                         String stdout, String stderr, List<Event> events, List<Artifact> artifacts,
                         Trace trace, String artifactError) {
        public Result(UUID executionId, Status status, Approval approval, Verification verification,
                      Instant startedAt,long durationMillis,Integer exitCode,String error,
                      List<String> commandSummary,Set<String> environmentNames,String stdout,String stderr,
                      List<Event> events,List<Artifact> artifacts){
            this(executionId,status,approval,verification,startedAt,durationMillis,exitCode,error,
                    commandSummary,environmentNames,stdout,stderr,events,artifacts,Trace.empty(),"");
        }
        public Result {
            commandSummary = List.copyOf(commandSummary); environmentNames = Set.copyOf(environmentNames);
            events = List.copyOf(events); artifacts = List.copyOf(artifacts);
        }
    }
    public record Retention(Duration metadata, Duration logs, Duration artifacts) {
        public Retention {
            if (metadata == null || logs == null || artifacts == null || metadata.isNegative()
                    || metadata.isZero() || logs.isNegative() || logs.isZero()
                    || artifacts.isNegative() || artifacts.isZero()) throw new IllegalArgumentException("Retention must be positive");
        }
        public static Retention defaults() { return new Retention(Duration.ofDays(30), Duration.ofDays(7), Duration.ofDays(7)); }
    }
}
