import type { SessionDomain } from "@opencode/plugin/promise/session"
import { Session } from "@opencode/schema/session"
import { SessionMessage } from "@opencode/schema/session-message"
import { Option, Schema } from "effect"

const ID = Schema.NonEmptyString
const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const NodeCount = Schema.Struct({
  source: Schema.Literals(["workspace.graph", "executor.save_graph"]),
  count: Count,
  navigation: Schema.NonEmptyArray(Schema.NonEmptyString),
})
const Execution = Schema.Struct({ source: Schema.Literal("node.execution"), execution_id: ID, node_id: ID })
const PortRows = Schema.Struct({
  source: Schema.Literal("node.output.port"),
  execution_id: ID,
  port: Count,
  port_guid: ID,
  count: Count,
})
const Save = Schema.Struct({ source: Schema.Literals(["save_completed", "executor.save_flow_completed"]) })
const PackagePath = Schema.Struct({
  source: Schema.Literals(["executor.reopened_package_observed", "storage.FileExists"]),
  path: Schema.String.check(Schema.isPattern(/^\/(?:[^/\\\x00-\x1f]+\/)*[^/\\\x00-\x1f]+\.lgp$/i)),
})
const Reopen = Schema.Struct({ source: Schema.Literal("reopened") })
const Receipt = {
  document_id: ID,
  workflow_id: ID,
  operation_id: ID,
  node_count: Schema.optionalKey(NodeCount),
}
const Evidence = Schema.Union([
  Schema.Struct({ ...Receipt, kind: Schema.tag("workspace") }),
  Schema.Struct({
    ...Receipt,
    kind: Schema.tag("node"),
    execution: Schema.optionalKey(Execution),
    final_port_rows: Schema.optionalKey(PortRows),
  }),
  Schema.Struct({
    ...Receipt,
    kind: Schema.tag("save"),
    save_completed: Schema.optionalKey(Save),
    package_path: Schema.optionalKey(PackagePath),
    reopened: Schema.optionalKey(Reopen),
  }),
]).pipe(Schema.toTaggedUnion("kind"))
const Scope = Schema.Struct({ document_id: ID, workflow_id: ID, generation: Count })
const Stamp = Schema.Struct({
  session_id: Session.ID,
  turn_id: SessionMessage.ID,
  generation: Count,
})
const Stored = Schema.Struct({ ...Stamp.fields, evidence: Evidence })
const decode = Schema.decodeUnknownOption(Stored)

const Unverified = Schema.Struct({ status: Schema.Literal("unverified") })
const unverified = { status: "unverified" } as const
const verified = { status: Schema.Literal("verified"), operation_id: ID }
const fact = <Fields extends Schema.Struct.Fields>(fields: Fields) =>
  Schema.Union([Unverified, Schema.Struct({ ...fields, ...verified })])

const TurnMetadata = Schema.Struct({
  version: Schema.Literal(1),
  scope: Schema.optionalKey(Scope),
  facts: Schema.Struct({
    node_count: fact(NodeCount.fields),
    execution: fact(Execution.fields),
    final_port_rows: fact(PortRows.fields),
    save_completed: fact(Save.fields),
    package_path: fact(PackagePath.fields),
    reopened: fact(Reopen.fields),
    persisted_content: Unverified,
  }),
})

export const buildFactsRPC = {
  id: "loginom.build-facts",
  methods: {
    get: {
      input: Schema.toStandardSchemaV1(Schema.Struct({ sessionID: Session.ID, turnID: SessionMessage.ID })),
      output: Schema.toStandardSchemaV1(Schema.Struct({ metadata: Schema.Struct({ loginom: TurnMetadata }) })),
    },
  },
  events: {},
} as const

export function buildFactsMetadata(value: unknown, stamp: typeof Stamp.Encoded) {
  return Option.getOrUndefined(decode({ ...stamp, evidence: value }))
}

function report<T>(value: T | undefined, operation_id: string | undefined) {
  return value && operation_id ? { ...value, status: "verified" as const, operation_id } : unverified
}

type Messages = Awaited<ReturnType<SessionDomain["history"]>>
type NodeReceipt = typeof Evidence.cases.node.Type
type SaveReceipt = typeof Evidence.cases.save.Type

export function turnBuildFacts(messages: Messages, sessionID: Session.ID, turnID: SessionMessage.ID) {
  let scope: typeof Scope.Type | undefined
  let graph: typeof Evidence.Type | undefined
  let execution: NodeReceipt | undefined
  let rows: NodeReceipt | undefined
  let save: SaveReceipt | undefined
  const executions = new Set<string>()
  const saves = new Set<string>()

  for (const message of messages) {
    if (message.type !== "assistant") continue
    for (const part of message.content) {
      if (part.type !== "tool" || part.state.status !== "completed" || !part.name.startsWith("loginom_dock_")) continue
      const stored = Option.getOrUndefined(decode(part.state.metadata?.loginom))
      if (!stored || stored.session_id !== sessionID || stored.turn_id !== turnID) continue
      const { evidence, generation } = stored
      const { document_id, workflow_id } = evidence
      if (scope?.generation !== generation || scope.document_id !== document_id || scope.workflow_id !== workflow_id) {
        scope = { document_id, workflow_id, generation }
        graph = execution = rows = save = undefined
        executions.clear()
        saves.clear()
      }
      if (evidence.kind === "save") {
        if (saves.has(evidence.operation_id)) continue
        saves.add(evidence.operation_id)
        save = evidence
      }
      graph = evidence
      if (evidence.kind === "node" && evidence.execution) {
        const id = evidence.execution.execution_id
        if (!executions.has(id)) {
          executions.add(id)
          execution = evidence
          rows = undefined
        }
        if (execution?.execution?.execution_id === id && evidence.final_port_rows?.execution_id === id) rows = evidence
      }
    }
  }

  return {
    metadata: {
      loginom: {
        version: 1,
        ...(scope ? { scope } : {}),
        facts: {
          node_count: report(graph?.node_count, graph?.operation_id),
          execution: report(execution?.execution, execution?.operation_id),
          final_port_rows: report(rows?.final_port_rows, rows?.operation_id),
          save_completed: report(save?.save_completed, save?.operation_id),
          package_path: report(save?.package_path, save?.operation_id),
          reopened: report(save?.reopened, save?.operation_id),
          persisted_content: unverified,
        },
      },
    },
  } satisfies { metadata: { loginom: typeof TurnMetadata.Type } }
}
