import { expect, test } from "bun:test"
import { graphSteps } from "../src/manual-edits"

const imported = { guid: "import", label: "Импорт", type: "import", position: { x: 0, y: 10 } }
const grouped = { guid: "group", label: "Группировка", type: "group", position: { x: 30, y: 10 } }
const sorted = { guid: "sort", label: "Сортировка", type: "sort", position: { x: 60, y: 10 } }
const link = { source: "import", output: "import-output", target: "group", input: "group-input" }
const groupToSort = { source: "group", output: "group-output", target: "sort", input: "sort-input" }
const graph = { document: "doc", workflow: "workflow", nodes: [imported, grouped], links: [link] }

test("reports rename, movement, node and port-to-port link changes at the first tool only", () => {
  const step = graphSteps()
  step("chat", "one", 1).settle(null, graph)
  const renamed = { ...imported, label: "Продажи", position: { x: 10, y: 15 } }
  const fresh = { ...graph, nodes: [renamed, sorted], links: [] }
  const next = step("chat", "two", 1)
  expect(next.readBefore).toBe(true)
  expect(next.settle(fresh, fresh)).toEqual([
    { kind: "node_renamed", guid: "import", from: "Импорт", to: "Продажи" },
    { kind: "node_moved", guid: "import", label: "Продажи", from: imported.position, to: renamed.position },
    { kind: "node_added", node: sorted },
    { kind: "node_removed", node: grouped },
    { kind: "link_removed", link, sourceLabel: "Импорт", targetLabel: "Группировка" },
  ])
  const sameStep = step("chat", "two", 1)
  expect(sameStep.readBefore).toBe(false)
  expect(sameStep.settle(graph, graph)).toEqual([])
  const linked = { ...graph, nodes: [...graph.nodes, sorted], links: [link, groupToSort] }
  expect(step("chat", "three", 1).settle(linked, linked)).toEqual([
    { kind: "node_added", node: sorted },
    { kind: "link_added", link: groupToSort, sourceLabel: "Группировка", targetLabel: "Сортировка" },
  ])
})

test("the last settled agent changes become the baseline, not manual edits", () => {
  const step = graphSteps()
  step("chat", "one", 1).settle(null, graph)
  const updated = { ...graph, nodes: [sorted, grouped, { ...imported, label: "Продажи" }], links: [groupToSort, link] }
  expect(step("chat", "two", 1).settle(graph, updated)).toEqual([])
  const reordered = { ...updated, nodes: updated.nodes.toReversed(), links: updated.links.toReversed() }
  expect(step("chat", "three", 1).settle(reordered, reordered)).toEqual([])
})

test("does not compare other conversations, generations, workflows or missing checkpoints", () => {
  const step = graphSteps()
  step("chat", "one", 1).settle(null, graph)
  const different = { ...graph, workflow: "other", nodes: [], links: [] }
  expect(step("other", "two", 1).readBefore).toBe(false)
  expect(step("chat", "two", 1).settle(different, different)).toEqual([])
  expect(step("chat", "three", 2).readBefore).toBe(false)
  step("chat", "three", 2).settle(null, graph)
  expect(step("chat", "four", 2).settle(null, null)).toEqual([])
  expect(step("chat", "five", 2).readBefore).toBe(false)
})
