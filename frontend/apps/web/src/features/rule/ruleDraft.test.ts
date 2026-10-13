import { describe, expect, it } from "vite-plus/test";
import type { RuleFact, RulePackManifest } from "@eap/runtime-client";
import { derivedCapabilities, referencedFacts, requirementGaps, unknownFacts } from "./ruleDraft";

const FACTS: RuleFact[] = [
  {
    key: "select.allColumns",
    type: "boolean",
    group: "projection",
    description: "",
    producedBy: "sql.parse",
  },
  {
    key: "predicate.leadingWildcardLike",
    type: "boolean",
    group: "predicate",
    description: "",
    producedBy: "sql.parse",
  },
  {
    key: "index.leadingColumnMatch",
    type: "boolean",
    group: "index",
    description: "",
    producedBy: "database.index.read",
  },
];

function pack(overrides: Partial<RulePackManifest> = {}): RulePackManifest {
  return {
    apiVersion: "eap/v1",
    kind: "RulePack",
    id: "custom-pack",
    name: "自定义包",
    requires: { capabilities: ["sql.parse"] },
    rules: [
      {
        id: "custom.one",
        severity: "low",
        when: { fact: "select.allColumns", op: "eq", value: true },
        evidence: "",
        suggestion: "",
      },
    ],
    ...overrides,
  };
}

describe("rule draft analysis mirrors the backend", () => {
  it("collects facts from nested conditions", () => {
    const nested = pack({
      rules: [
        {
          id: "custom.nested",
          when: {
            all: [
              { fact: "select.allColumns", op: "eq", value: true },
              { any: [{ fact: "predicate.leadingWildcardLike", op: "eq", value: true }] },
            ],
          },
          severityWhen: [
            {
              when: { not: { fact: "index.leadingColumnMatch", op: "eq", value: true } },
              severity: "high",
            },
          ],
        },
      ],
    });
    expect(referencedFacts(nested)).toEqual([
      "index.leadingColumnMatch",
      "predicate.leadingWildcardLike",
      "select.allColumns",
    ]);
  });

  it("maps facts to the capability that publishes them", () => {
    expect(derivedCapabilities(pack(), FACTS)).toEqual(["sql.parse"]);
    const withIndexFact = pack({
      rules: [
        { id: "custom.two", when: { fact: "index.leadingColumnMatch", op: "eq", value: true } },
      ],
    });
    expect(derivedCapabilities(withIndexFact, FACTS)).toEqual(["database.index.read"]);
  });

  it("refuses a rule that reads a fact no capability publishes", () => {
    const bogus = pack({
      rules: [{ id: "custom.bad", when: { fact: "predicate.invented", op: "eq", value: true } }],
    });
    expect(unknownFacts(bogus, FACTS)).toEqual(["predicate.invented"]);
  });

  it("treats a declaration as too narrow, never as too wide", () => {
    // declared only sql.parse, but the rule also reads an index fact -> a gap
    const narrow = pack({
      rules: [
        { id: "custom.three", when: { fact: "index.leadingColumnMatch", op: "eq", value: true } },
      ],
    });
    expect(requirementGaps(narrow, FACTS)).toEqual(["database.index.read"]);
    // declared wider than derived is fine: it forces the expert graph to carry a node, which is safe
    const wide = pack({
      requires: { capabilities: ["sql.parse", "database.index.read", "database.explain"] },
    });
    expect(requirementGaps(wide, FACTS)).toEqual([]);
  });
});
