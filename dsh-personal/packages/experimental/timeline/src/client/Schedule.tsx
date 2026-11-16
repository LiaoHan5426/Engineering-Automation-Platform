import { onMounted, computed, defineComponent, h, watch, shallowRef } from 'vue';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { TimelineView, IntervalReport } from '../records.ts';
import type { ViewState } from './store.ts';
import { formatDuration, formatPeriod, reportPeriods, savedPeriod } from '../periods.ts';
import { HISTORY_MS, MINUTE_MS, minuteAt } from '../policy.ts';
import { TimeScale } from './TimeScale.ts';
const hour = 3600000;
function scaleAt(zoom: number, scales: readonly number[]): number {
    const position = Math.max(0, Math.min(scales.length - 1, zoom));
    const lower = Math.floor(position);
    // The nonempty zoom ladder clamps both indexes to its bounds.
    // oxlint-disable-next-line typescript/no-non-null-assertion
    const start = scales[lower]!;
    // oxlint-disable-next-line typescript/no-non-null-assertion
    const end = scales[Math.ceil(position)]!;
    return start * (end / start) ** (position - lower);
}
function zoomFor(pixels: number, scales: readonly number[]): number {
    const upper = scales.findIndex(value => value >= pixels);
    if (upper <= 0)
        return upper === 0 ? 0 : scales.length - 1;
    // findIndex found an upper bound after the first stop.
    // oxlint-disable-next-line typescript/no-non-null-assertion
    const low = scales[upper - 1]!;
    // oxlint-disable-next-line typescript/no-non-null-assertion
    const high = scales[upper]!;
    return upper - 1 + Math.log(pixels / low) / Math.log(high / low);
}
interface ScheduleProps extends PropsLocale<'timeline'> {
    locale?: string;
    cadence: Parameters<typeof reportPeriods>[0];
    view: TimelineView;
    state: ViewState;
    now: number;
    update: (patch: Partial<ViewState>) => void;
    openReport: (id: IntervalReport['id']) => void;
}
/** All hierarchy levels share one reverse time ruler; focus changes width and scale, never report identity. */
export const Schedule = defineComponent((props: ScheduleProps) => {
    const scroll = shallowRef<HTMLDivElement | null>(null);
    const horizontal = shallowRef<HTMLDivElement | null>(null);
    const fontMetric = shallowRef<HTMLSpanElement | null>(null);
    const viewport = shallowRef(420);
    const fontSize = shallowRef(13);
    const frameInset = shallowRef<number | null>(null);
    const clock = computed(() => minuteAt(props.now));
    const liveAnchor = computed(() => props.view.reports.reduce((latest, report) => (report.end < clock.value + MINUTE_MS ? Math.max(latest, report.end) : latest), clock.value));
    const anchor = computed(() => props.state.anchor ?? liveAnchor.value);
    const pastLiveWindow = computed(() => anchor.value <= liveAnchor.value - HISTORY_MS);
    const scales = computed(() => [2, 24, 120, 360, 1200, 3600, viewport.value * 60]);
    const configured = computed(() => reportPeriods(props.cadence));
    const spans = computed(() => Array.from({ length: props.view.reports.reduce((count, report) => Math.max(count, report.level + 1), configured.value.length) }, (_, index) => {
        const saved = props.view.reports.findLast(report => report.level === index);
        return configured.value[index] ?? (saved && savedPeriod(saved)) ?? MINUTE_MS;
    }));
    const blocks = computed(() => [...props.view.reports].sort((a, b) => b.end - a.end));
    const available = computed(() => blocks.value.filter(report => report.end > anchor.value - HISTORY_MS && report.start < anchor.value));
    const latest = computed(() => blocks.value.find(report => report.end <= liveAnchor.value));
    const lastReceived = computed(() => props.view.reports.at(-1)?.id ?? null);
    const newReports = computed(() => props.state.historyReport !== undefined && props.state.historyReport !== lastReceived.value && lastReceived.value !== null);
    const historyReport = computed(() => props.state.anchor === null ? lastReceived.value : props.state.historyReport);
    const firstLevel = computed(() => Math.max(0, spans.value.findIndex((_, index) => available.value.some(report => report.level === index))));
    const canCollapse = computed(() => spans.value.length > 1);
    const level = computed(() => props.state.level === 'all' && canCollapse.value
        ? null
        : typeof props.state.level === 'number' && props.state.level >= 0 && props.state.level < spans.value.length
            ? props.state.level
            : firstLevel.value);
    const windowFor = computed(() => (index: number, target?: IntervalReport, at = anchor.value, near = at - props.state.scrollMs) => {
        const candidates = blocks.value.filter(report => report.level === index && report.end > at - HISTORY_MS && report.start < at);
        const distance = (report: IntervalReport) => Math.max(report.start - near, near - report.end, 0);
        const nearest = target ??
            candidates.reduce<IntervalReport | undefined>((best, report) => (best === undefined || distance(report) < distance(best) ? report : best), undefined);
        const position = candidates.findIndex(report => report === nearest);
        const first = Math.max(0, Math.min(position - 1, candidates.length - 3));
        const durations = candidates
            .slice(first, first + 3)
            .map(report => report.end - report.start)
            .sort((a, b) => a - b);
        // Focus only addresses a rendered column or its report.
        // oxlint-disable-next-line typescript/no-non-null-assertion
        const span = spans.value[index]!;
        const typical = Math.max(MINUTE_MS, target === undefined
            ? durations[Math.floor(durations.length / 2)] ?? span
            : target.end - target.start);
        const fitted = (viewport.value * hour) / (typical * (target === undefined ? (durations.length || 3) + 0.5 : 1.25));
        const readable = target === undefined ? 0 : (fontSize.value * 8 * hour) / Math.max(1, target.end - target.start);
        const density = Math.max(viewport.value / (HISTORY_MS / hour), Math.min(viewport.value * 60, Math.max(fitted, readable)));
        const next = new TimeScale(at, density);
        const offset = Math.max(0, Math.min(next.height - viewport.value, next.position(nearest?.end ?? at) - viewport.value * 0.08));
        return { zoom: zoomFor(density, scales.value), scrollMs: at - next.time(offset) };
    });
    const initial = computed(() => props.state.zoom === null ? windowFor.value(level.value ?? firstLevel.value) : { zoom: props.state.zoom, scrollMs: props.state.scrollMs });
    const zoom = computed(() => initial.value.zoom);
    const scrollMs = computed(() => initial.value.scrollMs);
    const pixelsPerHour = computed(() => Math.max(scaleAt(zoom.value, scales.value), viewport.value / (HISTORY_MS / hour)));
    const scale = computed(() => new TimeScale(anchor.value, pixelsPerHour.value));
    const height = computed(() => Math.max(viewport.value, scale.value.height));
    const followLatest = computed(() => props.state.anchor === null && props.state.zoom !== null && props.state.scrollMs > 0);
    const position = computed(() => followLatest.value ? scale.value.position(available.value[0]?.end ?? anchor.value) - viewport.value * 0.08
        : scale.value.position(anchor.value - scrollMs.value));
    const offset = computed(() => Math.max(0, Math.min(height.value - viewport.value, position.value)));
    const columns = computed(() => `52px ${spans.value.map((_, index) => `minmax(48px, ${index === level.value ? 12 : 1}fr)`).join(' ')}`);
    const upper = computed(() => scale.value.time(Math.max(0, offset.value - viewport.value)));
    const lower = computed(() => scale.value.time(offset.value + viewport.value * 2));
    const reports = computed(() => available.value.filter(report => report.level < spans.value.length && report.end >= lower.value && report.start <= upper.value));
    const major = computed(() => scale.value.ticks(Math.max(0, offset.value - viewport.value), viewport.value * 3, fontSize.value * 8));
    const majorTimes = computed(() => new Set(major.value.map(Number)));
    const minor = computed(() => scale.value.ticks(Math.max(0, offset.value - viewport.value), viewport.value * 3, fontSize.value * 3)
        .filter(tick => !majorTimes.value.has(Number(tick)) &&
        major.value.every(value => Math.abs(scale.value.position(Number(value)) - scale.value.position(Number(tick))) > fontSize.value * 1.6)));
    const time = computed(() => (value: number, precise = false) => new Date(value).toLocaleString((props.locale ?? 'en'), {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        ...(precise ? { second: '2-digit' as const } : {}),
    }));
    const tickLabel = computed(() => (value: number) => new Date(value).toLocaleString((props.locale ?? 'en'), {
        ...(new Date(value).toDateString() !== new Date(anchor.value).toDateString() ||
            (viewport.value / pixelsPerHour.value) * hour >= 86400000
            ? { month: 'short' as const, day: 'numeric' as const }
            : {}),
        ...((viewport.value / pixelsPerHour.value) * hour >= 86400000
            ? {}
            : { hour: '2-digit' as const, minute: '2-digit' as const }),
    }));
    onMounted(() => watch(() => [], (_next, _previous, cleanup) => {
        const dispose0 = (() => {
            // Both refs are attached by the layout commit before measurement.
            // oxlint-disable-next-line typescript/no-non-null-assertion
            const element = scroll.value!;
            // oxlint-disable-next-line typescript/no-non-null-assertion
            const metric = fontMetric.value!;
            const measure = () => {
                if (element.clientHeight > 0)
                    viewport.value = element.clientHeight;
                frameInset.value = element.offsetWidth - element.clientWidth;
                const size = metric.getBoundingClientRect().height;
                if (size > 0)
                    fontSize.value = size;
            };
            measure();
            const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
            observer?.observe(element);
            observer?.observe(metric);
            return () => observer?.disconnect();
        })();
        if (typeof dispose0 === "function")
            cleanup(dispose0);
    }, { immediate: true, flush: "post" }));
    onMounted(() => watch(() => [frameInset.value, props.state.scrollLeft, spans.value.length], (_next, _previous, cleanup) => {
        const dispose1 = (() => {
            if (horizontal.value !== null && frameInset.value !== null)
                horizontal.value.scrollLeft = props.state.scrollLeft;
        })();
        if (typeof dispose1 === "function")
            cleanup(dispose1);
    }, { immediate: true, flush: "post" }));
    onMounted(() => watch(() => [offset.value], (_next, _previous, cleanup) => {
        const dispose2 = (() => {
            if (scroll.value !== null && Math.abs(scroll.value.scrollTop - offset.value) > 0.5)
                scroll.value.scrollTop = offset.value;
        })();
        if (typeof dispose2 === "function")
            cleanup(dispose2);
    }, { immediate: true, flush: "post" }));
    onMounted(() => watch(() => [props.state.zoom, available.value.length, zoom.value, scrollMs.value, props.update], (_next, _previous, cleanup) => {
        const dispose3 = (() => {
            if (props.state.zoom === null && available.value.length > 0)
                props.update({ zoom: zoom.value, scrollMs: scrollMs.value });
        })();
        if (typeof dispose3 === "function")
            cleanup(dispose3);
    }, { immediate: true, flush: "post" }));
    const zoomAt = computed(() => (value: number, pointer: number, scrollTop: number) => {
        const zoom = Math.max(0, Math.min(scales.value.length - 1, value));
        const nextScale = Math.max(scaleAt(zoom, scales.value), viewport.value / (HISTORY_MS / hour));
        const atPointer = scale.value.time(scrollTop + pointer);
        const next = new TimeScale(anchor.value, nextScale);
        const nextOffset = Math.max(0, Math.min(Math.max(0, next.height - viewport.value), next.position(atPointer) - pointer));
        const pinned = props.state.anchor !== null || nextOffset > 0;
        props.update({
            zoom,
            anchor: pinned ? anchor.value : null,
            historyReport: pinned ? historyReport.value : undefined,
            scrollMs: anchor.value - next.time(nextOffset),
        });
    });
    const focus = computed(() => (index: number, target?: IntervalReport) => {
        const nextAnchor = target === undefined && !pastLiveWindow.value ? liveAnchor.value : anchor.value;
        const fitted = windowFor.value(index, target, nextAnchor, scale.value.time(offset.value + viewport.value * 0.35));
        const pinned = props.state.anchor !== null || fitted.scrollMs > 0;
        // Apply the ruler and cards together; only the column widths animate.
        props.update({
            level: index,
            ...fitted,
            anchor: pinned ? nextAnchor : null,
            historyReport: pinned ? historyReport.value : undefined,
        });
    });
    onMounted(() => watch(() => [], (_next, _previous, cleanup) => {
        const dispose4 = (() => {
            // The scroll element is present whenever Schedule is mounted.
            // oxlint-disable-next-line typescript/no-non-null-assertion
            const element = scroll.value!;
            const wheel = (event: WheelEvent) => {
                if ((!event.ctrlKey && !event.metaKey) || event.deltaY === 0)
                    return;
                event.preventDefault();
                const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.value : 1);
                zoomAt.value(zoom.value - Math.max(-240, Math.min(240, delta)) / 300, Math.max(0, Math.min(viewport.value, event.clientY - element.getBoundingClientRect().top)), element.scrollTop);
            };
            element.addEventListener('wheel', wheel, { passive: false });
            return () => { element.removeEventListener('wheel', wheel); };
        })();
        if (typeof dispose4 === "function")
            cleanup(dispose4);
    }, { immediate: true, flush: "post" }));
    const ticks = computed(() => (values: Date[], kind: 'major' | 'minor') => values.map(tick => (h("div", { "class": `timeline-tick timeline-tick-${kind}`, "key": `${kind}-${Number(tick)}`, "data-tick": Number(tick), "style": { top: cssLength(scale.value.position(Number(tick))) } }, [
        h("time", null, [
            tickLabel.value(Number(tick))
        ])
    ]))));
    return () => {
        const latestSnapshot = latest.value;
        return (h("section", { "class": "timeline-schedule", "aria-label": props.t('reports') }, [
            h("p", { "class": "timeline-muted timeline-scroll-hint" }, [
                props.t('scrollHint')
            ]),
            h("div", { "class": "timeline-viewport" }, [
                h("span", { "ref": fontMetric, "class": "timeline-font-metric", "aria-hidden": "true" }),
                h("div", { "ref": horizontal, "class": "timeline-table-scroll", "onScroll": (event: Event & {
                        currentTarget: HTMLElement;
                    }) => {
                        const scrollLeft = event.currentTarget.scrollLeft;
                        if (scrollLeft !== props.state.scrollLeft)
                            props.update({ scrollLeft });
                    } }, [
                    h("div", { "style": { minWidth: cssLength(52 + spans.value.length * 48 + (frameInset.value ?? 0)) } }, [
                        h("div", { "class": "timeline-column-headers", "style": { gridTemplateColumns: columns.value }, "role": "group", "aria-label": props.t('hierarchy') }, [
                            h("span", { "class": "timeline-ruler-heading" }, [
                                props.t('time')
                            ]),
                            spans.value.map((span, index) => (h("button", { "key": index, "data-level": index, "data-history": index >= configured.value.length, "aria-description": index >= configured.value.length ? props.t('savedPeriod') : undefined, "aria-pressed": level.value === index, "aria-label": `${formatPeriod(span)} ${props.t('column')}`, "title": canCollapse.value && level.value === index ? props.t('equalColumns') : undefined, "onClick": () => {
                                    if (canCollapse.value && level.value === index)
                                        props.update({ level: 'all' });
                                    else
                                        focus.value(index);
                                } }, [
                                h("span", { "class": "timeline-level-dot", "aria-hidden": "true" }),
                                h("strong", null, [
                                    formatPeriod(span)
                                ])
                            ])))
                        ]),
                        h("div", { "ref": scroll, "class": "timeline-scroll", "aria-label": props.t('history'), "tabIndex": 0, "onKeydown": (event: KeyboardEvent & {
                                currentTarget: HTMLElement;
                            }) => {
                                if (event.key === '+' || event.key === '=' || event.key === '-') {
                                    event.preventDefault();
                                    zoomAt.value(zoom.value + (event.key === '-' ? -1 : 1), viewport.value / 2, event.currentTarget.scrollTop);
                                }
                            }, "onScroll": (event: Event & {
                                currentTarget: HTMLElement;
                            }) => {
                                if (Math.abs(event.currentTarget.scrollTop - offset.value) < 1)
                                    return;
                                const scrollMs = anchor.value - scale.value.time(event.currentTarget.scrollTop);
                                const pinned = scrollMs > 0 || pastLiveWindow.value;
                                props.update({ zoom: zoom.value, scrollMs, anchor: pinned ? anchor.value : null, historyReport: pinned ? historyReport.value : undefined });
                            } }, [
                            h("div", { "class": "timeline-canvas", "style": { height: cssLength(height.value) } }, [
                                h("div", { "class": "timeline-now" }, [
                                    props.state.anchor === null ? props.t('now') : props.t('history'),
                                    " \u00B7 ",
                                    time.value(anchor.value)
                                ]),
                                ticks.value(minor.value, 'minor'),
                                ticks.value(major.value, 'major'),
                                h("div", { "class": "timeline-columns", "style": { gridTemplateColumns: columns.value } }, [
                                    h("span", null),
                                    spans.value.map((_, index) => (h("div", { "class": "timeline-column", "key": index, "data-level": index, "data-focused": level.value === index }, [
                                        reports.value.filter(report => report.level === index)
                                            .map((report) => {
                                            const { start, end } = report;
                                            // Validated reports have at least one progress line.
                                            const [excerpt] = report.summary.progress;
                                            const top = scale.value.position(Math.min(anchor.value, end));
                                            const size = Math.max(1, Math.min(height.value, scale.value.position(start)) - top);
                                            const contentTop = Math.max(0, offset.value - top);
                                            const visibleSize = Math.max(0, Math.min(top + size, offset.value + viewport.value) - Math.max(top, offset.value));
                                            // Budget whole text lines and pin long-card labels to the visible viewport.
                                            const timeHeight = fontSize.value * 0.8 * 1.4;
                                            const lines = Math.min(4, Math.floor((visibleSize - 14 - timeHeight - 4) / (fontSize.value * 1.5)));
                                            const density = lines > 0 ? 'full' : visibleSize >= fontSize.value * 1.5 + 4 ? 'compact' : 'bar';
                                            const needsFocus = report.level !== level.value ||
                                                (density === 'bar' &&
                                                    zoom.value <
                                                        zoomFor((fontSize.value * 8 * hour) / Math.max(1, end - start), scales.value) - 0.001);
                                            return (h("button", { "key": report.id, "class": "timeline-block", "data-report-id": report.id, "data-report-start": start, "data-source": report.source, "data-level": report.level, "data-density": density, "data-needs-focus": needsFocus || undefined, "aria-label": `${props.t(needsFocus ? 'showReport' : 'openReport')}: ${time.value(start, end - start < MINUTE_MS)} – ${time.value(end, end - start < MINUTE_MS)}: ${excerpt}`, "style": { top: cssLength(top), height: cssLength(size) }, "onClick": () => {
                                                    if (needsFocus)
                                                        focus.value(report.level, report);
                                                    else
                                                        props.openReport(report.id);
                                                } }, [
                                                h("span", { "class": "timeline-block-content", "style": {
                                                        top: cssLength(contentTop),
                                                        height: cssLength(density === 'bar' ? Math.max(1, visibleSize) : undefined)
                                                    } }, [
                                                    h("span", { "class": "timeline-block-open", "aria-hidden": "true" }, [
                                                        props.t(needsFocus ? 'showShort' : 'openShort'),
                                                        " \u2197"
                                                    ]),
                                                    h("span", { "class": "timeline-block-mark", "aria-hidden": "true" }, [
                                                        "\u22EF"
                                                    ]),
                                                    density !== 'full' ? null : (h("span", { "class": "timeline-block-time" }, [
                                                        new Date(end).toLocaleTimeString((props.locale ?? 'en'), {
                                                            hour: '2-digit',
                                                            minute: '2-digit',
                                                        }),
                                                        ' ',
                                                        "\u00B7 ",
                                                        end - start < 1000 ? props.t('underSecond') : formatDuration(end - start)
                                                    ])),
                                                    density === 'bar' ? null : (h("span", { "class": "timeline-block-copy", "style": { WebkitLineClamp: Math.max(1, lines) } }, [
                                                        excerpt
                                                    ]))
                                                ])
                                            ]));
                                        })
                                    ])))
                                ])
                            ])
                        ])
                    ])
                ]),
                props.state.anchor === null && offset.value <= 0 ? null : (h(Button, { "className": "timeline-return-now", "onClick": () => {
                        scroll.value?.focus({ preventScroll: true });
                        props.update({ anchor: null, historyReport: undefined, scrollMs: 0, zoom: zoom.value });
                    } }, { default: () => [
                        h("span", { "aria-hidden": "true" }, [
                            "\u2191"
                        ]),
                        props.t(newReports.value ? 'returnNowNewReports' : 'returnNow')
                    ] }))
            ]),
            available.value.length === 0 ? (h("div", { "class": "timeline-empty" }, [
                h("p", { "class": "timeline-muted", "role": "status" }, [
                    props.t('emptyReports')
                ]),
                latestSnapshot === undefined ? null : (h(Button, { "onClick": () => {
                        props.update({
                            level: latestSnapshot.level,
                            anchor: Math.max(latestSnapshot.end, latestSnapshot.start + 1),
                            historyReport: historyReport.value,
                            scrollMs: 0,
                            zoom: null,
                        });
                        scroll.value?.focus({ preventScroll: true });
                    } }, { default: () => [
                        props.t('jumpToLastReport')
                    ] }))
            ])) : null
        ]));
    };
}, { name: "Schedule", inheritAttrs: false, props: ["view", "cadence", "state", "now", "update", "openReport", "t", "locale"] });
function cssLength(value: number | string | undefined): string | undefined { return typeof value === "number" ? `${value}px` : value; }
