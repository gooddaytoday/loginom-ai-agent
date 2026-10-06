import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader } from "@zip.js/zip.js"
import { DOMParser } from "@xmldom/xmldom"
import { readFile } from "node:fs/promises"
import { basename, extname } from "node:path"

const portNames: Record<string, string> = {
  "58f7e6c3-511e-39d7-8853-036e0a1a7612": "DataSet",
  "9dc72a3f-56bf-3bfc-84ec-f979daf4da6b": "DataSource",
  "4ba0e2c2-69ad-3a32-bbdc-75714efe7a51": "DataSource",
  "00bd0b43-e4b5-3ac1-b95a-ac1bee14f858": "SynchronizationInputPort",
  "ca080ff0-2342-32b0-b480-586f9747bace": "SynchronizationOutputPort",
  "d252e390-f72d-36c4-97fc-60d86186c3c6": "Variables",
  "b671426b-642b-3e7c-b9a9-9653573f3199": "Variables",
  "455b65c3-0587-3a9c-b47e-9b0d285bff3c": "ControlVariables",
  "78ce58f4-e818-3754-bc2e-6af868677420": "Connection",
}

export async function extractPackage(path: string) {
  // zip.js slices must own their buffers; Buffer.slice retains the original byte offset.
  const zip = new ZipReader(new Uint8ArrayReader(new Uint8Array(await readFile(path))), { useWebWorkers: false })
  try {
    const entries = await zip.getEntries()
    const members = new Map(entries.map((entry) => [normalized(entry.filename), entry]))
    async function xml(name: string) {
      const entry = members.get(normalized(name))
      if (!entry?.getData || entry.directory) return undefined
      const bytes = await entry.getData(new Uint8ArrayWriter())
      const fail = () => { throw Error("PACKAGE_DOCS_XML_INVALID") }
      return new DOMParser({ errorHandler: { warning: fail, error: fail, fatalError: fail } })
        .parseFromString(new TextDecoder("utf-8", { fatal: true }).decode(bytes), "application/xml").documentElement
    }
    const info = await xml("PackageInfo.xml")
    if (!info) throw Error("PACKAGE_DOCS_PACKAGE_INFO_MISSING")
    const index = await xml("PackageIndex.xml")
    const indexed = items(child(index, "Units")).map((unit) => (unit.getAttribute("BasePath") ?? "").replaceAll("\\", "/").replace(/^\/+|\/+$/g, ""))
      .filter(Boolean)
    const units = indexed.length ? indexed : [...new Set(entries.flatMap((entry) => {
      const match = /^(Unit_\d+)\/Unit\.xml$/i.exec(entry.filename.replaceAll("\\", "/"))
      return match ? [match[1]] : []
    }))].toSorted()
    const modules = await Promise.all(units.map(async (base, number) => {
      const metadata = await xml(base + "/Info.xml")
      const unit = await xml(base + "/Unit.xml")
      if (!unit) throw Error("PACKAGE_DOCS_UNIT_MISSING")
      const body = workflow(child(unit, "WorkFlow"), base)
      const stats = statistics(body)
      return { id: base.split("/").at(-1)!, index: number + 1,
        name: metadata?.getAttribute("Name") ?? `Unit${number + 1}`,
        display_name: metadata?.getAttribute("DisplayName") ?? `Модуль${number + 1}`,
        guid: metadata?.getAttribute("Guid") ?? "", stats, view_nodes: [], ...body }
    }))
    const total = (key: keyof ReturnType<typeof statistics>) => modules.reduce((sum, module) => sum + module.stats[key], 0)
    return {
      schema_version: "package_docs.structure.v1",
      package: { file_name: basename(path), name: info.getAttribute("Name") ?? basename(path, extname(path)),
        application_version: info.getAttribute("ApplicationVersion") ?? "", guid: info.getAttribute("Guid") ?? "", external_references: [] },
      stats: { modules: modules.length, notes: total("notes"), nodes: total("nodes"), submodels: total("submodels"),
        programming_nodes: total("programming_nodes"), reference_nodes: total("reference_nodes"), derived_nodes: total("derived_nodes") },
      modules, unique_engine_types: [...new Set(modules.flatMap((module) => workflowBodies(module).flatMap((body) => body.workflow_nodes.map((node) => node.engine_type))).filter(Boolean))].toSorted(),
    }
  } finally { await zip.close() }
}

function normalized(name: string) { return name.replaceAll("\\", "/").replace(/^\/+/, "").toLowerCase() }

function children(parent?: Element) {
  return Array.from(parent?.childNodes ?? []).filter((node): node is Element => node.nodeType === 1)
}
function child(parent: Element | undefined, name: string) { return children(parent).find((node) => node.localName === name) }
function items(parent?: Element) { return children(parent).filter((node) => node.localName === "Item") }

function nodeEntry(node: Element, path: string, depth: number) {
  const component = child(node, "Component")
  const engine = child(component, "Engine") ?? component
  const engine_type = engine?.getAttributeNS("http://www.w3.org/2001/XMLSchema-instance", "type") || engine?.getAttribute("type") || ""
  const guid = node.getAttribute("Guid") ?? ""
  const name = node.getAttribute("Name") ?? ""
  const display_name = node.getAttribute("DisplayName") ?? ""
  const label = display_name || name || engine_type || guid.slice(0, 8)
  const service_name = engine_type === "TBGModelGenericComponentEngine" ? "Подмодель" : engine_type.replace(/^TBG/, "") || name || "Узел"
  const ports = (section: string) => items(child(node, section)).map((port) => {
    const guid = port.getAttribute("Guid") ?? ""
    const name = port.getAttribute("Name") || portNames[guid.toLowerCase()] || ""
    return { guid, name, display_name: port.getAttribute("DisplayName") || name }
  })
  return { guid, name, display_name, label, service_name, engine_type, vendor_guid: node.getAttribute("VendorGuid") ?? "",
    input_ports: ports("InputPorts"), output_ports: ports("OutputPorts"), service_input_ports: ports("ServiceInputPorts"), service_output_ports: ports("ServiceOutputPorts"),
    settings_main: Object.fromEntries(Array.from(engine?.attributes ?? []).filter((attribute) =>
      !["type", "Guid"].includes(attribute.localName) && attribute.namespaceURI !== "http://www.w3.org/2000/xmlns/" && attribute.value && attribute.value.length < 500)
      .map((attribute) => [attribute.localName, attribute.value])),
    path, depth, hierarchy_token: `${label}:${service_name}:${guid}` }
}

type Workflow = {
  workflow_nodes: ReturnType<typeof nodeEntry>[]
  links: { source_node_guid: string; source_port_guid: string; target_node_guid: string; target_port_guid: string;
    source_label: string; target_label: string; source_port_name: string; target_port_name: string; readable: string }[]
  hierarchy: { Source: string | null; Target: string | null }[]
  notes: string[]
  submodels: (Workflow & { label: string; guid: string; depth: number; path: string })[]
}

function workflow(root: Element | undefined, path: string, depth = 0): Workflow {
  const raw = items(child(root, "Nodes"))
  const workflow_nodes = raw.map((node) => nodeEntry(node, path, depth))
  const nodes = new Map(workflow_nodes.map((node) => [node.guid, node]))
  const portName = (node: ReturnType<typeof nodeEntry> | undefined, guid: string) =>
    node && [...node.input_ports, ...node.output_ports, ...node.service_input_ports, ...node.service_output_ports].find((port) => port.guid.toLowerCase() === guid.toLowerCase())?.display_name || portNames[guid.toLowerCase()] || ""
  const links = [...items(child(root, "Links")), ...items(child(root, "ServiceLinks"))].flatMap((item) => {
    const source = child(item, "SourcePort"), target = child(item, "TargetPort")
    if (!source && !target) return []
    const source_node_guid = source?.getAttribute("NodeGuid") ?? "", target_node_guid = target?.getAttribute("NodeGuid") ?? ""
    const source_port_guid = source?.getAttribute("PortGuid") ?? "", target_port_guid = target?.getAttribute("PortGuid") ?? ""
    const from = nodes.get(source_node_guid), to = nodes.get(target_node_guid)
    const source_port_name = portName(from, source_port_guid), target_port_name = portName(to, target_port_guid)
    return [{ source_node_guid, source_port_guid, target_node_guid, target_port_guid, source_label: from?.label ?? "", target_label: to?.label ?? "",
      source_port_name, target_port_name, readable: `${from?.label ?? source_node_guid}.${source_port_name || "?"} → ${to?.label ?? target_node_guid}.${target_port_name || "?"}` }]
  })
  const hierarchy = links.map((link) => ({ Source: nodes.get(link.source_node_guid)?.hierarchy_token ?? null, Target: nodes.get(link.target_node_guid)?.hierarchy_token ?? null }))
  const sources = new Set(hierarchy.map((link) => link.Source).filter(Boolean)), targets = new Set(hierarchy.map((link) => link.Target).filter(Boolean))
  for (const node of workflow_nodes) {
    if (!targets.has(node.hierarchy_token)) hierarchy.push({ Source: null, Target: node.hierarchy_token })
    if (!sources.has(node.hierarchy_token)) hierarchy.push({ Source: node.hierarchy_token, Target: null })
  }
  const submodels = raw.flatMap((node, index) => {
    const entry = workflow_nodes[index]
    if (entry.engine_type !== "TBGModelGenericComponentEngine") return []
    const inner = child(child(child(child(node, "Component"), "Engine"), "ModelUnit"), "WorkFlow")
    const nested = path + "/" + entry.label
    return [{ label: entry.label, guid: entry.guid, depth: depth + 1, path: nested, ...workflow(inner, nested, depth + 1) }]
  })
  return { workflow_nodes, links, hierarchy, notes: [], submodels }
}

function workflowBodies(body: Workflow): Workflow[] { return [body, ...body.submodels.flatMap(workflowBodies)] }

function statistics(body: Workflow) {
  const bodies = workflowBodies(body)
  const nodes = bodies.flatMap((body) => body.workflow_nodes)
  return { notes: bodies.reduce((sum, body) => sum + body.notes.length, 0), nodes: nodes.length,
    submodels: bodies.reduce((sum, body) => sum + body.submodels.length, 0),
    programming_nodes: nodes.filter((node) => /JavaScript|Python|JS$/.test(node.engine_type)).length,
    reference_nodes: nodes.filter((node) => /Reference|LinkNode/.test(node.engine_type)).length,
    derived_nodes: nodes.filter((node) => node.engine_type.includes("Derived")).length,
    nesting_depth: Math.max(nodes.length ? 1 : 0, ...bodies.flatMap((body) => body.submodels.map((submodel) => submodel.depth + 1))) }
}
