import { Option, Schema } from "effect"

export const NodeContext = Schema.Struct({
  source: Schema.Struct({
    serverID: Schema.NonEmptyString,
    sessionID: Schema.NonEmptyString,
    messageID: Schema.optionalKey(Schema.NonEmptyString),
  }),
  node: Schema.Struct({
    package: Schema.NonEmptyString,
    path: Schema.NonEmptyString,
    guid: Schema.NonEmptyString,
    name: Schema.NonEmptyString,
  }),
  intent: Schema.Literals(["ask", "edit"]),
})

export type NodeContext = typeof NodeContext.Type

const StoredNodeContext = Schema.fromJsonString(NodeContext)

const decode = Schema.decodeUnknownOption(StoredNodeContext)

export const encodeNodeContext = Schema.encodeSync(StoredNodeContext)

export const readNodeContext = (data: string) => Option.getOrUndefined(decode(data))

export function nodeSubject(context: NodeContext) {
  return `Loginom node ${JSON.stringify({
    package: context.node.package,
    path: context.node.path,
    guid: context.node.guid,
    name: context.node.name,
    intent: context.intent,
  })}`
}
