import { Schema } from "effect"
import { normalizePackageGuid } from "../../loginom-runtime/client/lib/saved-package-reader.mjs"
import type { PackageStructure } from "./package-docs/extract"

const position = Schema.Struct({ x: Schema.Finite, y: Schema.Finite })
const port = Schema.Struct({
  direction: Schema.Literals(["input", "output"]),
  kind: Schema.String,
  index: Schema.Number,
  name: Schema.String,
  guid: Schema.NullOr(Schema.String),
})
const endpoint = Schema.Struct({
  node_guid: Schema.NullOr(Schema.String),
  port_guid: Schema.NullOr(Schema.String),
  kind: Schema.optionalKey(Schema.String),
  index: Schema.optionalKey(Schema.Number),
})
const link = Schema.Struct({ source: endpoint, target: endpoint })
const node = Schema.Struct({
  guid: Schema.NullOr(Schema.String),
  label: Schema.String,
  type: Schema.String,
  position: Schema.NullOr(position),
  ports: Schema.Array(port),
  boundary_role: Schema.optionalKey(Schema.Literals(["input", "output"])),
})
const WindowLink = Schema.Struct({
  source: Schema.NonEmptyString,
  output: Schema.NonEmptyString,
  target: Schema.NonEmptyString,
  input: Schema.NonEmptyString,
  row_count_receipt: Schema.optionalKey(Schema.Unknown),
})
const RowCountReceipt = Schema.Struct({
  execution_id: Schema.NonEmptyString,
  port_guid: Schema.NonEmptyString,
  row_count: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})
const WindowGraph = Schema.Struct({
  name: Schema.NullOr(Schema.String),
  document: Schema.NonEmptyString,
  workflow: Schema.NonEmptyString,
  navigation_path: Schema.Array(Schema.String),
  nodes: Schema.Array(node),
  links: Schema.Array(WindowLink),
})

export const PackageSchemaSession = Schema.Struct({ sessionID: Schema.NonEmptyString })
export const maxPackageBytes = 16 * 1024 * 1024
const maxSchemaBytes = 512 * 1024

function guid(value: string | null) {
  return value ? normalizePackageGuid(value) : null
}

function normalizedLink(value: typeof link.Type) {
  return {
    source: { ...value.source, node_guid: guid(value.source.node_guid), port_guid: guid(value.source.port_guid) },
    target: { ...value.target, node_guid: guid(value.target.node_guid), port_guid: guid(value.target.port_guid) },
  }
}

type Workflow = Pick<PackageStructure["modules"][number], "workflow_nodes" | "links" | "submodels">
type SavedNode = typeof node.Type &
  Pick<Workflow["workflow_nodes"][number], "filter_conditions" | "grouping_fields" | "text_import">
type SavedWorkflow = {
  key: string[]
  label: string
  nodes: SavedNode[]
  links: (typeof link.Type)[]
  submodels: SavedWorkflow[]
}

function savedWorkflow(workflow: Workflow, key: string[], label: string): SavedWorkflow {
  return {
    key,
    label,
    nodes: workflow.workflow_nodes.map((entry) => {
      const ports = (entries: typeof entry.input_ports, direction: "input" | "output", kind: "workflow" | "service") =>
        entries.map((port, index) => ({ direction, kind, index, name: port.display_name, guid: guid(port.guid) }))
      return {
        guid: guid(entry.guid),
        label: entry.label,
        type: entry.engine_type,
        position: entry.position ?? null,
        ports: [
          ...ports(entry.input_ports, "input", "workflow"),
          ...ports(entry.output_ports, "output", "workflow"),
          ...ports(entry.service_input_ports, "input", "service"),
          ...ports(entry.service_output_ports, "output", "service"),
        ],
        ...(entry.filter_conditions ? { filter_conditions: entry.filter_conditions } : {}),
        ...(entry.grouping_fields ? { grouping_fields: entry.grouping_fields } : {}),
        ...(entry.text_import ? { text_import: entry.text_import } : {}),
      }
    }),
    links: workflow.links.map((link) =>
      normalizedLink({
        source: { node_guid: link.source_node_guid, port_guid: link.source_port_guid },
        target: { node_guid: link.target_node_guid, port_guid: link.target_port_guid },
      }),
    ),
    submodels: workflow.submodels.map((model, index) =>
      savedWorkflow(model, [...key, guid(model.guid) ?? String(index)], model.label),
    ),
  }
}

export async function savedPackageSchema(name: string, bytes: Uint8Array) {
  if (bytes.byteLength > maxPackageBytes) throw Error("PACKAGE_SCHEMA_TOO_LARGE")
  const { extractPackageBytes } = await import("./package-docs/extract")
  const structure = await extractPackageBytes(name, bytes, { xmlBudget: maxPackageBytes, includeTextImport: true })
  const snapshot = {
    source: "saved" as const,
    observed_at: new Date().toISOString(),
    scope: "package" as const,
    complete: true as const,
    package: { name: structure.package.name, guid: guid(structure.package.guid) },
    workflows: structure.modules.map((module) =>
      savedWorkflow(module, [guid(module.guid) ?? module.id], module.display_name || module.name),
    ),
  }
  if (Buffer.byteLength(JSON.stringify(snapshot)) > maxSchemaBytes) throw Error("PACKAGE_SCHEMA_TOO_LARGE")
  return snapshot
}

export function windowPackageSchema(value: unknown) {
  if (!Schema.is(WindowGraph)(value) || Buffer.byteLength(JSON.stringify(value)) > maxSchemaBytes) return null
  const graph = Schema.decodeUnknownSync(WindowGraph)(value)
  const nodes = new Map(graph.nodes.map((node) => [node.guid, node]))
  const endpoint = (nodeID: string, portID: string, direction: "input" | "output") => {
    const port = nodes.get(nodeID)?.ports.find((port) => port.direction === direction && port.guid === portID)
    return { node_guid: nodeID, port_guid: portID, ...(port && { kind: port.kind, index: port.index }) }
  }
  return {
    source: "window" as const,
    observed_at: new Date().toISOString(),
    scope: "active_workflow" as const,
    complete: false as const,
    limitations: ["active_workflow_only", "no_submodels", "no_node_settings"] as const,
    package: { name: graph.name },
    workflow: {
      document_id: graph.document,
      workflow_id: graph.workflow,
      navigation_path: graph.navigation_path,
      nodes: graph.nodes.map((node) => ({
        ...node,
        guid: guid(node.guid),
        ports: node.ports.map((port) => ({ ...port, guid: guid(port.guid) })),
      })),
      links: graph.links.map((link) => {
        const edge = normalizedLink({
          source: endpoint(link.source, link.output, "output"),
          target: endpoint(link.target, link.input, "input"),
        })
        const receipt = link.row_count_receipt
        if (
          edge.source.kind === "data" &&
          edge.target.kind === "data" &&
          Schema.is(RowCountReceipt)(receipt) &&
          guid(receipt.port_guid) === edge.source.port_guid &&
          receipt.execution_id.startsWith(graph.document + ":")
        )
          return { ...edge, last_execution_row_count: receipt.row_count }
        return edge
      }),
    },
  }
}
