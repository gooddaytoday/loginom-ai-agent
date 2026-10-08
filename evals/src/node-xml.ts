import path from "node:path"
import { evalsRoot } from "./config"
import { nodeCase } from "./node-cases"
import { crossTableBindings } from "./node-bindings"

export type NodeXml = { scope: string; id: string; type: string; engine: Record<string, string>;
  columns: { Name?: string; InputColumnInfoName?: string; DataType?: string; DataKind?: string; UsageType?: string; extension: Record<string, string> }[];
  output_columns?: { Name?: string; DataType?: string; source: string | null }[];
  inputs: Record<string, string>; outputs: Record<string, string>;
  control_ports?: Record<string, string>[]; control_sockets?: Record<string, string>[]; property_bindings?: Record<string, string>[];
  variables: { Name?: string; DataType?: string; OriginType?: string; default_value?: Record<string, string> }[] }
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
    if (cross && contract.coverage) {
      const types: Record<string, string> = { string: "dtString", real: "dtFloat", integer: "dtInteger" }
      const functions: Record<string, string> = { sum: "ctatSum", count: "ctatCount", unique_count: "ctatUniqueCount", null_count: "ctatNullCount", max: "ctatMax" }
      const expected = [
        ...contract.keys.map((name, order) => ({ name, type: "string", role: "utActive", order, functions: [] as string[] })),
        ...contract.dimensions.map((name, order) => ({ name, type: "string", role: "utGroup", order, functions: [] as string[] })),
        ...contract.facts.map((fact, order) => ({ ...fact, role: "utValue", order })),
      ]
      if (cross.columns.length !== expected.length || expected.some(field => {
        const columns = cross.columns.filter(c => c.Name === field.name), c = columns[0]
        return columns.length !== 1 || !c || c.InputColumnInfoName !== field.name || c.DataType !== types[field.type] ||
          c.DataKind !== (field.type === "string" ? "dkDiscrete" : "dkContinuous") || c.UsageType !== field.role ||
          Number(c.extension.Order ?? 0) !== field.order ||
          field.role === "utValue" && JSON.stringify((c.extension.AggregationTypes ?? "").split(/\s+/).filter(Boolean).sort()) !== JSON.stringify(field.functions.map(f => functions[f]).sort()) ||
          c.extension.NullGroup === "true" || c.extension.OtherGroup === "true" || Number(c.extension.SlidingUniqueValuesMinCount ?? 0) !== 0
      })) failures.push("crosstable: exact typed ordered coverage roles/functions required")
      if ((cross.engine.SlidingUniqueValues === "true" ? "sliding" : "fixed") !== contract.mode)
        failures.push("crosstable: category mode differs")
      if (id !== "crosstable-local-variable-bindings" && cross.variables.length)
        failures.push("crosstable: unexpected variable")
      if (id === "crosstable-local-variable-bindings" && (
        cross.control_ports?.length !== 1 || cross.control_sockets?.length !== 1 ||
        !cross.control_ports[0]?.Guid || cross.control_ports[0].Guid !== cross.control_sockets[0]?.Guid ||
        cross.variables.length !== 3 || cross.property_bindings?.length !== 3 || cross.output_columns?.length !== 0 ||
        !crossTableBindings.every(field => {
          const variables = cross.variables.filter(v => v.Name === field.name), v = variables[0]
          const bindings = cross.property_bindings?.filter(b => b.Name === `${field.property}.Engine.Root.` && b.PropertyPath === b.Name && b.VariableName === field.name)
          return variables.length === 1 && v?.OriginType === "iotCustom" && v.DataType === field.xmlType &&
            v.default_value?.["{http://www.w3.org/2001/XMLSchema-instance}type"] === field.container && v.default_value.Value === String(field.value) &&
            bindings?.length === 1 && cross.engine[field.property] === String(field.value)
        }))) failures.push("crosstable: own persisted local definitions and three property bindings with automatic output required")
    }
    if (cross && !contract.coverage) {
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
