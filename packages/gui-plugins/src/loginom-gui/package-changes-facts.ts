import { Effect, Option, Schema } from "effect"
import { SchemaPair } from "./contract"
import type en from "./i18n/en"

const direction = Schema.Literals(["input", "output"])

const guid = Schema.NullOr(Schema.String)

const port = Schema.Struct({
  guid,
  name: Schema.String,
  direction,
})

const node = Schema.Struct({
  guid,
  label: Schema.String,
  filter_conditions: Schema.optionalKey(
    Schema.Array(Schema.Struct({ field: Schema.String, relation: Schema.String, join: guid, value: guid })),
  ),
  grouping_fields: Schema.optionalKey(
    Schema.Array(Schema.Struct({ field: Schema.String, role: Schema.Literals(["group", "measure"]), functions: guid })),
  ),
  text_import: Schema.optionalKey(
    Schema.Struct({
      file_or_url: Schema.optionalKey(Schema.String),
      column_separator: Schema.optionalKey(Schema.String),
    }),
  ),
  ports: Schema.Array(port),
})

const endpoint = Schema.Struct({ node_guid: guid, port_guid: guid })

const link = Schema.Struct({ source: endpoint, target: endpoint })

type Workflow = {
  readonly nodes: readonly (typeof node.Type)[]
  readonly links: readonly (typeof link.Type)[]
  readonly submodels: readonly Workflow[]
}

const workflow: Schema.Codec<Workflow> = Schema.Struct({
  nodes: Schema.Array(node),
  links: Schema.Array(link),
  submodels: Schema.Array(Schema.suspend((): Schema.Codec<Workflow> => workflow)),
})

const saved = Schema.Struct({
  source: Schema.Literal("saved"),
  complete: Schema.Literal(true),
  scope: Schema.Literal("package"),
  workflows: Schema.Array(workflow),
})

export const packageChangeSchemas = Schema.UndefinedOr(
  Schema.Union([SchemaPair, Schema.Struct({ before: saved, after: saved })]),
).pipe(Schema.catchDecoding(() => Effect.succeed(Option.some(undefined))))

export function diagramSchemas(schemas: typeof packageChangeSchemas.Type): SchemaPair | undefined {
  if (schemas && "package" in schemas.before && "package" in schemas.after) {
    return { before: schemas.before, after: schemas.after }
  }
}

export type TranslateFacts = (key: keyof typeof en, params?: Record<string, string>) => string

type Fact = { label: string; value: string; identity?: string }

type Facts = Map<string, Fact>

export type FactRow = { label: string; before?: string; after?: string; same: boolean }

export type Direction = typeof direction.Type

type SettingValueLabels = Readonly<Partial<Record<string, keyof typeof en>>>

const settingValueLabels: SettingValueLabels = Object.freeze({
  frtEqual: "facts.equal",
  frtNotEqual: "facts.notEqual",
  frtLess: "facts.less",
  frtLessOrEqual: "facts.lessOrEqual",
  frtGreater: "facts.greater",
  frtGreaterOrEqual: "facts.greaterOrEqual",
  frtBetween: "facts.between",
  frtNotStartingWith: "facts.notStartingWith",
  frtIsNull: "facts.isNull",
  frtIsNotNull: "facts.isNotNull",
  frtIsTrue: "facts.isTrue",
  frtIsFalse: "facts.isFalse",
  gdSum: "facts.sum",
  gdMin: "facts.min",
  gdMax: "facts.max",
  gdCount: "facts.count",
  gdAvg: "facts.average",
  "\t": "facts.tab",
  " ": "facts.space",
  ";": "facts.semicolon",
  ",": "facts.comma",
})

function settingValue(value: string, t: TranslateFacts) {
  const key = Object.hasOwn(settingValueLabels, value) ? settingValueLabels[value] : undefined

  return key ? t(key) : value
}

function settings(entry: typeof node.Type, t: TranslateFacts): Facts {
  const result: Facts = new Map()

  const add = (key: keyof typeof en, value: string | undefined, identity?: string) => {
    if (value !== undefined) result.set(key, { label: t(key), value: value || t("facts.empty"), identity })
  }

  if (entry.filter_conditions) {
    const conditions = entry.filter_conditions.map(({ field, relation, join, value }, index) => {
      const prefix = index ? t(join === "ctOr" ? "facts.or" : "facts.and") + " " : ""

      return prefix + [field, settingValue(relation, t), value].filter((part) => part != null).join(" ")
    })

    add("facts.condition", conditions.join(" "), JSON.stringify(entry.filter_conditions))
  }

  if (entry.grouping_fields) {
    const group = entry.grouping_fields.filter((field) => field.role === "group")
    const measures = entry.grouping_fields.filter((field) => field.role === "measure")
    add("facts.group", group.map(({ field }) => field).join(", "))
    add(
      "facts.measures",
      measures
        .map(({ field, functions }) => {
          if (!functions) return field

          const labels = functions.split(/\s+/).map((name) => settingValue(name, t))

          return `${field} — ${labels.join(", ")}`
        })
        .join(", "),
      JSON.stringify(measures),
    )
  }

  add("facts.file", entry.text_import?.file_or_url?.replace(/(https?:\/\/)[^/|\s@]+@/gi, "$1"))
  const separator = entry.text_import?.column_separator
  add("facts.separator", separator === undefined ? undefined : settingValue(separator, t))

  return result
}

type Peer = { node: string; port: string; label: string }

export function portFact(direction: Direction, peers: readonly Peer[], t: TranslateFacts, name?: string): Fact {
  const ordered = peers.toSorted((a, b) => a.node.localeCompare(b.node) || a.port.localeCompare(b.port))

  const label = name
    ? t(direction === "input" ? "facts.namedInput" : "facts.namedOutput", { name })
    : t(direction === "input" ? "facts.input" : "facts.output")

  return {
    label,
    value: ordered.length
      ? t(direction === "input" ? "facts.from" : "facts.to", {
          nodes: ordered.map((peer) => t("facts.quoted", { name: peer.label })).join(", "),
        })
      : t("facts.disconnected"),
    identity: JSON.stringify(ordered.map(({ node, port }) => [node, port])),
  }
}

type SnapshotNode = { label: string; settings: Facts; ports: Facts }

function snapshot(workflows: readonly Workflow[], t: TranslateFacts) {
  const result = new Map<string, SnapshotNode>()

  const visit = (workflow: Workflow) => {
    const labels = new Map(workflow.nodes.map((node) => [node.guid, node.label]))
    const connections = new Map<string, Peer[]>()
    const key = (node: string, direction: Direction, port: string) => JSON.stringify([node, direction, port])

    const connect = (direction: Direction, own: typeof endpoint.Type, other: typeof endpoint.Type) => {
      if (!own.node_guid || !own.port_guid || !other.node_guid) return
      const id = key(own.node_guid, direction, own.port_guid)

      const peer = {
        node: other.node_guid,
        port: other.port_guid ?? "",
        label: labels.get(other.node_guid) || t("facts.node"),
      }

      const peers = connections.get(id)

      if (peers) peers.push(peer)
      else connections.set(id, [peer])
    }

    for (const { source, target } of workflow.links) {
      connect("output", source, target)
      connect("input", target, source)
    }

    for (const node of workflow.nodes) {
      if (!node.guid) continue
      const ports: Facts = new Map()

      for (const port of node.ports) {
        if (!port.guid) continue
        const id = port.guid
        const peers = connections.get(key(node.guid, port.direction, id)) ?? []
        ports.set(JSON.stringify([port.direction, id]), portFact(port.direction, peers, t, port.name))
      }

      result.set(node.guid, { label: node.label, settings: settings(node, t), ports })
    }

    for (const child of workflow.submodels) visit(child)
  }

  for (const workflow of workflows) visit(workflow)

  return result
}

export function snapshotFacts(pair: typeof packageChangeSchemas.Type, t: TranslateFacts) {
  if (pair) return { before: snapshot(pair.before.workflows, t), after: snapshot(pair.after.workflows, t) }
}

export function compareFacts(before?: Facts, after?: Facts): FactRow[] {
  const keys = new Set([...(before?.keys() ?? []), ...(after?.keys() ?? [])])

  return [...keys].flatMap((key) => {
    const left = before?.get(key)
    const right = after?.get(key)

    if (!left && !right) return []
    const renamed = left && right && left.label !== right.label

    return [
      {
        label: right?.label ?? left?.label ?? "",
        before: renamed ? `${left.label}: ${left.value}` : left?.value,
        after: renamed ? `${right.label}: ${right.value}` : right?.value,
        same: !!left && !!right && !renamed && left.value === right.value && left.identity === right.identity,
      },
    ]
  })
}
