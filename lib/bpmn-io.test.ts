import { describe, expect, it } from "vitest";
import { bpmnModelToMarkdown, bpmnModelToXml, markdownToBpmnModel, xmlToBpmnModel } from "./bpmn-io";
import { validateBpmnModel } from "./bpmn-types";

const sample = {
  version: "bpmn-2.0-lite" as const,
  name: "Order Flow",
  lanes: [{ id: "sales", label: "Sales" }],
  nodes: [
    { id: "start_1", type: "start_event" as const, label: "Start", x: 100, y: 100, laneId: "sales" },
    { id: "task_1", type: "task" as const, label: "Review", x: 260, y: 100, laneId: "sales" },
    { id: "end_1", type: "end_event" as const, label: "End", x: 420, y: 100, laneId: "sales" },
  ],
  edges: [
    { id: "flow_1", sourceId: "start_1", targetId: "task_1" },
    { id: "flow_2", sourceId: "task_1", targetId: "end_1" },
  ],
};

describe("bpmn io", () => {
  it("markdown roundtrip preserves structure", () => {
    const md = bpmnModelToMarkdown(sample);
    const parsed = markdownToBpmnModel(md);
    expect(parsed.name).toBe(sample.name);
    expect(parsed.nodes.length).toBe(3);
    expect(parsed.edges.length).toBe(2);
  });

  it("xml roundtrip preserves structure", () => {
    const xml = bpmnModelToXml(sample);
    const parsed = xmlToBpmnModel(xml);
    expect(parsed.name).toBe(sample.name);
    expect(parsed.nodes.length).toBe(3);
    expect(parsed.edges.length).toBe(2);
  });

  it("validator catches invalid start events", () => {
    const invalid = { ...sample, nodes: sample.nodes.filter((n) => n.type !== "start_event") };
    const result = validateBpmnModel(invalid as typeof sample);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "start_event_count")).toBe(true);
  });
});

