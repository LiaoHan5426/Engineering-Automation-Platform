package com.lh.eap.domain.model;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * How the platform actually behaved over a window, computed from the task table.
 *
 * <p>概览 is the one screen whose headline figures look like they were computed, so they must be either
 * computed or explicitly labeled. This record exists so they are computed: 近 N 日任务 and 模型调用占比
 * both come from {@code eap.task}, and the status bar's 确定性覆盖 is the same value as the overview's
 * 确定性直接完成 because both read {@link #deterministicShare()} — two labels for one figure is how they
 * drift apart.
 *
 * <p>A run only enters the model ratio when its route was recorded ({@code model_enhancement} is not
 * null). Planner tasks never consult a model, so counting them as "settled deterministically" would
 * inflate the figure with runs that had no model to skip. When nothing has been recorded the shares are
 * {@code null} rather than {@code 0}: "no runs yet" and "zero percent" are different claims, and only one
 * of them is honest before the first run.
 */
public record TaskStatistics(
        int windowDays,
        long tasksTotal,
        long tasksInWindow,
        long observationsInWindow,
        long recordedRuns,
        long modelCalls,
        Map<String, Long> byStatus,
        Map<String, Long> byDecision) {

    /** Share of recorded runs that spent a model call, or {@code null} when nothing was recorded. */
    public Double modelShare() {
        return recordedRuns == 0 ? null : (double) modelCalls / recordedRuns;
    }

    /** Share of recorded runs the deterministic stage settled on its own. */
    public Double deterministicShare() {
        var share = modelShare();
        return share == null ? null : 1.0 - share;
    }

    public Map<String, Object> toMap() {
        var model = new LinkedHashMap<String, Object>();
        model.put("recordedRuns", recordedRuns);
        model.put("calls", modelCalls);
        model.put("share", modelShare());

        var map = new LinkedHashMap<String, Object>();
        map.put("windowDays", windowDays);
        map.put("tasksTotal", tasksTotal);
        map.put("tasksInWindow", tasksInWindow);
        map.put("observationsInWindow", observationsInWindow);
        map.put("byStatus", byStatus);
        map.put("byDecision", byDecision);
        map.put("model", model);
        map.put("deterministicShare", deterministicShare());
        map.put("source", "eap.task · eap.task_observation");
        map.put("note", "全部数字由任务表实时计算：近 " + windowDays + " 日的执行、其状态与决策分布，以及"
                + "记录了模型走向的执行中有多少次真正调用了模型。未到达判定阶段的执行不计入占比。");
        return map;
    }
}
