import type { BoardVerificationCheck, BoardVerificationRecord } from './index';

// App *.test.ts files are excluded from vue-tsc; keep DTO regression assertions in its checked graph.
// Type-only: no test framework dependency or emitted runtime fixture.
type Assert<T extends true> = T;
export type RunningCheckCanBePending = Assert<null extends BoardVerificationCheck['finishedAt'] ? true : false>;
export type UnknownPreflightCanLackPlan = Assert<null extends BoardVerificationRecord['plan'] ? true : false>;
