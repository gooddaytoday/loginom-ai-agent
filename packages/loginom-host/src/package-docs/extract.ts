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

export type PackageStructure = Awaited<ReturnType<typeof extractPackage>>

export async function extractPackage(path: string) {
  return withPackageXml(await readFile(path), async (xml, entries) => {
    const info = await xml("PackageInfo.xml")
    if (!info) throw Error("PACKAGE_DOCS_PACKAGE_INFO_MISSING")
    const references = await xml("References.xml")
    const external = [references, ...Array.from(references?.getElementsByTagName("*") ?? [])]
      .filter((element): element is Element => !!element && element.localName === "Item")
      .map((element) => element.getAttribute("Name") || element.getAttribute("DisplayName") || element.getAttribute("Path") || "")
      .filter(Boolean)
    const units = unitPaths(await xml("PackageIndex.xml"), entries)
    const modules = await Promise.all(units.map(async (base, number) => {
      const metadata = await xml(base + "/Info.xml")
      const unit = await xml(base + "/Unit.xml")
      if (!unit) throw Error("PACKAGE_DOCS_UNIT_MISSING")
      const body = workflow(child(unit, "WorkFlow"), base)
      const stats = statistics(body)
      const views = items(child(child(unit, "ModelViews"), "Nodes")).map((node) => {
        const entry = nodeEntry(node, base, 0)
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
      package: { file_name: basename(path), name: info.getAttribute("Name") ?? basename(path, extname(path)),
        application_version: info.getAttribute("ApplicationVersion") ?? "", guid: info.getAttribute("Guid") ?? "", external_references: external },
      stats: { modules: modules.length, notes: total("notes"), nodes: total("nodes"), submodels: total("submodels"),
        programming_nodes: total("programming_nodes"), reference_nodes: total("reference_nodes"), derived_nodes: total("derived_nodes") },
      modules, unique_engine_types: [...new Set(modules.flatMap((module) => workflowBodies(module).flatMap((body) => body.workflow_nodes.map((node) => node.engine_type))).filter(Boolean))].toSorted(),
    }
  })
}

type ReadXml = (name: string) => Promise<Element | undefined>

class BoundedXmlWriter extends Uint8ArrayWriter {
  constructor(private remaining: number) { super() }

  override writeUint8Array(chunk: Uint8Array) {
    if (chunk.byteLength > this.remaining) throw Error("PACKAGE_VARIABLES_XML_LIMIT")
    this.remaining -= chunk.byteLength
    return super.writeUint8Array(chunk)
  }
}

async function withPackageXml<Result>(
  bytes: Uint8Array,
  read: (xml: ReadXml, entries: readonly string[]) => Promise<Result>,
  remaining?: number,
) {
  // zip.js slices must own their buffers; Buffer.slice retains the original byte offset.
  const zip = new ZipReader(new Uint8ArrayReader(new Uint8Array(bytes)), { useWebWorkers: false })
  try {
    const entries = await zip.getEntries()
    const members = new Map(entries.map((entry) => [normalized(entry.filename), entry]))
    async function xml(name: string) {
      const entry = members.get(normalized(name))
      if (!entry?.getData || entry.directory) return undefined
      const budget = remaining
      if (budget !== undefined && entry.uncompressedSize > budget) throw Error("PACKAGE_VARIABLES_XML_LIMIT")
      const writer = budget === undefined ? new Uint8ArrayWriter() : new BoundedXmlWriter(budget)
      const decoded = await entry.getData(writer, { checkSignature: budget !== undefined })
      if (budget !== undefined) remaining = budget - decoded.byteLength
      const fail = () => { throw Error("PACKAGE_DOCS_XML_INVALID") }
      return new DOMParser({ errorHandler: { warning: fail, error: fail, fatalError: fail } })
        .parseFromString(new TextDecoder("utf-8", { fatal: true }).decode(decoded), "application/xml").documentElement
    }
    return await read(xml, entries.map((entry) => entry.filename))
  } finally { await zip.close() }
}

function unitPaths(index: Element | undefined, entries: readonly string[]) {
  const indexed = items(child(index, "Units")).map((unit) => (unit.getAttribute("BasePath") ?? "").replaceAll("\\", "/").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
  return indexed.length ? indexed : [...new Set(entries.flatMap((name) => {
    const match = /^(Unit_\d+)\/Unit\.xml$/i.exec(name.replaceAll("\\", "/"))
    return match ? [match[1]] : []
  }))].toSorted()
}

export async function extractPackageVariables(bytes: Uint8Array) {
  return withPackageXml(bytes, async (xml, entries) => {
    if ((await xml("PackageInfo.xml"))?.localName !== "PackageInfo") throw Error("PACKAGE_DOCS_PACKAGE_INFO_MISSING")
    const registry = await xml("Variables.xml")
    const elements = registry?.localName === "Variables" ? child(registry, "Elements") : undefined
    const definitions: { name: string; type: string }[] = []
    const defaults: { name: string; value: string }[] = []
    const nonPublic = new Set<string>()
    let defaultsWithheld = false
    let definitionsCoverage: "complete" | "partial" | "unavailable" = elements ? "complete" : "unavailable"
    for (const entry of children(elements)) {
      const name = entry.getAttribute("Name"), type = entry.getAttribute("DataType")
      const visible = explicitlyVisible(entry)
      if (name && !visible) nonPublic.add(name)
      if (entry.localName !== "Item" || !name || !type) {
        definitionsCoverage = "partial"
        continue
      }
      definitions.push({ name, type })
      const value = child(entry, "DefaultValue")
      if (value?.hasAttribute("Value")) {
        if (visible) defaults.push({ name, value: value.getAttribute("Value") ?? "" })
        else defaultsWithheld = true
      }
    }
    const packageNames = new Set(definitions.map(({ name }) => name))

    const modules = unitPaths(await xml("PackageIndex.xml"), entries)
    const usages: { name: string; kind: "template" | "binding"; scope: "package" | "control" | "unknown"; module: string; branch: string[];
      nodeID: string; nodeLabel: string; parameter: string }[] = []
    for (const module of modules) {
      const unit = await xml(module + "/Unit.xml")
      if (!unit) throw Error("PACKAGE_DOCS_UNIT_MISSING")
      const pending = [{ root: child(unit, "WorkFlow"), branch: new Array<string>() }]
      while (pending.length) {
        const flow = pending.pop()
        if (!flow) break
        const packageTargets = packageVariableTargets(flow.root)
        for (const node of items(child(flow.root, "Nodes"))) {
          const component = child(node, "Component")
          const engine = child(component, "Engine")
          const { guid: nodeID, label: nodeLabel } = nodeIdentity(node, engine)
          if (!nodeID) continue
          const controlPort = namedPort(child(component, "InputSockets"), "ControlVariables")
          const controlPortID = controlPort?.getAttribute("Guid")
          const linkedToPackage = controlPortID && packageTargets.get(nodeID)?.has(controlPortID)
          const localNames = new Set(items(child(child(child(controlPort, "Socket"), "Variables"), "Elements"))
            .filter((entry) => entry.getAttribute("OriginType") === "iotCustom")
            .map((entry) => entry.getAttribute("Name")))
          const scope = (name: string) => localNames.has(name) ? "control"
            : packageNames.has(name) && linkedToPackage
              ? "package" : controlPort ? "control" : "unknown"
          const location = { module, branch: flow.branch, nodeID, nodeLabel }
          for (const parameter of ["FileName", "TableName"]) {
            const setting = engine?.getAttribute(parameter) ?? ""
            const names = new Set(Array.from(setting.matchAll(/%([\p{L}_][\p{L}\p{N}_]*)%/gu), (match) => match[1]))
            for (const name of names) usages.push({ ...location, name, parameter, kind: "template", scope: scope(name) })
          }
          for (const binding of items(child(child(component, "PropBinder"), "PropertyBindSavers"))) {
            const name = binding.getAttribute("VariableName"), parameter = binding.getAttribute("PropertyPath")
            if (name && parameter) usages.push({ ...location, name, parameter, kind: "binding", scope: scope(name) })
          }
          const inner = child(child(engine, "ModelUnit"), "WorkFlow")
          if (inner) pending.push({ root: inner, branch: [...flow.branch, nodeLabel] })
        }
      }
    }
    return { source: "saved" as const, definitionsCoverage, usagesCoverage: "partial" as const,
      definitions: elements ? definitions : null,
      defaultsCoverage: defaultsWithheld ? "partial" as const : definitionsCoverage,
      defaults: elements ? defaults.filter(({ name }) => !nonPublic.has(name)) : null, usages }
  }, 16 * 1024 * 1024)
}

function explicitlyVisible(entry: Element) {
  const flags = ["Hidden", "IsHidden"].filter((name) => entry.hasAttribute(name)).map((name) => entry.getAttribute(name))
  return flags.length > 0 && flags.every((flag) => flag === "false" || flag === "0")
}

function namedPort(ports: Element | undefined, name: string) {
  return items(ports).find((port) => port.getAttribute("Name") === name)
}

function packageVariableTargets(flow: Element | undefined) {
  const targets = new Map<string, Set<string>>()
  const variables = items(child(flow, "ServiceNodes")).find((node) => node.getAttribute("Name") === "VariablesNode")
  const nodeID = variables?.getAttribute("Guid")
  const portID = namedPort(child(child(variables, "Component"), "OutputSockets"), "PackageVariables")?.getAttribute("Guid")
  if (!nodeID || !portID) return targets
  for (const link of [...items(child(flow, "ServiceLinks")), ...items(child(flow, "Links"))]) {
    const source = child(link, "SourcePort"), target = child(link, "TargetPort")
    if (source?.getAttribute("NodeGuid") !== nodeID || source.getAttribute("PortGuid") !== portID) continue
    const targetNode = target?.getAttribute("NodeGuid"), targetPort = target?.getAttribute("PortGuid")
    if (!targetNode || !targetPort) continue
    const ports = targets.get(targetNode) ?? new Set<string>()
    ports.add(targetPort)
    targets.set(targetNode, ports)
  }
  return targets
}

function normalized(name: string) { return name.replaceAll("\\", "/").replace(/^\/+/, "").toLowerCase() }

function children(parent?: Element) {
  return Array.from(parent?.childNodes ?? []).filter((node): node is Element => node.nodeType === 1)
}
function child(parent: Element | undefined, name: string) { return children(parent).find((node) => node.localName === name) }
function items(parent?: Element) { return children(parent).filter((node) => node.localName === "Item") }

function nodeIdentity(node: Element, engine?: Element) {
  const engine_type = engine?.getAttributeNS("http://www.w3.org/2001/XMLSchema-instance", "type") || engine?.getAttribute("type") || ""
  const guid = node.getAttribute("Guid") ?? ""
  const name = node.getAttribute("Name") ?? ""
  const display_name = node.getAttribute("DisplayName") ?? ""
  const label = display_name || name || engine_type || guid.slice(0, 8)
  return { guid, name, display_name, label, engine_type }
}

function nodeEntry(node: Element, path: string, depth: number) {
  const component = child(node, "Component")
  const engine = child(component, "Engine") ?? component
  const { guid, name, display_name, label, engine_type } = nodeIdentity(node, engine)
  const service_name = engine_type === "TBGModelGenericComponentEngine" ? "Подмодель" : engine_type.replace(/^TBG/, "") || name || "Узел"
  const ports = (section: string) => items(child(node, section)).map((port) => {
    const guid = port.getAttribute("Guid") ?? ""
    const name = port.getAttribute("Name") || portNames[guid.toLowerCase()] || ""
    return { guid, name, display_name: port.getAttribute("DisplayName") || name }
  })
  const expressions = engine_type === "TBGCalcData" ? items(child(engine, "Expressions")).map((expression) => ({
    Name: expression.getAttribute("Name") ?? "", DataType: expression.getAttribute("DataType") ?? "", Expression: expression.getAttribute("Expression") ?? "",
  })) : []
  return { guid, name, display_name, label, service_name, engine_type, vendor_guid: node.getAttribute("VendorGuid") ?? "",
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
  const noteFields = ["Text", "Caption", "Comment", "Description"]
  const notes = children(child(root, "Annotations")).flatMap((item) => {
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

function leadingText(element: Element) {
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
