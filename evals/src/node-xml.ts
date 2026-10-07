import path from "node:path"
import { evalsRoot } from "./config"
import { nodeCase } from "./node-cases"

export type NodeXml = { scope: string; id: string; type: string; engine: Record<string, string>;
  columns: (Record<string, string> & { extension: Record<string, string> })[];
  inputs: Record<string, string>; outputs: Record<string, string>; variables: unknown[] }
export type PackageXml = { nodes: NodeXml[]; links: { scope: string; source: Record<string, string>; target: Record<string, string> }[] }
export const numericType = (type: string | undefined) => type !== undefined && ["dtFloat", "dtInteger"].includes(type)

export async function readNodeXml(artifactDir: string): Promise<PackageXml | { invalid: string }> {
  const child = Bun.spawn(["python3", path.join(evalsRoot, "script/inspect-node-package.py"),
    path.join(artifactDir, "package.lgp"), path.join(artifactDir, "unpacked")], { stdout: "pipe", stderr: "pipe" })
  const [output, error, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  if (exit !== 0) throw Error(`XML inspector failed: ${error}`)
  return JSON.parse(output)
}

export function checkNodeXml(xml: PackageXml, id: string, required: Set<string>) {
  const contract = nodeCase(id)
  const failures: string[] = []
  const imports = xml.nodes.filter(n => n.type === "TBGImportTextFile")
  const crosses = xml.nodes.filter(n => n.type === "TBGCrossTabEngine")
  const exports = xml.nodes.filter(n => n.type === "TBGExportTextFile")
  const cross = crosses[0]
  if (required.has("crosstable")) {
    if (crosses.length !== 1) failures.push("crosstable: exactly one native CrossTable required")
    if (cross) {
      const mode = cross.engine.SlidingUniqueValues === "true" ? "sliding" : "fixed"
      if (mode !== contract.mode) failures.push("crosstable: category mode differs")
      const roles = cross.columns.map(c => `${c.Name}:${c.InputColumnInfoName}:${c.UsageType}:${numericType(c.DataType) ? "numeric" : c.DataType}`).sort()
      if (JSON.stringify(roles) !== JSON.stringify(["Amount:Amount:utValue:numeric", "Category:Category:utGroup:dtString", ...contract.keys.map(k=>`${k}:${k}:utActive:dtString`)].sort()))
        failures.push("crosstable: field roles/types differ")
      const keys = cross.columns.filter(c=>c.UsageType === "utActive").sort((a,b)=>Number(a.extension.Order??0)-Number(b.extension.Order??0))
      if (JSON.stringify(keys.map(c=>c.Name))!==JSON.stringify(contract.keys) || keys.some((c,index)=>Number(c.extension.Order??0)!==index))
        failures.push("crosstable: ordered row keys differ")
      const amount = cross.columns.find(c => c.Name === "Amount")
      const aggregates:Record<string,string>={sum:"ctatSum",avg:"ctatAvg",min:"ctatMin",max:"ctatMax"}
      if (JSON.stringify((amount?.extension.AggregationTypes??"").split(/\s+/).sort()) !== JSON.stringify(contract.functions.map(f=>aggregates[f]).sort())) failures.push("crosstable: aggregate differs")
      if (contract.native && cross.columns.some(c=>c.DataType!==(c.Name==="Amount"?"dtFloat":"dtString") || c.DataKind!==(c.Name==="Amount"?"dkContinuous":"dkDiscrete")))
        failures.push("crosstable: real fact and discrete string roles required")
      if (cross.variables.length || cross.columns.some(c => c.extension.NullGroup === "true" || c.extension.OtherGroup === "true"))
        failures.push("crosstable: unexpected variable or extra category")
    }
  }
  if (required.has("graph")) {
    const byId = new Map(xml.nodes.map(n => [`${n.scope}/${n.id}`, n]))
    const edges = new Map<string, string[]>()
    const incoming = new Set<string>()
    for (const link of xml.links) {
      const s = byId.get(`${link.scope}/${link.source.NodeGuid}`), t = byId.get(`${link.scope}/${link.target.NodeGuid}`)
      if (!s || !t || !["DataSet", "DataSource"].includes(s.outputs[link.source.PortGuid!] ?? "") || t.inputs[link.target.PortGuid!] !== "DataSource") {
        failures.push("graph: invalid data port link"); continue
      }
      const key = `${s.scope}/${s.id}`
      const input = `${t.scope}/${t.id}/${link.target.PortGuid}`
      if (incoming.has(input)) failures.push("graph: competing sources for data input")
      incoming.add(input)
      edges.set(key, [...(edges.get(key) ?? []), `${t.scope}/${t.id}`])
    }
    function reaches(a: NodeXml, b: NodeXml) {
      const stack = [`${a.scope}/${a.id}`], seen = new Set<string>()
      while (stack.length) {
        const key = stack.pop()!
        if (key === `${b.scope}/${b.id}`) return true
        if (!seen.has(key)) { seen.add(key); stack.push(...(edges.get(key) ?? [])) }
      }
      return false
    }
    if (imports.length !== 1 || crosses.length !== 1 || exports.length !== 1 || !cross ||
      !reaches(imports[0]!, cross) || !reaches(cross, exports[0]!)) failures.push("graph: import → CrossTable → export required")
    if (xml.nodes.some(n => !["TBGImportTextFile", "TBGCrossTabEngine", "TBGExportTextFile", "TBGSortingEngine"].includes(n.type)))
      failures.push("graph: unsupported helper node")
  }
  return { failures, imports, cross, exports }
}
