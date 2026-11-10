import { defineExpert } from './index'
export const sqlExpert = defineExpert({
  apiVersion: 'eap/v1',
  kind: 'Expert',
  behavior: { id: 'sql-analysis', version: 1 },
  id: 'sql-expert',
  name: 'SQL Expert',
  description: 'Analyze SQL with authorized knowledge, metadata and execution plans.',
  inputs: {
    question: { type: 'text', required: false },
    sql: { type: 'sql', required: false },
    dialect: { type: 'database-dialect', required: true },
  },
  knowledgeBases: [],
  databaseProfiles: [],
  rulePacks: ['sql-antipatterns'],
  mcpTools: [],
  steps: [
    { id: 'parse', capability: 'sql.parse', required: true },
    { id: 'knowledge', capability: 'knowledge.search', required: true },
    { id: 'schema', capability: 'database.schema.read', required: false },
    { id: 'indexes', capability: 'database.index.read', required: false },
    { id: 'explain', capability: 'database.explain', required: false },
  ],
  edges: [
    { source: 'parse', target: 'knowledge' },
    { source: 'knowledge', target: 'schema' },
    { source: 'schema', target: 'indexes' },
    { source: 'indexes', target: 'explain' },
  ],
  rules: ['database.credentials.never-expose', 'candidate-sql.must-preserve-semantics'],
  escalation: { provider: 'local-model', when: 'confidence < 0.75' },
})
