import { Schema } from "effect"

export const packageChangesTool = "loginom_package_changes"

const position = Schema.Struct({ x: Schema.Finite, y: Schema.Finite })
const node = Schema.Struct({ guid: Schema.NonEmptyString, label: Schema.String })
const link = Schema.Struct({
  source: node.fields.guid,
  target: node.fields.guid,
  output: Schema.NonEmptyString,
  input: Schema.NonEmptyString,
})
const edit = Schema.Union([
  Schema.Struct({ kind: Schema.Literals(["node_added", "node_removed"]), node }),
  Schema.Struct({
    kind: Schema.Literal("node_renamed"),
    guid: node.fields.guid,
    from: Schema.String,
    to: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("node_moved"),
    guid: node.fields.guid,
    label: node.fields.label,
    from: position,
    to: position,
  }),
  Schema.Struct({
    kind: Schema.Literals(["link_added", "link_removed"]),
    link,
    sourceLabel: node.fields.label,
    targetLabel: node.fields.label,
  }),
])

const run = Schema.Struct({
  run: Schema.Struct({
    kind: Schema.Literal("executed"),
    executionId: Schema.NonEmptyString,
    scope: Schema.Literal("workspace"),
  }),
  table: Schema.Struct({
    kind: Schema.Literal("tableRead"),
    executionId: Schema.NonEmptyString,
    rowCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  }),
})

const metadata = Schema.Struct({
  loginom: Schema.Struct({
    packageChanges: Schema.Struct({
      v: Schema.Literal(1),
      sessionID: Schema.NonEmptyString,
      turnID: Schema.NonEmptyString,
      packageName: Schema.NonEmptyString,
      copyPath: Schema.NonEmptyString,
      copyUrl: Schema.optionalKey(Schema.String),
      originalUrl: Schema.optionalKey(Schema.String),
      schemaUrl: Schema.optionalKey(Schema.String),
      edits: Schema.Array(edit).check(Schema.isMaxLength(1600)),
      comparison: Schema.optionalKey(Schema.Struct({ original: run, copy: run })),
    }),
  }),
})

export type PackageChanges = typeof metadata.Type.loginom.packageChanges
export const decodePackageChanges = Schema.decodeUnknownOption(metadata)

type Reason = { kind: "renamed"; from: string } | { kind: "moved" | "links" }
type NodeRow = { label: string; kind: "added" | "changed" | "removed"; reasons: Reason[] }

export function nodeRows(edits: PackageChanges["edits"]) {
  const rows = new Map<string, NodeRow>()
  const row = (guid: string, label: string) => {
    const existing = rows.get(guid)
    if (existing) return existing
    const created: NodeRow = { label, kind: "changed", reasons: [] }
    rows.set(guid, created)
    return created
  }

  for (const entry of edits) {
    if (entry.kind === "node_added" || entry.kind === "node_removed") {
      rows.set(entry.node.guid, {
        label: entry.node.label,
        kind: entry.kind === "node_added" ? "added" : "removed",
        reasons: [],
      })
    }
    if (entry.kind === "node_renamed") {
      const renamed = row(entry.guid, entry.to)
      renamed.label = entry.to
      renamed.reasons.push({ kind: "renamed", from: entry.from })
    }
    if (entry.kind === "node_moved") row(entry.guid, entry.label).reasons.push({ kind: "moved" })
  }
  for (const entry of edits) {
    if (entry.kind !== "link_added" && entry.kind !== "link_removed") continue
    for (const endpoint of [row(entry.link.source, entry.sourceLabel), row(entry.link.target, entry.targetLabel)]) {
      if (endpoint.kind === "changed" && !endpoint.reasons.some((reason) => reason.kind === "links"))
        endpoint.reasons.push({ kind: "links" })
    }
  }
  return [...rows.values()]
}

export function comparisonRows(comparison: PackageChanges["comparison"]) {
  if (!comparison) return
  const { original, copy } = comparison
  if (original.run.executionId === copy.run.executionId) return
  if (original.table.executionId !== original.run.executionId || copy.table.executionId !== copy.run.executionId) return
  return { original: original.table.rowCount, copy: copy.table.rowCount }
}
