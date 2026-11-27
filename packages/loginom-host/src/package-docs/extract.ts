import { readFile } from "node:fs/promises"
import { basename, extname } from "node:path"
import {
  child, children, items, readSavedNode, readSavedWorkflow, withSavedPackage,
  type SavedNode, type SavedWorkflow, type XmlElement,
} from "../../../loginom-runtime/client/lib/saved-package-reader.mjs"

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

export type PackageStructure = Awaited<ReturnType<typeof extractPackage>>

export async function extractPackage(path: string) {
  return extractPackageBytes(path, await readFile(path))
}

export async function extractPackageBytes(fileName: string, bytes: Uint8Array, xmlBudget?: number) {
  return withSavedPackage(bytes, xmlBudget, async ({ xml, units }) => {
    const info = await xml("PackageInfo.xml")
    if (!info) throw Error("PACKAGE_DOCS_PACKAGE_INFO_MISSING")
    const references = await xml("References.xml")
    const external = [references, ...Array.from(references?.getElementsByTagName("*") ?? [])]
      .filter((element): element is XmlElement => !!element && element.localName === "Item")
      .map((element) => element.getAttribute("Name") || element.getAttribute("DisplayName") || element.getAttribute("Path") || "")
      .filter(Boolean)
    const modules = await Promise.all((await units()).map(async (base, number) => {
      const metadata = await xml(base + "/Info.xml")
      const unit = await xml(base + "/Unit.xml")
      if (!unit) throw Error("PACKAGE_DOCS_UNIT_MISSING")
      const body = workflow(readSavedWorkflow(child(unit, "WorkFlow"), xmlBudget === undefined ? undefined : 32), base)
      const stats = statistics(body)
      const views = items(child(child(unit, "ModelViews"), "Nodes")).map((node) => {
        const entry = nodeEntry(readSavedNode(node), base, 0)
        return { guid: entry.guid, label: entry.label, engine_type: entry.engine_type, service_name: entry.service_name }
      })
      return { id: base.split("/").at(-1)!, index: number + 1,
        name: metadata?.getAttribute("Name") ?? `Unit${number + 1}`,
        display_name: metadata?.getAttribute("DisplayName") ?? `Модуль${number + 1}`,
        guid: metadata?.getAttribute("Guid") ?? "", stats, view_nodes: views, ...body }
    }))
    const total = (key: keyof ReturnType<typeof statistics>) => modules.reduce((sum, module) => sum + module.stats[key], 0)
    return {
      schema_version: "package_docs.structure.v1",
      package: { file_name: basename(fileName), name: info.getAttribute("Name") ?? basename(fileName, extname(fileName)),
        application_version: info.getAttribute("ApplicationVersion") ?? "", guid: info.getAttribute("Guid") ?? "", external_references: external },
      stats: { modules: modules.length, notes: total("notes"), nodes: total("nodes"), submodels: total("submodels"),
        programming_nodes: total("programming_nodes"), reference_nodes: total("reference_nodes"), derived_nodes: total("derived_nodes") },
      modules, unique_engine_types: [...new Set(modules.flatMap((module) => workflowBodies(module).flatMap((body) => body.workflow_nodes.map((node) => node.engine_type))).filter(Boolean))].toSorted(),
    }
  })
}

function nodeEntry(identity: SavedNode, path: string, depth: number) {
  const node = identity.element
  const component = child(node, "Component")
  const engine = child(component, "Engine") ?? component
  const engine_type = engine?.getAttributeNS("http://www.w3.org/2001/XMLSchema-instance", "type") || engine?.getAttribute("type") || ""
  const { guid, name, display_name } = identity
  const label = identity.label || engine_type || guid.slice(0, 8)
  const service_name = engine_type === "TBGModelGenericComponentEngine" ? "Подмодель" : engine_type.replace(/^TBG/, "") || name || "Узел"
  const ports = (section: string) => items(child(node, section)).map((port) => {
    const guid = port.getAttribute("Guid") ?? ""
    const name = port.getAttribute("Name") || portNames[guid.toLowerCase()] || ""
    return { guid, name, display_name: port.getAttribute("DisplayName") || name }
  })
  const expressions = engine_type === "TBGCalcData" ? items(child(engine, "Expressions")).map((expression) => ({
    Name: expression.getAttribute("Name") ?? "", DataType: expression.getAttribute("DataType") ?? "", Expression: expression.getAttribute("Expression") ?? "",
  })) : []
  const point = child(node, "Position")
  const left = point?.getAttribute("Left"), top = point?.getAttribute("Top")
  const position = left?.trim() && top?.trim() && Number.isFinite(Number(left)) && Number.isFinite(Number(top))
    ? { x: Number(left), y: Number(top) }
    : undefined
  const filter = engine_type === "TBGFilterDataEngine" && child(engine, "Filter")
  const filter_conditions = filter ? items(filter).map((item) => ({
    field: item.getAttribute("Name") ?? "",
    relation: item.getAttribute("RelationType") ?? "",
    join: item.getAttribute("ConcatenationType") || null,
    value: child(item, "CompareValue")?.textContent ?? (item.hasAttribute("CompareValue") ? item.getAttribute("CompareValue") : null),
  })) : undefined
  const grouping = engine_type === "TBGGroupDataEngine" ? items(child(component, "InputSockets")).flatMap((input) =>
    items(child(child(child(input, "Socket"), "DataSource"), "ColumnDefs")).flatMap((column) => {
      const usage = column.getAttribute("UsageType")
      const field = column.getAttribute("InputColumnInfoName") || column.getAttribute("Name")
      if (!field || (usage !== "utGroup" && usage !== "utValue")) return []
      const extension = items(child(column, "Extensions")).map((item) => child(item, "Extension"))
        .find((value) => value?.getAttributeNS("http://www.w3.org/2001/XMLSchema-instance", "type") === "TBGGroupDataColumnDefExtension")
      return [{ field, role: usage === "utGroup" ? "group" as const : "measure" as const,
        functions: extension?.getAttribute("GroupFunctions") || null }]
    }),
  ) : undefined
  return { guid, name, display_name, label, service_name, engine_type,
    ...(position ? { position } : {}),
    ...(filter_conditions ? { filter_conditions } : {}),
    ...(grouping ? { grouping_fields: grouping } : {}),
    vendor_guid: node.getAttribute("VendorGuid") ?? "",
    input_ports: ports("InputPorts"), output_ports: ports("OutputPorts"), service_input_ports: ports("ServiceInputPorts"), service_output_ports: ports("ServiceOutputPorts"),
    settings_main: Object.fromEntries([
      ...Array.from(engine?.attributes ?? []).filter((attribute) =>
        !["type", "Guid"].includes(attribute.localName) && attribute.namespaceURI !== "http://www.w3.org/2000/xmlns/" && attribute.value && attribute.value.length < 500)
        .map((attribute) => [attribute.localName, attribute.value]),
      ...(expressions.length ? [["Expressions", JSON.stringify(expressions)]] : []),
    ]),
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

function workflow(graph: SavedWorkflow, path: string, depth = 0): Workflow {
  const workflow_nodes = graph.nodes.map((node) => nodeEntry(node, path, depth))
  const nodes = new Map(workflow_nodes.map((node) => [node.guid, node]))
  const portName = (node: ReturnType<typeof nodeEntry> | undefined, guid: string) =>
    node && [...node.input_ports, ...node.output_ports, ...node.service_input_ports, ...node.service_output_ports].find((port) => port.guid.toLowerCase() === guid.toLowerCase())?.display_name || portNames[guid.toLowerCase()] || ""
  const links = graph.links.map(({ source_node_guid, source_port_guid, target_node_guid, target_port_guid }) => {
    const from = nodes.get(source_node_guid), to = nodes.get(target_node_guid)
    const source_port_name = portName(from, source_port_guid), target_port_name = portName(to, target_port_guid)
    return { source_node_guid, source_port_guid, target_node_guid, target_port_guid, source_label: from?.label ?? "", target_label: to?.label ?? "",
      source_port_name, target_port_name, readable: `${from?.label ?? source_node_guid}.${source_port_name || "?"} → ${to?.label ?? target_node_guid}.${target_port_name || "?"}` }
  })
  const hierarchy = links.map((link) => ({ Source: nodes.get(link.source_node_guid)?.hierarchy_token ?? null, Target: nodes.get(link.target_node_guid)?.hierarchy_token ?? null }))
  const sources = new Set(hierarchy.map((link) => link.Source).filter(Boolean)), targets = new Set(hierarchy.map((link) => link.Target).filter(Boolean))
  for (const node of workflow_nodes) {
    if (!targets.has(node.hierarchy_token)) hierarchy.push({ Source: null, Target: node.hierarchy_token })
    if (!sources.has(node.hierarchy_token)) hierarchy.push({ Source: node.hierarchy_token, Target: null })
  }
  const submodels = graph.nodes.flatMap((node, index) => {
    const entry = workflow_nodes[index]
    if (entry.engine_type !== "TBGModelGenericComponentEngine") return []
    const nested = path + "/" + entry.label
    return [{ label: entry.label, guid: entry.guid, depth: depth + 1, path: nested, ...workflow(node.submodel ?? readSavedWorkflow(), nested, depth + 1) }]
  })
  const noteFields = ["Text", "Caption", "Comment", "Description"]
  const notes = children(child(graph.root, "Annotations")).flatMap((item) => {
    const texts = [item, ...Array.from(item.getElementsByTagName("*"))].flatMap((element) => [
      ...(noteFields.includes(element.localName) && leadingText(element) ? [leadingText(element)] : []),
      ...noteFields.map((name) => element.getAttribute(name)?.trim() ?? "").filter(Boolean),
    ])
    if (leadingText(item)) texts.push(leadingText(item))
    const text = [...new Set(texts)].join(" ").trim()
    return text ? [text] : []
  })
  return { workflow_nodes, links, hierarchy, notes, submodels }
}

function leadingText(element: XmlElement) {
  // ElementTree .text excludes descendants and text following a child element.
  const nodes = Array.from(element.childNodes)
  const first = nodes.findIndex((node) => node.nodeType === 1)
  return nodes.slice(0, first < 0 ? undefined : first).filter((node) => [3, 4].includes(node.nodeType))
    .map((node) => node.nodeValue ?? "").join("").trim()
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
