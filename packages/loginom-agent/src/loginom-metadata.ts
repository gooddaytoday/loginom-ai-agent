import { SessionID } from "@opencode/schema/session-id"
import { Option, Schema } from "effect"
import {
  LOGINOM_METADATA_FIELD_MAX_BYTES,
  LOGINOM_METADATA_MAX_BYTES,
  loginomMetadataBytes,
  withLoginomMetadata,
} from "../../loginom-runtime/client/lib/loginom-feed-metadata.mjs"

const count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const id = Schema.NonEmptyString
const stepId = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_.:-]{1,128}$/))
const busy = Schema.Struct({
  version: Schema.Literal(1),
  windowId: Schema.String.check(Schema.isUUID()),
  operationId: stepId,
  active: Schema.Boolean,
})
const step = Schema.Struct({
  outcome: Schema.Literals(["completed", "not_applied", "check_required"]),
  retryAvailable: Schema.Boolean,
  reason: Schema.optional(Schema.Literals(["unknown_write", "graph_conflict", "partial_effect"])),
  persistence: Schema.Literals(["saved_through", "step_unsaved", "unknown"]),
  save: Schema.NullOr(
    Schema.Struct({
      operationId: stepId,
      path: Schema.String,
      throughStep: Schema.Struct({ operationId: stepId, label: Schema.String.check(Schema.isMaxLength(240)) }),
    }),
  ),
})

const position = Schema.Struct({ x: Schema.Finite, y: Schema.Finite })
const graphNode = Schema.Struct({ guid: id, label: Schema.String, type: id, position })
const graphLink = Schema.Struct({ source: id, output: id, target: id, input: id })
const manualEdits = Schema.Array(
  Schema.Union([
    Schema.Struct({ kind: Schema.Literals(["node_added", "node_removed"]), node: graphNode }),
    Schema.Struct({ kind: Schema.Literal("node_renamed"), guid: id, from: Schema.String, to: Schema.String }),
    Schema.Struct({ kind: Schema.Literal("node_moved"), guid: id, label: Schema.String, from: position, to: position }),
    Schema.Struct({
      kind: Schema.Literals(["link_added", "link_removed"]),
      link: graphLink,
      sourceLabel: Schema.String,
      targetLabel: Schema.String,
    }),
  ]),
)

const savedPackageIdentity = { saveOperationId: id, packagePath: Schema.String }
const savedChange = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("node_missing"), nodeId: id, before: Schema.String }),
  Schema.Struct({
    kind: Schema.Literal("node_renamed"),
    nodeId: id,
    before: Schema.String,
    saved: Schema.String,
    observedBeforeSave: Schema.String,
    repair: Schema.Struct({ label: Schema.String, prompt: Schema.String }),
  }),
  Schema.Struct({
    kind: Schema.Literals(["sorting_key_order", "sorting_field_order"]),
    nodeId: id,
    label: Schema.String,
    before: Schema.Array(Schema.String),
    saved: Schema.Array(Schema.String),
  }),
  Schema.Struct({ kind: Schema.Literals(["link_added", "link_removed"]), endpoints: Schema.Tuple([id, id, id, id]) }),
])
const graphScope = Schema.Literals(["activeWorkflow", "package"])
const savedPackageGraph = Schema.Union([
  Schema.Struct({ ...savedPackageIdentity, status: Schema.Literal("unavailable") }),
  Schema.Struct({
    ...savedPackageIdentity,
    status: Schema.Literal("compared"),
    scope: graphScope,
    savedLabels: Schema.Array(Schema.Struct({ nodeId: id, label: Schema.String })),
    changes: Schema.Array(savedChange),
    uncheckedSorting: Schema.Array(id),
    renameAttribution: Schema.Literals(["unconfirmed", "observed_during_save"]),
  }),
])

const cell = Schema.Struct({
  type: Schema.String,
  is_null: Schema.optional(Schema.Boolean),
  value: Schema.optional(Schema.Union([Schema.String, Schema.Number, Schema.Boolean, Schema.Null])),
  decimal: Schema.optional(Schema.String),
  representation: Schema.optional(Schema.String),
  display_text: Schema.optional(Schema.String),
  precision: Schema.optional(Schema.String),
  timezone: Schema.optional(Schema.String),
  cell_type: Schema.optional(Schema.Union([Schema.String, Schema.Number])),
  non_finite: Schema.optional(Schema.String),
})

export const LoginomEvidence = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("tableRead"),
    port: count,
    portGuid: id,
    rowsRead: count,
    rowCount: count,
    executionId: Schema.optional(id),
  }).check(Schema.makeFilter((read) => read.rowsRead <= read.rowCount)),
  Schema.Struct({ kind: Schema.Literal("executed"), executionId: id, scope: graphScope }),
  Schema.Struct({ kind: Schema.Literal("saved"), path: id }),
  Schema.Struct({ kind: Schema.Literal("reopenedGraphRead"), nodeCount: count, scope: graphScope }),
  Schema.Struct({
    kind: Schema.Literal("savedFileRead"),
    nodeCount: count,
    scope: Schema.Literal("package"),
    workflowGuidMatch: Schema.NullOr(Schema.Boolean),
    file: Schema.Struct({
      mtime: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)),
      size: Schema.Int.check(Schema.isGreaterThan(0)),
      hash: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
    }),
  }),
])
const receiptWindow = Schema.Struct({
  runtimeId: Schema.String.check(Schema.isUUID()),
  documentId: id,
  startSequence: Schema.Int.check(Schema.isGreaterThan(0)),
  confirmedSequence: count,
}).check(Schema.makeFilter((window) => window.startSequence < window.confirmedSequence))

const packagePath = Schema.String.check(
  Schema.isMaxLength(1024),
  Schema.isPattern(/^\/(?:[^/\\\x00-\x1f]+\/)*[^/\\\x00-\x1f]+\.lgp$/i),
  Schema.makeFilter((path) => !path.split("/").some((part) => part === "." || part === "..")),
)
const packageAccess = Schema.Union([
  Schema.Struct({ packagePath, kind: Schema.Literals(["unavailable", "writable", "other_loginom_session"]) }),
  Schema.Struct({ packagePath, kind: Schema.Literal("other_conversation"), sessionId: SessionID }),
  Schema.Struct({
    packagePath,
    kind: Schema.Literal("read_only"),
    lockMarker: Schema.Literals(["not_observed", "unknown"]),
  }),
])
const coverage = Schema.Literals(["complete", "partial", "unavailable"])
export const LoginomPackageVariables = Schema.Struct({
  source: Schema.Literal("saved"),
  definitionsCoverage: coverage,
  defaultsCoverage: coverage,
  usagesCoverage: Schema.Literal("partial"),
  truncated: Schema.optional(Schema.Boolean),
  definitions: Schema.NullOr(Schema.Array(Schema.Struct({ name: Schema.String, type: Schema.String }))),
  defaults: Schema.NullOr(Schema.Array(Schema.Struct({ name: Schema.String, value: Schema.String }))),
  usages: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      kind: Schema.Literals(["template", "binding"]),
      scope: Schema.Literals(["package", "control", "unknown"]),
      module: Schema.String,
      branch: Schema.Array(Schema.String),
      nodeId: Schema.String,
      nodeLabel: Schema.String,
      parameter: Schema.String,
    }),
  ),
})
const agentCopy = Schema.Struct({ originalPath: packagePath, path: packagePath })

const identity = Schema.Struct({
  v: Schema.Literal(1),
  operationId: id,
  state: Schema.Literals(["running", "settled"]),
})
const extensionFields = {
  kind: Schema.Literals(["add", "configure", "execute", "export", "read", "save"]),
  busy,
  step,
  manualEdits,
  verificationStale: Schema.Boolean,
  savedPackageGraph,
  evidence: Schema.Array(LoginomEvidence),
  receiptWindow,
  packageAccess,
  packageVariables: LoginomPackageVariables,
  agentCopy,
}
const fields = {
  ...extensionFields,
  attempt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  status: Schema.Literals(["SUCCEEDED", "FAILED", "NOT_APPLIED", "AMBIGUOUS"]),
  phase: Schema.String,
  node: Schema.Struct({ guid: Schema.NonEmptyString, label: Schema.String, type: Schema.NonEmptyString }),
  executionId: Schema.String,
  executionStatus: Schema.Literals(["not_requested", "pending", "completed", "cancelled", "unknown", "failed"]),
  effectPossible: Schema.Boolean,
  cleanupComplete: Schema.Boolean,
  limitations: Schema.Array(Schema.String),
  nextStep: Schema.Struct({ tool: Schema.optional(Schema.String), instruction: Schema.String }),
  ports: Schema.Array(
    Schema.Struct({
      index: count,
      guid: Schema.NonEmptyString,
      rowCount: count,
      columnCount: count,
      preview: Schema.optional(
        Schema.Struct({
          schema: Schema.Array(
            Schema.Struct({
              index: count,
              name: Schema.String,
              label: Schema.optional(Schema.String),
              type: Schema.String,
              data_kind: Schema.optional(Schema.String),
            }),
          ),
          sample: Schema.Array(Schema.Array(cell)).check(Schema.isMaxLength(10)),
          sampleComplete: Schema.Boolean,
        }),
      ),
    }),
  ),
  error: Schema.Struct({
    code: Schema.String,
    message: Schema.String,
    source: Schema.Literals(["loginom", "runtime", "host"]),
    attribution: Schema.optional(Schema.Literals(["verified_node", "after_launch"])),
  }),
  files: Schema.Array(Schema.Struct({ artifactId: Schema.NonEmptyString, name: Schema.String, bytes: count })),
}
const diagnostics = {
  dropped: Schema.Array(Schema.Literals(Object.keys(fields) as (keyof typeof fields)[])),
  omitted: Schema.Record(Schema.String.check(Schema.isMaxLength(64)), count),
}
const rawFields = { ...fields, ...diagnostics }
const optional = Object.fromEntries(
  Object.entries(rawFields).map(([key, schema]) => [key, Schema.optional(schema)]),
) as {
  [K in keyof typeof rawFields]: Schema.optional<(typeof rawFields)[K]>
}

export const LoginomMetadata = Schema.Struct({ ...identity.fields, ...optional }).check(
  Schema.makeFilter((metadata) => loginomMetadataBytes(metadata) <= LOGINOM_METADATA_MAX_BYTES, {
    expected: "Loginom metadata of at most 16 KiB in UTF-8 JSON",
  }),
  Schema.makeFilter(
    (metadata) =>
      Object.entries(LOGINOM_METADATA_FIELD_MAX_BYTES).every(([key, limit]) => {
        const value = metadata[key as keyof typeof extensionFields]
        return value === undefined || loginomMetadataBytes(value) <= limit
      }),
    { expected: "Loginom metadata fields within their UTF-8 JSON byte budgets" },
  ),
)
export type LoginomMetadata = typeof LoginomMetadata.Type

type Extension = keyof typeof extensionFields
export type LoginomMetadataFields = Partial<Pick<LoginomMetadata, Extension>>
export type LoginomMetadataInput = {
  toolCallId: string
  host?: unknown
  agent?: LoginomMetadataFields
}

const decodeIdentity = Schema.decodeUnknownOption(identity)
const decodeBlock = Schema.decodeUnknownOption(LoginomMetadata)
const fieldDecoders = Object.entries(rawFields).map(([key, schema]) => ({
  key,
  decode: Schema.decodeUnknownOption(schema),
  limit: LOGINOM_METADATA_FIELD_MAX_BYTES[key as Extension],
}))

function readFields(value: object, extensionOnly = false) {
  const accepted: Record<string, unknown> = {}
  const dropped: string[] = []
  for (const { key, decode, limit } of fieldDecoders) {
    if (extensionOnly && !Object.hasOwn(extensionFields, key)) continue
    if (!Object.hasOwn(value, key)) continue
    const field = (value as Record<string, unknown>)[key]
    if (field === undefined) continue
    const decoded = decode(field)
    if (
      Option.isSome(decoded) &&
      (limit !== undefined ||
        Array.isArray(decoded.value) ||
        loginomMetadataBytes(decoded.value) <= LOGINOM_METADATA_MAX_BYTES)
    ) {
      accepted[key] = decoded.value
    } else if (Object.hasOwn(fields, key)) {
      dropped.push(key)
    }
  }
  return { accepted, dropped }
}

export function decodeLoginomMetadata(value: unknown, input?: LoginomMetadataInput): LoginomMetadata | undefined {
  const base = Option.getOrUndefined(decodeIdentity(value))
  let result: { _meta?: Record<string, unknown> } = {}
  if (base && typeof value === "object" && value !== null) {
    const { accepted, dropped } = readFields(value)
    result = withLoginomMetadata(result, { receipt: { ...base, ...accepted }, dropped })
  }
  for (const source of [input?.host, input?.agent]) {
    if (typeof source !== "object" || source === null) continue
    const { accepted, dropped } = readFields(source, true)
    result = withLoginomMetadata(result, {
      ...accepted,
      ...(base ? {} : { operationId: input?.toolCallId, state: "settled" }),
      dropped,
    })
  }
  return Option.getOrUndefined(decodeBlock(result._meta?.loginom))
}
