import { Rpc } from "@opencode/schema/rpc"
import { Option, Schema } from "effect"

const port = Schema.Struct({
  guid: Schema.NullOr(Schema.String),
  name: Schema.String,
  direction: Schema.Literals(["input", "output"]),
  index: Schema.Number,
  kind: Schema.String,
})

const node = Schema.Struct({
  guid: Schema.NullOr(Schema.String),
  label: Schema.String,
  type: Schema.String,
  position: Schema.NullOr(Schema.Struct({ x: Schema.Finite, y: Schema.Finite })),
  ports: Schema.Array(port),
  boundary_role: Schema.optionalKey(Schema.Literals(["input", "output"])),
  filter_conditions: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        field: Schema.String,
        relation: Schema.String,
        join: Schema.NullOr(Schema.String),
        value: Schema.NullOr(Schema.String),
      }),
    ),
  ),
  grouping_fields: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        field: Schema.String,
        role: Schema.Literals(["group", "measure"]),
        functions: Schema.NullOr(Schema.String),
      }),
    ),
  ),
  text_import: Schema.optionalKey(
    Schema.Struct({
      file_or_url: Schema.optionalKey(Schema.String),
      column_separator: Schema.optionalKey(Schema.String),
    }),
  ),
})

const endpoint = Schema.Struct({
  node_guid: Schema.NullOr(Schema.String),
  port_guid: Schema.NullOr(Schema.String),
  kind: Schema.optionalKey(Schema.String),
  index: Schema.optionalKey(Schema.Number),
})

const graph = Schema.Struct({
  nodes: Schema.Array(node),
  links: Schema.Array(Schema.Struct({ source: endpoint, target: endpoint })),
})

export type Graph = typeof graph.Type

export type Node = typeof node.Type

export type Port = typeof port.Type

export type Endpoint = typeof endpoint.Type

export type Workflow = Graph & {
  readonly key: readonly string[]
  readonly label: string
  readonly submodels: readonly Workflow[]
}

const saved: Schema.Codec<Workflow> = Schema.Struct({
  ...graph.fields,
  key: Schema.Array(Schema.String),
  label: Schema.String,
  submodels: Schema.Array(Schema.suspend((): Schema.Codec<Workflow> => saved)),
})

const snapshot = Schema.Union([
  Schema.Struct({
    source: Schema.Literal("saved"),
    scope: Schema.Literal("package"),
    complete: Schema.Literal(true),
    observed_at: Schema.String,
    package: Schema.Struct({ name: Schema.String, guid: Schema.NullOr(Schema.String) }),
    workflows: Schema.Array(saved),
  }),
  Schema.Struct({
    source: Schema.Literal("window"),
    scope: Schema.Literal("active_workflow"),
    complete: Schema.Literal(false),
    observed_at: Schema.String,
    limitations: Schema.optionalKey(Schema.Array(Schema.String)),
    package: Schema.Struct({ name: Schema.NullOr(Schema.String) }),
    workflow: Schema.Struct({
      ...graph.fields,
      document_id: Schema.NonEmptyString,
      workflow_id: Schema.NonEmptyString,
      navigation_path: Schema.Array(Schema.String),
    }),
  }),
])

export type Snapshot = typeof snapshot.Type

const StepNode = Schema.Struct({
  document_id: Schema.NonEmptyString,
  workflow_id: Schema.NonEmptyString,
  node_id: Schema.NonEmptyString,
  label: Schema.optionalKey(Schema.NonEmptyString),
})

export type StepNode = typeof StepNode.Type

export const readStepNode = Schema.decodeUnknownOption(StepNode)

export const PackageSchema = Rpc.define({
  id: "loginom.package",
  methods: {
    schema: {
      input: Schema.toStandardSchemaV1(
        Schema.Struct({
          sessionID: Schema.NonEmptyString,
          source: Schema.optionalKey(Schema.Literals(["saved", "window"])),
        }),
      ),
      output: Schema.toStandardSchemaV1(Schema.Struct({ snapshot: Schema.NullOr(snapshot) })),
    },
  },
  events: {},
})

function guid(value: string) {
  const normalized = value.replace(/^\{(.*)\}$/, "$1").toLowerCase()

  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(normalized) ? normalized : undefined
}

export type Finding = { text: string; nodeGuids: readonly string[]; packageGuid: string }

const decodeFinding = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      text: Schema.NonEmptyString,
      node_guids: Schema.Array(Schema.String),
      package_guid: Schema.String,
    }),
  ),
)

export function readFinding(code: string): Finding | undefined {
  const decoded = decodeFinding(code)

  if (Option.isNone(decoded)) return
  const text = decoded.value.text.trim()
  const packageGuid = guid(decoded.value.package_guid)
  const nodeGuids = decoded.value.node_guids.map(guid).filter((value) => value !== undefined)

  if (!text || !packageGuid || !nodeGuids.length) return

  return { text, nodeGuids: [...new Set(nodeGuids)], packageGuid }
}
