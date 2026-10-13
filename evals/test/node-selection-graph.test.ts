import { expect, test } from "bun:test"
import { cp, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { unzip } from "../src/artifact"
import { readNodeXml } from "../src/node-xml"
import { inspectSelectionGraph } from "../src/node-selection-graph"

test("all six native reference graphs are complete, including the first-last-touch side branch", async () => {
  for (const id of ["sales-by-category", "abc-pareto-groups", "monthly-demand", "risky-approved-claims",
    "campaign-roi-by-channel", "first-last-touch"]) {
    expect(inspectSelectionGraph(await reference(id), "standard")).toEqual({ complete: true, failures: [] })
  }
})

test("data links require existing endpoints in their own scope and the correct port direction", async () => {
  const xml = await reference("sales-by-category")
  for (const change of ["source-node", "source-port", "target-direction", "foreign-scope", "unknown-port"]) {
    const altered = structuredClone(xml)
    const link = altered.links[0]!
    if (change === "source-node") link.source.NodeGuid = "missing"
    if (change === "source-port") link.source.PortGuid = "missing"
    if (change === "target-direction") link.target = { ...link.source }
    if (change === "foreign-scope") link.scope = "foreign"
    if (change === "unknown-port") altered.nodes[0]!.outputs[link.source.PortGuid!] = "UnknownTable"
    expect(inspectSelectionGraph(altered, "standard").complete).toBe(false)
  }
})

test("both Join data inputs need exactly one source on the exported ancestry", async () => {
  const xml = await reference("first-last-touch")
  const join = xml.nodes.find((node) => node.type === "TBGJoinDataEngine")!
  for (const port of Object.keys(join.inputs).filter((port) => ["MainDataSource", "JoinedDataSource"].includes(join.inputs[port]!))) {
    const altered = structuredClone(xml)
    const index = altered.links.findIndex((link) => link.target.NodeGuid === join.id && link.target.PortGuid === port)
    altered.links.splice(index, 1)
    expect(inspectSelectionGraph(altered, "standard").complete).toBe(false)
  }
  const competing = structuredClone(xml)
  competing.links.push(structuredClone(competing.links.find((link) => link.target.NodeGuid === join.id)!))
  expect(inspectSelectionGraph(competing, "standard").complete).toBe(false)
})

test("full audit requires lineage from an unambiguous confirmed input import", async () => {
  const xml = await reference("sales-by-category")
  const imported = xml.nodes.find((node) => node.type === "TBGImportTextFile")!
  expect(inspectSelectionGraph(xml, "standard", []).complete).toBe(false)
  expect(inspectSelectionGraph(xml, "standard", ["unconfirmed"]).complete).toBe(false)
  expect(inspectSelectionGraph(xml, "standard", [imported.id]).complete).toBe(true)
  const ambiguous = structuredClone(xml)
  ambiguous.nodes.push({ ...structuredClone(imported), scope: "Unit_1/Unit.xml:0" })
  expect(inspectSelectionGraph(ambiguous, "standard", [imported.id]).complete).toBe(false)
  expect(inspectSelectionGraph(ambiguous, "standard", [`${imported.scope}/${imported.id}`]).complete).toBe(true)
})

test("allowed JavaScript modes keep the required native processing on the export path", async () => {
  const xml = await reference("sales-by-category")
  expect(inspectSelectionGraph(xml, "explicit-js").complete).toBe(false)
  const group = xml.nodes.find((node) => node.type === "TBGGroupDataEngine")!
  const nativeGroup = structuredClone(group)
  group.type = "TBGJavaScriptEngine"
  expect(inspectSelectionGraph(xml, "explicit-js").complete).toBe(true)
  expect(inspectSelectionGraph(xml, "capability-gap").complete).toBe(false)
  const sorting = xml.nodes.find((node) => node.type === "TBGSortingEngine")!
  const sorted = xml.links.find((link) => link.target.NodeGuid === sorting.id)!
  const added = { ...nativeGroup, id: "gap-group" }
  xml.nodes.push(added)
  expect(inspectSelectionGraph(xml, "capability-gap").complete).toBe(false)
  xml.links.push({ scope: group.scope, source: { ...sorted.source },
    target: { NodeGuid: added.id, PortGuid: Object.keys(added.inputs).find((port) => added.inputs[port] === "DataSource")! } })
  sorted.source = { NodeGuid: added.id, PortGuid: Object.keys(added.outputs).find((port) => added.outputs[port] === "DataSource")! }
  expect(inspectSelectionGraph(xml, "capability-gap").complete).toBe(true)
  expect(inspectSelectionGraph(xml, "explicit-js").complete).toBe(false)
})

test("missing Join port metadata cannot turn a two-input node into a valid one-input graph", async () => {
  const xml = await reference("first-last-touch")
  const join = xml.nodes.find((node) => node.type === "TBGJoinDataEngine")!
  const port = Object.keys(join.inputs).find((port) => join.inputs[port] === "JoinedDataSource")!
  delete join.inputs[port]
  xml.links = xml.links.filter((link) => link.target.NodeGuid !== join.id || link.target.PortGuid !== port)
  expect(inspectSelectionGraph(xml, "standard").complete).toBe(false)
})

async function reference(id: string) {
  const root = await mkdtemp(path.join(tmpdir(), "selection-graph-"))
  try {
    await cp(path.resolve(import.meta.dir, `../tasks/analytic/${id}/reference.lgp`), path.join(root, "package.lgp"))
    if (!await unzip(path.join(root, "package.lgp"), path.join(root, "unpacked"))) throw Error("REFERENCE_XML_INVALID")
    const xml = await readNodeXml(root)
    if ("invalid" in xml) throw Error("REFERENCE_XML_INVALID")
    return xml
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
