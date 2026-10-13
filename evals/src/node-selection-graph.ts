import type { readNodeXml } from "./node-xml"
import type { SelectionMode } from "./node-selection"

export function inspectSelectionGraph(xml: Awaited<ReturnType<typeof readNodeXml>>, mode: SelectionMode,
  importedNodeIDs?: string[]): { complete: boolean; failures: string[] } {
  if ("invalid" in xml) return { complete: false, failures: ["GRAPH_XML_INVALID"] }
  const failures = new Set<string>()
  const inputs = new Set(["DataSource", "MainDataSource", "JoinedDataSource"])
  const outputs = new Set(["DataSet", "DataSource", "DataSourceElse"])
  const parameters = new Set(["Variables", "ControlVariables", "Connection"])
  const nodes = new Map(xml.nodes.map((node) => [`${node.scope}/${node.id}`, node]))
  const imports = new Set(importedNodeIDs === undefined
    ? xml.nodes.filter((node) => node.type === "TBGImportTextFile").map((node) => `${node.scope}/${node.id}`)
    : importedNodeIDs.flatMap((id) => {
      const matches = xml.nodes.filter((node) => node.id === id || `${node.scope}/${node.id}` === id)
      if (matches.length !== 1 || matches[0]!.type !== "TBGImportTextFile") {
        failures.add("GRAPH_IMPORT_IDENTITY_UNCONFIRMED")
        return []
      }
      return [`${matches[0]!.scope}/${matches[0]!.id}`]
    }))
  if (!imports.size) failures.add("GRAPH_IMPORT_IDENTITY_UNCONFIRMED")
  const incoming = new Map<string, string[]>()
  const upstream = new Map<string, string[]>()
  if (!xml.nodes.some((node) => node.type === "TBGImportTextFile") ||
    !xml.nodes.some((node) => node.type === "TBGExportTextFile")) failures.add("GRAPH_IMPORT_EXPORT_REQUIRED")
  for (const node of xml.nodes) {
    if (!/^Unit_[0-9]+\/Unit\.xml:0$/.test(node.scope)) failures.add("GRAPH_SCOPE_UNKNOWN")
    if (Object.values(node.inputs).some((name) => !inputs.has(name) && !parameters.has(name)) ||
      Object.values(node.outputs).some((name) => !outputs.has(name) && !parameters.has(name))) failures.add("GRAPH_PORT_UNKNOWN")
  }
  for (const link of xml.links) {
    const source = nodes.get(`${link.scope}/${link.source.NodeGuid}`)
    const target = nodes.get(`${link.scope}/${link.target.NodeGuid}`)
    const output = source?.outputs[link.source.PortGuid!]
    const input = target?.inputs[link.target.PortGuid!]
    if (!output || !input || outputs.has(output) !== inputs.has(input) ||
      Object.keys(link.source).some((key) => !["NodeGuid", "PortGuid"].includes(key)) ||
      Object.keys(link.target).some((key) => !["NodeGuid", "PortGuid"].includes(key))) {
      failures.add("GRAPH_ENDPOINT_INVALID")
      continue
    }
    if (!outputs.has(output)) continue
    const key = `${link.scope}/${link.target.NodeGuid}/${link.target.PortGuid}`
    incoming.set(key, [...(incoming.get(key) ?? []), `${link.scope}/${link.source.NodeGuid}`])
    const targetKey = `${link.scope}/${link.target.NodeGuid}`
    upstream.set(targetKey, [...(upstream.get(targetKey) ?? []), `${link.scope}/${link.source.NodeGuid}`])
    if (incoming.get(key)!.length > 1) failures.add("GRAPH_INPUT_COMPETING")
  }
  const visiting = new Set<string>()
  const visited = new Map<string, boolean>()
  function reachesImport(key: string): boolean {
    if (visiting.has(key)) { failures.add("GRAPH_DATA_CYCLE"); return false }
    if (visited.has(key)) return visited.get(key)!
    const node = nodes.get(key)!
    if (node.type === "TBGImportTextFile") return imports.has(key)
    const ports = Object.entries(node.inputs).filter(([, name]) => inputs.has(name))
    if (!ports.length) { failures.add("GRAPH_IMPORT_LINEAGE_REQUIRED"); return false }
    visiting.add(key)
    const complete = ports.map(([port]) => {
      const sources = incoming.get(`${key}/${port}`) ?? []
      if (sources.length !== 1) { failures.add("GRAPH_INPUT_SOURCE_REQUIRED"); return false }
      return reachesImport(sources[0]!)
    }).every(Boolean)
    visiting.delete(key)
    visited.set(key, complete)
    return complete
  }
  for (const node of xml.nodes.filter((node) => node.type === "TBGExportTextFile"))
    if (!reachesImport(`${node.scope}/${node.id}`)) failures.add("GRAPH_IMPORT_LINEAGE_REQUIRED")
  if (mode === "explicit-js" || mode === "capability-gap") {
    const javascript = xml.nodes.filter((node) => ["TBGJavaScriptEngine", "TBGCodeModelComponentEngine"].includes(node.type))
    if (javascript.length !== 1) failures.add("GRAPH_SINGLE_JAVASCRIPT_REQUIRED")
    if (mode === "explicit-js" && xml.nodes.some((node) => node.type === "TBGGroupDataEngine"))
      failures.add("GRAPH_EXPLICIT_JS_NATIVE_AGGREGATION")
    if (javascript.length === 1) {
      const jsKey = `${javascript[0]!.scope}/${javascript[0]!.id}`
      for (const exported of xml.nodes.filter((node) => node.type === "TBGExportTextFile")) {
        const exportedAncestors = ancestors(`${exported.scope}/${exported.id}`)
        if (!xml.nodes.some((sorted) => sorted.type === "TBGSortingEngine" &&
          exportedAncestors.has(`${sorted.scope}/${sorted.id}`) && ancestors(`${sorted.scope}/${sorted.id}`).has(jsKey) &&
          (mode === "explicit-js" || xml.nodes.some((group) => group.type === "TBGGroupDataEngine" &&
            ancestors(`${sorted.scope}/${sorted.id}`).has(`${group.scope}/${group.id}`) &&
            ancestors(`${group.scope}/${group.id}`).has(jsKey))))) failures.add("GRAPH_JAVASCRIPT_NATIVE_CHAIN_REQUIRED")
      }
    }
  }
  return { complete: !failures.size, failures: [...failures] }

  function ancestors(key: string) {
    const seen = new Set<string>()
    const stack = [key]
    while (stack.length) {
      const current = stack.pop()!
      if (seen.has(current)) continue
      seen.add(current)
      stack.push(...(upstream.get(current) ?? []))
    }
    return seen
  }
}
