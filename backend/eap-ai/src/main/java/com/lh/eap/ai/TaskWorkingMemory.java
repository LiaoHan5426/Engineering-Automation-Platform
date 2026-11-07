package com.lh.eap.ai;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/**
 * MEM-01 task working memory: goals/constraints/evidence refs separate from ChatMemory and UI history.
 * Snapshots never retain sensitive document bodies.
 */
public final class TaskWorkingMemory {
    public static final String LAYER_DISPLAY_HISTORY = "display_history";
    public static final String LAYER_MODEL_WINDOW = "model_window";
    public static final String LAYER_TASK_WORKING = "task_working";
    public static final String LAYER_BINDING = "binding";

    private TaskWorkingMemory() {}

    public record FactRef(String kind, String id, String revisionOrDigest) {
        public FactRef {
            Objects.requireNonNull(kind, "kind");
            Objects.requireNonNull(id, "id");
            revisionOrDigest = revisionOrDigest == null ? "" : revisionOrDigest;
            if (kind.length() > 40 || id.length() > 120 || revisionOrDigest.length() > 128) {
                throw new IllegalArgumentException("FACT_REF_TOO_LARGE");
            }
        }
    }

    public record Snapshot(
            String goal,
            List<String> constraints,
            List<FactRef> facts,
            List<String> evidenceRefs,
            Set<String> dependencyKeys,
            String invalidation,
            Instant updatedAt,
            List<String> layers) {
        public Snapshot {
            goal = goal == null ? "" : goal;
            constraints = List.copyOf(constraints == null ? List.of() : constraints);
            facts = List.copyOf(facts == null ? List.of() : facts);
            evidenceRefs = List.copyOf(evidenceRefs == null ? List.of() : evidenceRefs);
            dependencyKeys = Set.copyOf(dependencyKeys == null ? Set.of() : dependencyKeys);
            invalidation = invalidation == null ? "" : invalidation;
            layers = List.copyOf(layers == null ? defaultLayers() : layers);
        }

        public boolean active() {
            return invalidation.isBlank()
                    && (!goal.isBlank() || !constraints.isEmpty() || !facts.isEmpty() || !evidenceRefs.isEmpty());
        }
    }

    public static final class State {
        private String goal = "";
        private final List<String> constraints = new ArrayList<>();
        private final List<FactRef> facts = new ArrayList<>();
        private final List<String> evidenceRefs = new ArrayList<>();
        private final Set<String> dependencyKeys = new LinkedHashSet<>();
        private String invalidation = "";
        private Instant updatedAt = Instant.EPOCH;

        public static State empty() {
            return new State();
        }

        public synchronized Snapshot snapshot() {
            return new Snapshot(goal, constraints, facts, evidenceRefs, dependencyKeys, invalidation, updatedAt,
                    defaultLayers());
        }

        public synchronized void replace(String goalText, List<String> constraintTexts, List<FactRef> factRefs,
                List<String> evidence, Set<String> dependencies, Instant now) {
            goal = bound(goalText, 500);
            constraints.clear();
            if (constraintTexts != null) {
                for (var item : constraintTexts) {
                    var text = bound(item, 200);
                    if (!text.isBlank()) constraints.add(text);
                    if (constraints.size() >= 16) break;
                }
            }
            facts.clear();
            if (factRefs != null) {
                for (var fact : factRefs) {
                    if (fact != null) facts.add(fact);
                    if (facts.size() >= 32) break;
                }
            }
            evidenceRefs.clear();
            if (evidence != null) {
                for (var ref : evidence) {
                    var text = bound(ref, 200);
                    if (!text.isBlank()) evidenceRefs.add(text);
                    if (evidenceRefs.size() >= 32) break;
                }
            }
            dependencyKeys.clear();
            if (dependencies != null) dependencyKeys.addAll(dependencies);
            invalidation = "";
            updatedAt = now == null ? Instant.now() : now;
        }

        public synchronized boolean invalidate(String reason, Instant now) {
            if (reason == null || reason.isBlank()) reason = "INVALIDATED";
            boolean hadContent = !goal.isBlank() || !constraints.isEmpty() || !facts.isEmpty()
                    || !evidenceRefs.isEmpty() || !dependencyKeys.isEmpty();
            goal = "";
            constraints.clear();
            facts.clear();
            evidenceRefs.clear();
            dependencyKeys.clear();
            invalidation = reason;
            updatedAt = now == null ? Instant.now() : now;
            return hadContent;
        }
    }

    public static List<String> defaultLayers() {
        return List.of(LAYER_DISPLAY_HISTORY, LAYER_MODEL_WINDOW, LAYER_TASK_WORKING, LAYER_BINDING);
    }

    public static String dependencyKnowledge(String expertId, long revision) {
        return "knowledge:" + expertId + ":" + revision;
    }

    public static String dependencySkill(String skillId, String version, String digest) {
        return "skill:" + skillId + ":" + version + ":" + (digest == null ? "" : digest);
    }

    public static String dependencyBinding(String connectionId, String model, long revision) {
        return "binding:" + connectionId + ":" + model + ":" + revision;
    }

    public static String dependencyTask(String projectId, String taskId, long revision) {
        return "task:" + projectId + ":" + taskId + ":" + revision;
    }

    private static String bound(String value, int limit) {
        if (value == null) return "";
        var text = value.trim();
        return text.length() <= limit ? text : text.substring(0, limit);
    }
}
