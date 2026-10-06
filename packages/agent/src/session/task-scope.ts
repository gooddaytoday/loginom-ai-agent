import type { SessionV1 } from "@loginom-ai-agent/core/v1/session"
import type { Schema } from "effect"
import { MessageID, type PartID, type SessionID } from "./schema"

export type Profile = "default" | "package-docs" | "loginom-automation"
export type Info = { sessionID: SessionID; taskMessageID: MessageID; profile: Profile }
type History = Schema.Schema.Type<typeof SessionV1.WithParts>

export function derive(input: {
  sessionID: SessionID
  messages: readonly History[]
  revert?: { messageID: MessageID; partID?: PartID }
}): Info | undefined {
  const messages = input.messages
    .filter((message) => message.info.sessionID === input.sessionID)
    .toSorted(
      (left, right) => left.info.time.created - right.info.time.created || left.info.id.localeCompare(right.info.id),
    )
  const end = input.revert ? messages.findIndex((message) => message.info.id === input.revert?.messageID) : -1
  const visible = messages.slice(0, end < 0 ? messages.length : end + (input.revert?.partID ? 1 : 0)).map((message) => {
    const parts = message.parts.filter(
      (part) => part.sessionID === input.sessionID && part.messageID === message.info.id,
    )
    if (message.info.id !== input.revert?.messageID || !input.revert.partID) return { ...message, parts }
    const part = parts.findIndex((part) => part.id === input.revert?.partID)
    return { ...message, parts: part < 0 ? parts : parts.slice(0, part) }
  })
  const tasks = new Map<MessageID, MessageID | undefined>()
  let scope: Info | undefined
  for (const message of visible) {
    if (message.info.role === "user") {
      const replay = replayOf(message)
      if (
        !replay &&
        message.parts.some((part) => part.type !== "compaction" && (part.type !== "text" || part.synthetic !== true))
      )
        scope = { sessionID: input.sessionID, taskMessageID: message.info.id, profile: "default" }
      tasks.set(message.info.id, replay ? tasks.get(replay) : scope?.taskMessageID)
    }
    if (
      !scope ||
      (message.info.role === "user"
        ? tasks.get(message.info.id) !== scope.taskMessageID
        : message.info.summary || tasks.get(message.info.parentID) !== scope.taskMessageID)
    )
      continue
    for (const part of message.parts) {
      const next = activationProfile(
        message.info.role === "user" && part.type === "text"
          ? part.metadata?.skill_activation
          : message.info.role === "assistant" &&
              part.type === "tool" &&
              part.tool === "skill" &&
              part.state.status === "completed"
            ? part.state.metadata.activation
            : undefined,
      )
      if (next && !(scope.profile === "package-docs" && next === "loginom-automation"))
        scope = { ...scope, profile: next }
    }
  }
  return scope
}

export function replayOf(message: History): MessageID | undefined {
  if (message.info.role !== "user") return
  for (const part of message.parts) {
    if (part.sessionID !== message.info.sessionID || part.messageID !== message.info.id) continue
    const value: unknown = "metadata" in part ? part.metadata?.compaction_replay_of : undefined
    if (typeof value === "string" && value.startsWith("msg")) return MessageID.make(value)
  }
}

/** Public inputs and plugin hooks cannot issue backend task grants. */
export function sanitize(part: SessionV1.Part): SessionV1.Part {
  if (!("metadata" in part) || !part.metadata) return part
  return {
    ...part,
    metadata: Object.fromEntries(
      Object.entries(part.metadata).filter(
        ([key]) =>
          ![
            "activation",
            "activation_pending",
            "skill_activation",
            "skill_activation_pending",
            "compaction_replay_of",
          ].includes(key),
      ),
    ),
  }
}

function activationProfile(value: unknown): Exclude<Profile, "default"> | undefined {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("name" in value) ||
    !("profile" in value) ||
    !("digest" in value) ||
    typeof value.digest !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.digest) ||
    Object.keys(value).sort().join(",") !== "digest,name,profile" ||
    value.name !== value.profile
  )
    return
  if (value.profile === "package-docs" || value.profile === "loginom-automation") return value.profile
}

export * as TaskScope from "./task-scope"
