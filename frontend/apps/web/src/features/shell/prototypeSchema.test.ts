// @vitest-environment happy-dom
import { beforeEach, expect, it } from "vite-plus/test";
import {
  canAutoDeliver,
  deliveryBlockers,
  emptyPrototypeSchema,
  loadPrototypeSchema,
  loadPrototypeVersions,
  resetPrototypeSchemaForTests,
  savePrototypeSchema,
  schemaFromGrapesProject,
} from "./prototypeSchema";

beforeEach(() => {
  localStorage.clear();
  resetPrototypeSchemaForTests();
});

it('preserves actual editor hierarchy, text, layout and unsupported mappings', () => {
  const schema = schemaFromGrapesProject('Real draft', { pages: [{ frames: [{ component: { tagName: 'body', components: [
    { tagName: 'section', style: { display: 'flex', gap: '12px', 'background-image': 'url(https://example.com)' }, components: [
      { tagName: 'h1', content: 'EAP task' }, { tagName: 'button', content: 'Send' }, { tagName: 'textarea', attributes: { placeholder: 'Describe' } },
    ] }, { tagName: 'script', content: 'danger()' },
  ] } }] }] });
  const section = schema.root.children[0]!.children[0]!;
  expect(section.children.map(item => item.kind)).toEqual(['heading', 'button', 'input']);
  expect(section.children[0]!.props.text).toBe('EAP task');
  expect(section.children[0]!.props.level).toBe(1);
  expect(section.props.style).toEqual({ display: 'flex', gap: '12px' });
  expect(schema.unknownMappings).toContain('tag:script'); expect(canAutoDeliver(schema)).toBe(false);
  savePrototypeSchema(schema); expect(loadPrototypeSchema()?.root).toEqual(schema.root);
});

it("blocks automatic delivery when Grapes mappings are unknown", () => {
  const schema = schemaFromGrapesProject("Demo", { pages: [] }, ["text", "custom-chart"]);
  expect(schema.unknownMappings).toContain("custom-chart");
  expect(canAutoDeliver(schema)).toBe(false);
  expect(deliveryBlockers(schema).some((item) => item.includes("custom-chart"))).toBe(true);
});

it("persists schema without treating HTML export as Vue delivery", () => {
  const created = emptyPrototypeSchema("Nav draft");
  created.root.children = [{ id: "b1", kind: "button", props: { label: "Send" }, children: [] }];
  savePrototypeSchema(created);
  const loaded = loadPrototypeSchema();
  expect(loaded?.title).toBe("Nav draft");
  expect(loaded?.root.children[0]?.kind).toBe("button");
  expect(canAutoDeliver(loaded!)).toBe(true);
});

it("maps Grapes anchors to the registered link kind", () => {
  const schema = schemaFromGrapesProject("Link draft", {
    pages: [{ frames: [{ component: { tagName: "body", components: [
      { tagName: "a", attributes: { "data-eap-kind": "link", href: "#acceptance" }, content: "Open acceptance" },
    ] } }] }],
  });
  const link = schema.root.children[0]?.children[0];
  expect(link?.kind).toBe("link");
  expect(link?.props.label).toBe("Open acceptance");
  expect(link?.props.href).toBe("#acceptance");
  expect(schema.unknownMappings).toEqual([]);
  expect(canAutoDeliver(schema)).toBe(true);
});

it("maps Grapes headings to the registered heading kind with level", () => {
  const schema = schemaFromGrapesProject("Heading draft", {
    pages: [{ frames: [{ component: { tagName: "body", components: [
      { tagName: "h2", attributes: { "data-eap-kind": "heading", "data-level": "2" }, content: "Task board" },
      { tagName: "h3", content: "Notes" },
    ] } }] }],
  });
  const [h2, h3] = schema.root.children[0]?.children ?? [];
  expect(h2?.kind).toBe("heading");
  expect(h2?.props.level).toBe(2);
  expect(h2?.props.text).toBe("Task board");
  expect(h3?.kind).toBe("heading");
  expect(h3?.props.level).toBe(3);
  expect(schema.unknownMappings).toEqual([]);
  expect(canAutoDeliver(schema)).toBe(true);
});

it("maps Grapes lists to the registered list kind with ordered items", () => {
  const schema = schemaFromGrapesProject("List draft", {
    pages: [{ frames: [{ component: { tagName: "body", components: [
      { tagName: "ul", attributes: { "data-eap-kind": "list" }, components: [
        { tagName: "li", content: "Plan" },
        { tagName: "li", content: "Build" },
      ] },
      { tagName: "ol", components: [
        { tagName: "li", content: "First" },
        { tagName: "li", content: "Second" },
      ] },
    ] } }] }],
  });
  const [ul, ol] = schema.root.children[0]?.children ?? [];
  expect(ul?.kind).toBe("list");
  expect(ul?.props.ordered).toBe(false);
  expect(ul?.props.items).toEqual(["Plan", "Build"]);
  expect(ol?.kind).toBe("list");
  expect(ol?.props.ordered).toBe(true);
  expect(ol?.props.items).toEqual(["First", "Second"]);
  expect(schema.unknownMappings).toEqual([]);
  expect(canAutoDeliver(schema)).toBe(true);
});

it('keeps saved design versions immutable when creating another version', () => {
  const draft = emptyPrototypeSchema('First');
  const first = savePrototypeSchema(draft); draft.title = 'Second';
  const second = savePrototypeSchema(draft);
  expect(first.id).not.toBe(second.id);
  const versions = loadPrototypeVersions(); expect(versions[0]?.title).toBe('Second'); expect(versions[1]?.title).toBe('First');
});
