import { defineExpert } from "./index";
export const sqlExpert = defineExpert({
  apiVersion: "eap/v1",
  kind: "Expert",
  id: "sql-expert",
  name: "SQL Expert",
  description: "Analyze SQL with authorized knowledge, metadata and execution plans.",
  inputs: {
    question: { type: "text", required: false },
    sql: { type: "sql", required: false },
    dialect: { type: "database-dialect", required: true },
  },
  knowledgeBases: ["sql-optimization", "database-dialect"],
  capabilities: [
    "sql.parse",
    "knowledge.search",
    "database.schema.read",
    "database.index.read",
    "database.explain",
  ],
  rules: ["database.credentials.never-expose", "candidate-sql.must-preserve-semantics"],
  escalation: { provider: "local-model", when: "confidence < 0.75" },
});
