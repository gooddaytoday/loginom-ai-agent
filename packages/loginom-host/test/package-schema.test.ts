import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { extractPackage } from "../src/package-docs/extract"
import { savedPackageSchema, windowPackageSchema } from "../src/package-schema"

const evals = join(import.meta.dir, "../../../evals")
async function saved(path: string) {
  return savedPackageSchema("reference.lgp", await readFile(join(evals, path)))
}

test("saved schema reads positions, endpoints and filter conditions from evaluation packages", async () => {
  const schema = await saved("tasks/filter-active-rows/reference.lgp")
  expect(schema).toMatchObject({ source: "saved", scope: "package", complete: true })
  expect(new Date(schema.observed_at).toISOString()).toBe(schema.observed_at)
  const workflow = schema.workflows[0]
  expect(workflow.nodes.find((node) => node.label === "Filter")).toMatchObject({
    guid: "c34cbf70-4971-4537-8607-d3e5e422556a",
    position: { x: 480, y: 224 },
    filter_conditions: [{ field: "Active", relation: "frtIsTrue", join: "ctAnd", value: null }],
  })
  expect(workflow.links[0]).toEqual({
    source: { node_guid: "88fa4542-2b78-4dfb-858b-6372f0b0446a", port_guid: "58f7e6c3-511e-39d7-8853-036e0a1a7612" },
    target: { node_guid: "c34cbf70-4971-4537-8607-d3e5e422556a", port_guid: "9dc72a3f-56bf-3bfc-84ec-f979daf4da6b" },
  })
  const threshold = await saved("fixtures/calibration/low-liquidity-companies/reference.lgp")
  expect(
    threshold.workflows.flatMap((workflow) => workflow.nodes.flatMap((node) => node.filter_conditions ?? [])),
  ).toContainEqual({ field: "current_ratio", relation: "frtLess", join: "ctAnd", value: "1" })
})

test("saved schema reports grouping keys and measures and keeps the nested workflow keys", async () => {
  const grouped = await saved("tasks/group-sum-qty/reference.lgp")
  expect(grouped.workflows[0].nodes.find((node) => node.label === "Group")?.grouping_fields).toEqual([
    { field: "Item", role: "group", functions: null },
    { field: "Qty", role: "measure", functions: "gdSum" },
  ])
  const nested = await savedPackageSchema(
    "deep.lgp",
    await readFile(join(import.meta.dir, "fixtures/package-docs/deep.lgp")),
  )
  const module = nested.workflows[0]
  const child = module.submodels[0]
  const grandchild = child.submodels[0]
  expect(child.key.slice(0, -1)).toEqual(module.key)
  expect(grandchild.key.slice(0, -1)).toEqual(child.key)
  expect(module.nodes.some((node) => node.label === child.label && node.guid === child.key.at(-1))).toBe(true)
  expect(child.nodes.some((node) => node.label === grandchild.label && node.guid === grandchild.key.at(-1))).toBe(true)
  expect(grandchild.submodels[0].nodes[0]).toMatchObject({ type: "TBGJavaScript" })
})

test("saved edit fixtures keep node and port GUIDs across a changed export", async () => {
  const base = "tasks/local-path-scenarios/local-lgp-edit/"
  const source = base + "data/Пакет #1/sales.lgp"
  const edited = base + "reference.lgp"
  const before = (await saved(source)).workflows[0]
  const after = (await saved(edited)).workflows[0]
  const exportPath = async (path: string) =>
    (await extractPackage(join(evals, path))).modules[0].workflow_nodes.find((node) => node.label === "ExportCSV")
      ?.settings_main.FileName
  expect(await exportPath(source)).not.toBe(await exportPath(edited))
  expect(after.nodes.map((node) => [node.guid, node.ports.map((port) => port.guid)])).toEqual(
    before.nodes.map((node) => [node.guid, node.ports.map((port) => port.guid)]),
  )
  expect(after.links).toEqual(before.links)
})

test("window identity normalizes UUID spelling and preserves its runtime-only scope", () => {
  const id = "{C34CBF70-4971-4537-8607-D3E5E422556A}"
  const schema = windowPackageSchema({
    name: "Draft",
    document: "doc",
    workflow: "window-workflow",
    navigation_path: ["Module", "Scenario"],
    nodes: [{ guid: id, label: "Filter", type: "transform.filter", ports: [], position: { x: 2, y: 3 } }],
    links: [{ source: id, output: "out", target: id, input: "in" }],
  })
  expect(schema).toMatchObject({
    source: "window",
    scope: "active_workflow",
    complete: false,
    workflow: {
      document_id: "doc",
      workflow_id: "window-workflow",
      nodes: [{ guid: "c34cbf70-4971-4537-8607-d3e5e422556a" }],
      links: [{ source: { node_guid: "c34cbf70-4971-4537-8607-d3e5e422556a" } }],
    },
  })
  expect(windowPackageSchema({ workflow_id: "missing scope" })).toBeNull()
})
