package com.lh.eap.ai;

import com.lh.eap.core.ExpertAgentJournal;
import jakarta.annotation.PreDestroy;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.*;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** Polls only explicitly queued runs. The existing journal owns claims; model and file effects are never replayed here. */
@Service
public class SqlExpertAgentScheduler {
    private static final org.slf4j.Logger LOG = LoggerFactory.getLogger(SqlExpertAgentScheduler.class);
    private final SqlExpertAgentService agents;
    private final ExpertAgentJournal journal;
    private final boolean enabled;
    private final long delay;
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(Thread.ofPlatform().daemon(true).name("eap-agent-dispatch").factory());
    private final ExecutorService dispatchers = Executors.newVirtualThreadPerTaskExecutor();
    private final Set<UUID> active = ConcurrentHashMap.newKeySet();
    private final Semaphore slots = new Semaphore(4);
    private volatile boolean started, closed;

    @Autowired
    public SqlExpertAgentScheduler(SqlExpertAgentService agents, ExpertAgentJournal journal,
            @Value("${eap.agent.scheduler.enabled:true}") boolean enabled,
            @Value("${eap.agent.scheduler.poll-millis:2000}") long delay) {
        this.agents = agents; this.journal = journal; this.enabled = enabled;
        this.delay = Math.clamp(delay, 500, 60000);
    }
    @EventListener(ApplicationReadyEvent.class)
    public synchronized void start() {
        if (!enabled || closed || started) return;
        started = true;
        timer.scheduleWithFixedDelay(this::tick, 0, delay, TimeUnit.MILLISECONDS);
    }
    public boolean available() { return enabled && started && !closed; }
    public ExpertAgentJournal.Entry enqueue(String expert, UUID id, SqlExpertAgentService.Request request) {
        if (!available()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "AGENT_SCHEDULER_UNAVAILABLE");
        return agents.enqueue(expert, id, request);
    }
    void tick() {
        if (!available()) return;
        try {
            journal.recoverExpired();
            for (var pending : journal.pending(4)) {
                if (!slots.tryAcquire()) break;
                if (!active.add(pending.id())) { slots.release(); continue; }
                try {
                    dispatchers.execute(() -> dispatch(pending));
                } catch (RejectedExecutionException stopping) {
                    active.remove(pending.id()); slots.release();
                }
            }
        } catch (RuntimeException unavailable) {
            // Keep polling after a transient database failure; never log SDK/database exception payloads.
            LOG.warn("Agent dispatch scan unavailable ({})", unavailable.getClass().getSimpleName());
        }
    }
    private void dispatch(ExpertAgentJournal.Pending pending) {
        try {
            if (!closed) agents.resume(pending.expertId(), pending.id());
        } catch (ResponseStatusException rejected) {
            if (!closed && rejected.getStatusCode().value() != 429
                    && !Set.of("AGENT_RUN_NOT_RESUMABLE", "EXECUTION_ID_ALREADY_USED", "AGENT_LEASE_LOST", "AGENT_STOPPING")
                        .contains(java.util.Objects.toString(rejected.getReason(), ""))) {
                try { journal.failPending(pending, "AGENT_AUTHORITY_UNAVAILABLE"); }
                catch (RuntimeException unavailable) { LOG.warn("Agent rejection could not be recorded"); }
            }
        } catch (RuntimeException unavailable) {
            LOG.warn("Agent dispatch interrupted ({})", unavailable.getClass().getSimpleName());
        } finally { active.remove(pending.id()); slots.release(); }
    }
    @PreDestroy public synchronized void close() {
        if (closed) return;
        closed = true;
        timer.shutdownNow();
        // Mark service shutdown first so interrupted workers checkpoint as interrupted, not user-cancelled.
        agents.close();
        dispatchers.shutdown();
        try { if (!dispatchers.awaitTermination(5, TimeUnit.SECONDS)) dispatchers.shutdownNow(); }
        catch (InterruptedException interrupted) { dispatchers.shutdownNow(); Thread.currentThread().interrupt(); }
    }
}
