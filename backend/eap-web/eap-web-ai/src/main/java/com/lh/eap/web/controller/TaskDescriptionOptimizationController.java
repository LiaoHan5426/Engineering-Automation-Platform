package com.lh.eap.web.controller;

import com.lh.eap.ai.TaskDescriptionOptimizer;
import com.lh.eap.config.RuntimeWorkspace;
import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.context.request.async.DeferredResult;

@RestController
@RequestMapping("/api/ai")
public final class TaskDescriptionOptimizationController {
    private final TaskDescriptionOptimizer optimizer;
    public TaskDescriptionOptimizationController(TaskDescriptionOptimizer optimizer) { this.optimizer = optimizer; }

    @PostMapping(value = "/task-description/optimizations/{requestId}", consumes = MediaType.APPLICATION_JSON_VALUE)
    public DeferredResult<TaskDescriptionOptimizer.Suggestion> optimize(@PathVariable UUID requestId,
            @RequestBody TaskDescriptionOptimizer.Request body, HttpServletRequest request) {
        var pending = optimizer.optimize(principal(request), requestId, body);
        return deferred(pending);
    }

    @PostMapping(value = "/task-detail/optimizations/{requestId}", consumes = MediaType.APPLICATION_JSON_VALUE)
    public DeferredResult<TaskDescriptionOptimizer.DetailResult> optimizeTaskDetail(@PathVariable UUID requestId,
            @RequestBody TaskDescriptionOptimizer.DetailRequest body, HttpServletRequest request) {
        return deferred(optimizer.optimizeTaskDetail(principal(request), requestId, body));
    }

    private static <T> DeferredResult<T> deferred(reactor.core.publisher.Mono<T> pending) {
        // Service deadline is shorter than the MVC deadline, retaining the existing error envelope.
        var result = new DeferredResult<T>(65_000L);
        var subscription = pending.subscribe(result::setResult, result::setErrorResult);
        result.onCompletion(subscription::dispose);
        result.onTimeout(subscription::dispose);
        result.onError(error -> subscription.dispose());
        return result;
    }

    @DeleteMapping({"/task-description/optimizations/{requestId}", "/task-detail/optimizations/{requestId}"})
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(@PathVariable UUID requestId, HttpServletRequest request) {
        optimizer.cancel(principal(request), requestId);
    }

    private static String principal(HttpServletRequest request) {
        var identity = request.getUserPrincipal();
        return identity == null ? RuntimeWorkspace.OPERATOR_LABEL : identity.getName();
    }
}
