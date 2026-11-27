import type { Endpoint, Graph, Node, Port } from "./contract"

export const cardWidth = 152

export const cardHeight = 108

const padding = 28

const pitch = cardWidth + 68

const hiddenDataPorts = ["78ce58f4-e818-3754-bc2e-6af868677420", "455b65c3-0587-3a9c-b47e-9b0d285bff3c"]

function layout(nodes: readonly Node[]) {
  const positioned = nodes.flatMap((node) => (node.position ? [node.position] : []))
  const minX = positioned.length ? Math.min(...positioned.map((point) => point.x)) : 0
  const minY = positioned.length ? Math.min(...positioned.map((point) => point.y)) : 0
  const maxX = positioned.length ? Math.max(...positioned.map((point) => point.x)) - minX : -pitch
  let fallbackX = maxX + pitch

  return nodes.map((node) => {
    if (node.position) return { x: node.position.x - minX + padding, y: node.position.y - minY + padding }
    const point = { x: fallbackX + padding, y: padding }
    fallbackX += pitch

    return point
  })
}

function boundary(parent: Node, role: "input" | "output"): Node {
  const direction = role === "input" ? "output" : "input"

  return {
    guid: parent.guid,
    type: "",
    label: "",
    position: null,
    boundary_role: role,
    ports: parent.ports.filter((port) => port.direction === role).map((port) => ({ ...port, direction })),
  }
}

export function buildDiagram(graph: Graph, parent?: Node) {
  const positions = layout(graph.nodes)
  const right = Math.max(padding, ...positions.map((point) => point.x))
  const addInput = parent && !graph.nodes.some((node) => node.boundary_role === "input")
  const addOutput = parent && !graph.nodes.some((node) => node.boundary_role === "output")

  const nodes = [
    ...graph.nodes.map((node, index) => ({
      node,
      index,
      x: positions[index].x + (addInput ? pitch : 0),
      y: positions[index].y,
      virtual: false,
    })),
    ...(addInput ? [{ node: boundary(parent, "input"), x: padding, y: padding, virtual: true }] : []),
    ...(addOutput
      ? [{ node: boundary(parent, "output"), x: right + (addInput ? 2 : 1) * pitch, y: padding, virtual: true }]
      : []),
  ].map((entry) => {
    const visible = entry.node.ports.filter(
      (port) => ["workflow", "data", "tree"].includes(port.kind) && !hiddenDataPorts.includes(port.guid ?? ""),
    )

    const ports = (direction: Port["direction"]) => {
      const matching = visible.filter((port) => port.direction === direction)

      return matching.map((port, index) => ({
        port,
        x: entry.x + (direction === "output" ? cardWidth : 0),
        y: entry.y + (cardHeight * (index + 1)) / (matching.length + 1),
      }))
    }

    return { ...entry, inputs: ports("input"), outputs: ports("output") }
  })

  const byGuid = new Map(
    nodes.flatMap((entry) => (entry.node.guid && !entry.virtual ? [[entry.node.guid, entry]] : [])),
  )

  const edge = (endpoint: Endpoint, direction: "input" | "output") => {
    const entry =
      (endpoint.node_guid && byGuid.get(endpoint.node_guid)) ||
      ((!endpoint.node_guid || endpoint.node_guid === parent?.guid) &&
        nodes.find((entry) => entry.virtual && entry.node.boundary_role !== direction))

    if (!entry) return
    const ports = direction === "input" ? entry.inputs : entry.outputs

    const port = endpoint.port_guid
      ? ports.find((item) => item.port.guid === endpoint.port_guid)
      : ports.find((item) => item.port.index === endpoint.index && item.port.kind === endpoint.kind)

    if (port) return { entry, port }
  }

  const links = graph.links.flatMap((link) => {
    const source = edge(link.source, "output")
    const target = edge(link.target, "input")

    return source && target ? [{ source, target }] : []
  })

  return {
    width: Math.max(0, ...nodes.map((entry) => entry.x + cardWidth)) + padding,
    height: Math.max(cardHeight + padding, ...nodes.map((entry) => entry.y + cardHeight)) + padding,
    nodes,
    links,
  }
}

export type Diagram = ReturnType<typeof buildDiagram>

const components = [
  ["TBGFilterDataEngine", "filter"],
  ["transform.filter_data", "filter"],
  ["TBGGroupDataEngine", "group"],
  ["transform.group_data", "group"],
  ["TBGImportTextFile", "textImport"],
  ["imports.text", "textImport"],
  ["TBGJoinEngine", "join"],
  ["TBGJoinDataEngine", "join"],
  ["transform.join", "join"],
  ["TBGExportExcel", "excelExport"],
  ["TBGExportExcelFile", "excelExport"],
  ["exports.excel", "excelExport"],
  ["TBGModelGenericComponentEngine", "submodel"],
  ["control.supernode", "submodel"],
] as const

export function componentKey(node: Node) {
  if (node.boundary_role === "input") return "submodelInput"

  if (node.boundary_role === "output") return "submodelOutput"

  return components.find(([type]) => type === node.type)?.[1]
}

export function nativePortKey(node: Node, port: Port) {
  const output = port.direction === "output"

  switch (componentKey(node)) {
    case "filter":
      return output ? (port.index === 0 ? "filterMatch" : "filterMiss") : "filterInput"
    case "textImport":
      return output ? "dataset" : undefined
    case "excelExport":
      return output ? undefined : "dataSource"
    case "join":
      return output ? "dataset" : port.index === 0 ? "leftTable" : "rightTable"
    case "group":
      return output ? "dataset" : "filterInput"
  }
}
