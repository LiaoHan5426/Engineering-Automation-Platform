import type { AiMessageResult, TaskContext } from './index';
// Included by the composite compiler graph, not only transpiled by the test runner.
type Ref = NonNullable<TaskContext['knowledgeExpertRef']>;
const complete: Ref = { id: 'persisted', revision: 2 };
// @ts-expect-error revision is mandatory
const missing: Ref = { id: 'persisted' };
// @ts-expect-error null is not an explicit removal representation
const nullable: TaskContext['knowledgeExpertRef'] = null;
// @ts-expect-error revision must be numeric
const invalid: Ref = { id: 'persisted', revision: '2' };
void [complete, missing, nullable, invalid];
// The backend serializes absent retrieval as null; omission remains compatible.
const noRetrieval: AiMessageResult['knowledgeContext'] = null;
const omittedRetrieval: AiMessageResult['knowledgeContext'] = undefined;
const retrieved: AiMessageResult['knowledgeContext'] = { expertRef: complete, status: 'no_matches', references: [] };
// @ts-expect-error a present context still requires its expert identity
const missingExpert: AiMessageResult['knowledgeContext'] = { status: 'no_matches', references: [] };
void [noRetrieval, omittedRetrieval, retrieved, missingExpert];
