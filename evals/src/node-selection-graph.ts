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
      Object.keys(link.target).some((key) => !["NodeGuid", "PortGuid"].includes(key))) failures.add("GRAPH_ENDPOINT_INVALID")
  }
  return { complete: !failures.size, failures: [...failures] }
}
