import { Effect, Option, Schema } from "effect"
import type { Plugin } from "@opencode/plugin/gui"
import type definition from "./index"

type Copy = Pick<Parameters<Plugin.Setup<typeof definition>>[0], "t">

const count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

const positive = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))

const text = Schema.NonEmptyString

const displayField = <S extends Schema.Constraint>(schema: S) =>
  Schema.catchDecoding<Schema.optional<S>>(() => Effect.succeed(Option.none()))(Schema.optional(schema))

// The timeline reads only the display fields of the Loginom metadata v1 receipt.
const Receipt = Schema.Struct({
  v: Schema.Literal(1),
  operationId: text,
  state: Schema.Literals(["running", "settled"]),
  status: displayField(Schema.Literals(["SUCCEEDED", "FAILED", "NOT_APPLIED", "AMBIGUOUS"])),
  kind: displayField(Schema.Literals(["add", "configure", "execute", "export", "read", "save"])),
  node: displayField(Schema.Struct({ guid: text, label: Schema.String, type: text })),
  attempt: displayField(positive),
  error: displayField(
    Schema.Struct({
      code: Schema.String,
      message: Schema.String,
      source: Schema.Literals(["loginom", "runtime", "host"]),
    }),
  ),
  ports: displayField(
    Schema.Array(
      Schema.Struct({
        guid: text,
        index: count,
        rowCount: count,
        columnCount: count,
      }),
    ),
  ),
  files: displayField(Schema.Array(Schema.Struct({ artifactId: text, name: Schema.String, bytes: count }))),
  evidence: displayField(Schema.Array(Schema.Unknown)),
})

const decodeSaved = Schema.decodeUnknownOption(Schema.Struct({ kind: Schema.Literal("saved"), path: text }))

const Progress = Schema.Struct({
  version: Schema.Literal(1),
  phase: Schema.Literals(["waiting", "configuring", "executing", "reading"]),
  startedAt: count,
  lastReplyAt: Schema.NullOr(count),
  stalledSince: Schema.NullOr(count),
  substep: Schema.NullOr(
    Schema.Struct({
      kind: Schema.Literal("fields"),
      index: positive,
      total: positive,
    }),
  ),
})

export const decodeFacts = Schema.decodeUnknownOption(Receipt)

export const decodeProgress = Schema.decodeUnknownOption(Progress)

type Facts = Option.Option.Value<ReturnType<typeof decodeFacts>>

function savedPath(facts?: Facts) {
  for (const item of facts?.evidence ?? []) {
    const saved = decodeSaved(item)

    if (Option.isSome(saved)) return saved.value.path
  }
}

function operation(facts?: Facts) {
  if (facts?.kind !== "read" && facts?.node?.type.startsWith("imports.") && facts.ports?.length) return "import"

  return facts?.kind
}

/** Formats the outcome of a completed call, for either a step row or a turn summary. */
export function loginomStepPhrase(
  copy: Copy,
  input: ReturnType<typeof decodeFacts>,
  options?: { pending?: boolean; lowercase?: boolean },
) {
  const phrase = completedTitle(copy, input, options?.pending)

  return options?.lowercase ? phrase.replace(/^\p{Lu}/u, (first) => first.toLowerCase()) : phrase
}

function completedTitle(copy: Copy, input: ReturnType<typeof decodeFacts>, pending = false) {
  const facts = Option.getOrUndefined(input)

  if (pending || facts?.state === "running") return copy.t("step.pending")

  if (facts?.status !== "SUCCEEDED") return copy.t("step.done")

  const name = facts.node?.label
  const kind = operation(facts)

  switch (kind) {
    case "import":
      return copy.t("step.import")
    case "save": {
      const path = savedPath(facts)

      if (!path) return copy.t("step.save.unnamed")

      const separator = path.lastIndexOf("/")

      if (separator < 0 || separator === path.length - 1) return copy.t("step.save.path", { path })

      const directory = path.slice(0, separator || 1)

      return copy.t("step.save", {
        name: path.slice(separator + 1),
        directory,
      })
    }

    case "add":
    case "configure":
    case "execute":
    case "read":
      if (name) return copy.t(`step.${kind}`, { name })
      break
    case "export": {
      const name = facts.files?.[0]?.name

      if (name) return copy.t("step.export", { name })
      break
    }
  }

  return copy.t("step.done")
}

export function failureReason(copy: Copy, facts?: Facts) {
  const error = facts?.error

  const message = error?.message.trim().split(/\r?\n/, 1)[0]?.trim()

  const summary =
    message && !message.startsWith("{") && !message.startsWith("[") ? [...message].slice(0, 240).join("") : undefined

  const code = error?.code && /^[A-Z][A-Z0-9_.:-]{0,79}$/.test(error.code) ? error.code : undefined

  return code && summary ? copy.t("failure.codeAndMessage", { code, summary }) : (code ?? summary)
}

export function failureTitle(copy: Copy, facts?: Facts) {
  const action = (() => {
    const kind = operation(facts)

    switch (kind) {
      case "import":
      case "save":
      case "configure":
      case "execute":
      case "export":
      case "read":
        return copy.t(`failure.${kind}`)
      default:
        return copy.t("failure.generic")
    }
  })()

  const reason = failureReason(copy, facts)
  const attempt = facts?.attempt ? copy.t("failure.attempt", { attempt: facts.attempt }) : undefined

  if (reason && attempt) return copy.t("failure.withReasonAndAttempt", { action, reason, attempt })

  if (reason) return copy.t("failure.withReason", { action, reason })

  if (attempt) return copy.t("failure.withAttempt", { action, attempt })

  return action
}

export function stepDetails(copy: Copy, facts?: Facts) {
  if (!facts) return []

  const path = savedPath(facts)

  return [
    ...(facts.node?.label ? [copy.t("field.node", { name: facts.node.label })] : []),
    ...(path ? [copy.t("field.package", { path })] : []),
    ...(facts.ports ?? []).map(({ index, rowCount, columnCount }) =>
      copy.t("field.port", {
        port: index + 1,
        rows: rowCount,
        columns: columnCount,
      }),
    ),
    ...(facts.files ?? []).map((file) => copy.t("field.file", file)),
  ]
}
