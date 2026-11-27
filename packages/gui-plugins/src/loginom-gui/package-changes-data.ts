import { Schema } from "effect"
import { schemaNodeChanges } from "./compare-schemas"
import type { SchemaPair } from "./contract"
import {
  compareFacts,
  diagramSchemas,
  packageChangeSchemas,
  portFact,
  snapshotFacts,
  type Direction,
  type TranslateFacts,
} from "./package-changes-facts"

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
      schemas: Schema.optionalKey(packageChangeSchemas),
      comparison: Schema.optionalKey(Schema.Struct({ original: run, copy: run })),
    }),
  }),
})

export type PackageChanges = typeof metadata.Type.loginom.packageChanges

export type ChangesWithSchema = PackageChanges & { schemaDiff: SchemaPair }

export const decodePackageChanges = Schema.decodeUnknownOption(metadata)

type Reason = { kind: "renamed"; from: string } | { kind: "moved" | "links" | "settings" }

type LinkPort = { direction: Direction; peers: Parameters<typeof portFact>[1][number][] }

type NodeRow = {
  label: string
  kind: "added" | "changed" | "removed"
  reasons: Reason[]
  rename?: { from: string; to: string }
  move?: { from: typeof position.Type; to: typeof position.Type }
  before: Map<string, LinkPort>
  after: Map<string, LinkPort>
}

export function nodeRows(changes: PackageChanges, t: TranslateFacts) {
  const rows = new Map<string, NodeRow>()

  const row = (guid: string, label: string) => {
    const existing = rows.get(guid)

    if (existing) return existing
    const created: NodeRow = { label, kind: "changed", reasons: [], before: new Map(), after: new Map() }
    rows.set(guid, created)

    return created
  }

  for (const entry of changes.edits) {
    if (entry.kind === "node_added" || entry.kind === "node_removed") {
      const node = row(entry.node.guid, entry.node.label)
      node.kind = entry.kind === "node_added" ? "added" : "removed"
    }

    if (entry.kind === "node_renamed") {
      const renamed = row(entry.guid, entry.to)
      renamed.label = entry.to
      renamed.rename = entry
      renamed.reasons.push({ kind: "renamed", from: entry.from })
    }

    if (entry.kind === "node_moved") {
      const moved = row(entry.guid, entry.label)
      moved.move = entry
      moved.reasons.push({ kind: "moved" })
    }
  }

  const noteLink = (
    ports: Map<string, LinkPort>,
    direction: Direction,
    id: string,
    peer: LinkPort["peers"][number],
  ) => {
    const key = JSON.stringify([direction, id])
    const existing = ports.get(key)

    if (existing) existing.peers.push(peer)
    else ports.set(key, { direction, peers: [peer] })
  }

  for (const entry of changes.edits) {
    if (entry.kind !== "link_added" && entry.kind !== "link_removed") continue
    const { source, output, target, input } = entry.link
    const from = row(source, entry.sourceLabel)
    const to = row(target, entry.targetLabel)
    const side = entry.kind === "link_removed" ? "before" : "after"
    noteLink(from[side], "output", output, { node: target, port: input, label: entry.targetLabel })
    noteLink(to[side], "input", input, { node: source, port: output, label: entry.sourceLabel })

    for (const endpoint of [from, to]) {
      if (endpoint.kind === "changed" && !endpoint.reasons.some((reason) => reason.kind === "links"))
        endpoint.reasons.push({ kind: "links" })
    }
  }

  const pair = diagramSchemas(changes.schemas)

  if (pair) {
    for (const change of schemaNodeChanges(pair).values()) {
      const current = row(change.guid, change.label)
      current.kind = change.kind
      current.label = change.label
    }
  }

  const snapshots = snapshotFacts(changes.schemas, t)

  for (const [guid, after] of snapshots?.after ?? []) {
    const before = snapshots?.before.get(guid)

    if (before && compareFacts(before.settings, after.settings).some((fact) => !fact.same)) {
      row(guid, after.label).reasons.push({ kind: "settings" })
    }
  }

  const editPorts = (ports: Map<string, LinkPort>) =>
    new Map([...ports].map(([id, port]) => [id, portFact(port.direction, port.peers, t)]))

  const coords = ({ x, y }: typeof position.Type) => `${x}, ${y}`

  return [...rows].map(([guid, row]) => {
    const before = snapshots?.before.get(guid)
    const after = snapshots?.after.get(guid)
    const hasSnapshots = (row.kind === "added" || !!before) && (row.kind === "removed" || !!after)

    const facts = [
      ...(hasSnapshots ? compareFacts(before?.settings, after?.settings) : []),
      ...compareFacts(
        hasSnapshots ? before?.ports : editPorts(row.before),
        hasSnapshots ? after?.ports : editPorts(row.after),
      ),
    ]

    if (row.move) {
      facts.unshift({
        label: t("facts.position"),
        before: coords(row.move.from),
        after: coords(row.move.to),
        same: false,
      })
    }

    if (!facts.length || row.kind !== "changed" || row.rename) {
      const beforeName = row.kind === "added" ? undefined : (row.rename?.from ?? before?.label ?? row.label)
      const afterName = row.kind === "removed" ? undefined : (row.rename?.to ?? after?.label ?? row.label)
      facts.unshift({ label: t("facts.name"), before: beforeName, after: afterName, same: beforeName === afterName })
    }

    return { guid, label: row.label, kind: row.kind, reasons: row.reasons, facts }
  })
}

export function comparisonRows(comparison: PackageChanges["comparison"]) {
  if (!comparison) return
  const { original, copy } = comparison

  if (original.run.executionId === copy.run.executionId) return

  if (original.table.executionId !== original.run.executionId || copy.table.executionId !== copy.run.executionId) return

  return { original: original.table.rowCount, copy: copy.table.rowCount }
}
