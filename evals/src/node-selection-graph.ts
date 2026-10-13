import type { readNodeXml } from "./node-xml"
import type { SelectionMode } from "./node-selection"

export function inspectSelectionGraph(xml: Awaited<ReturnType<typeof readNodeXml>>, mode: SelectionMode,
  importedNodeIDs?: string[]): { complete: boolean; failures: string[] } {
  const failures = "invalid" in xml || !xml.nodes.some((node) => node.type === "TBGImportTextFile") ||
    !xml.nodes.some((node) => node.type === "TBGExportTextFile") ? ["GRAPH_INCOMPLETE"] : []
  return { complete: !failures.length, failures }
}
