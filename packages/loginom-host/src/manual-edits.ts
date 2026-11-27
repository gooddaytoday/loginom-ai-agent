import { Schema } from "effect"

const Position = Schema.Struct({ x: Schema.Finite, y: Schema.Finite })
const Node = Schema.Struct({
  guid: Schema.NonEmptyString,
  label: Schema.String,
  type: Schema.NonEmptyString,
  position: Position,
})
const Link = Schema.Struct({
  source: Schema.NonEmptyString,
  output: Schema.NonEmptyString,
  target: Schema.NonEmptyString,
  input: Schema.NonEmptyString,
})
const Snapshot = Schema.Struct({
  document: Schema.NonEmptyString,
  workflow: Schema.NonEmptyString,
  nodes: Schema.Array(Node).check(Schema.isMaxLength(200)),
  links: Schema.Array(Link).check(Schema.isMaxLength(400)),
})
const Edit = Schema.Union([
  Schema.Struct({ kind: Schema.Literals(["node_added", "node_removed"]), node: Node }),
  Schema.Struct({
    kind: Schema.Literal("node_renamed"),
    guid: Node.fields.guid,
    from: Schema.String,
    to: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("node_moved"),
    guid: Node.fields.guid,
    label: Schema.String,
    from: Position,
    to: Position,
  }),
  Schema.Struct({
    kind: Schema.Literals(["link_added", "link_removed"]),
    link: Link,
    sourceLabel: Schema.String,
    targetLabel: Schema.String,
  }),
])
export const ManualEdits = Schema.Array(Edit)
type Edits = typeof ManualEdits.Type
type Graph = typeof Snapshot.Type

const decodeSnapshot = Schema.decodeUnknownOption(Snapshot)
const linkKey = ({ source, output, target, input }: typeof Link.Type) => JSON.stringify([source, output, target, input])

function snapshot(value: unknown) {
  const result = decodeSnapshot(value)
  if (result._tag === "None") return
  const graph = result.value
  const nodes = new Set(graph.nodes.map((node) => node.guid))
  if (nodes.size !== graph.nodes.length || new Set(graph.links.map(linkKey)).size !== graph.links.length) return
  if (graph.links.some((link) => !nodes.has(link.source) || !nodes.has(link.target))) return
  return graph
}

function compare(before: Graph, after: Graph) {
  const edits: (typeof Edit.Type)[] = []
  const oldNodes = new Map(before.nodes.map((node) => [node.guid, node]))
  const newNodes = new Map(after.nodes.map((node) => [node.guid, node]))
  for (const node of after.nodes) {
    const previous = oldNodes.get(node.guid)
    if (!previous) {
      edits.push({ kind: "node_added", node })
      continue
    }
    if (previous.label !== node.label)
      edits.push({ kind: "node_renamed", guid: node.guid, from: previous.label, to: node.label })
    if (previous.position.x !== node.position.x || previous.position.y !== node.position.y)
      edits.push({ kind: "node_moved", guid: node.guid, label: node.label, from: previous.position, to: node.position })
  }
  for (const node of before.nodes) if (!newNodes.has(node.guid)) edits.push({ kind: "node_removed", node })
  for (const [kind, current, other, nodes] of [
    ["link_removed", before.links, after.links, oldNodes],
    ["link_added", after.links, before.links, newNodes],
  ] as const) {
    const otherKeys = new Set(other.map(linkKey))
    for (const link of current) {
      if (!otherKeys.has(linkKey(link)))
        edits.push({
          kind,
          link,
          sourceLabel: nodes.get(link.source)?.label ?? "",
          targetLabel: nodes.get(link.target)?.label ?? "",
        })
    }
  }
  return edits
}

export function graphSteps() {
  const chats = new Map<string, { task: string; generation: number; graph?: Graph }>()
  return (chat: string, task: string, generation: number) => {
    const previous = chats.get(chat)
    const baseline = previous?.generation === generation && previous.task !== task ? previous.graph : undefined
    const current: NonNullable<typeof previous> = { task, generation }
    chats.delete(chat)
    chats.set(chat, current)
    const oldest = chats.keys().next()
    if (chats.size > 128 && !oldest.done) chats.delete(oldest.value)
    return {
      readBefore: baseline !== undefined,
      settle(before: unknown, after: unknown): Edits {
        current.graph = snapshot(after)
        if (!baseline) return []
        const fresh = snapshot(before)
        return fresh && baseline.document === fresh.document && baseline.workflow === fresh.workflow
          ? compare(baseline, fresh)
          : []
      },
    }
  }
}
