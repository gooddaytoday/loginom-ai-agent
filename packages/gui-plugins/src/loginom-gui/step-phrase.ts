import { Option, Schema } from "effect"
import type { Plugin } from "@opencode/plugin/gui"
import type definition from "./index"

type Copy = Pick<Parameters<Plugin.Setup<typeof definition>>[0], "t" | "plural">

const count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

const positive = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))

const text = Schema.NonEmptyString

const Facts = Schema.Struct({
  v: Schema.Literal(1),
  state: Schema.Literals(["running", "settled"]),
  status: Schema.optionalKey(Schema.Literals(["SUCCEEDED", "FAILED", "NOT_APPLIED", "AMBIGUOUS"])),
  kind: Schema.optionalKey(text),
  sourceName: Schema.optionalKey(text),
  nodeCount: Schema.optionalKey(count),
  package: Schema.optionalKey(Schema.Struct({ name: text, directory: text })),
  node: Schema.optionalKey(Schema.Struct({ label: Schema.String, type: text })),
  attempt: Schema.optionalKey(positive),
  maxAttempts: Schema.optionalKey(positive),
  error: Schema.optionalKey(
    Schema.Struct({
      message: text,
      timeoutMs: Schema.optionalKey(positive),
    }),
  ),
  ports: Schema.optionalKey(Schema.Array(Schema.Struct({ index: count, rowCount: count, columnCount: count }))),
  files: Schema.optionalKey(Schema.Array(Schema.Struct({ name: text, bytes: count }))),
})

const Progress = Schema.Struct({
  version: Schema.Literal(1),
  phase: Schema.Literals(["waiting", "configuring", "executing", "reading"]),
  startedAt: count,
  lastReplyAt: Schema.NullOr(count),
  stalledSince: Schema.NullOr(count),
  substep: Schema.NullOr(Schema.Struct({ kind: Schema.Literal("fields"), index: positive, total: positive })),
})

export const decodeFacts = Schema.decodeUnknownOption(Facts)

export const decodeProgress = Schema.decodeUnknownOption(Progress)

type Facts = Option.Option.Value<ReturnType<typeof decodeFacts>>

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
      return facts.sourceName ? copy.t("step.import", { name: facts.sourceName }) : copy.t("step.import.unnamed")
    case "build":
      if (facts.nodeCount) return copy.plural("step.build", facts.nodeCount)
      break
    case "save":
      return facts.package ? copy.t("step.save", facts.package) : copy.t("step.save.unnamed")
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

export function failureTitle(copy: Copy, facts?: Facts) {
  const action = (() => {
    const kind = operation(facts)

    switch (kind) {
      case "import":
      case "build":
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

  const error = facts?.error

  const reason = error?.timeoutMs
    ? copy.t("failure.timeout", { seconds: Math.ceil(error.timeoutMs / 1000) })
    : error?.message

  const attempt = facts?.attempt
    ? facts.maxAttempts && facts.maxAttempts >= facts.attempt
      ? copy.t("failure.attemptOf", { attempt: facts.attempt, total: facts.maxAttempts })
      : copy.t("failure.attempt", { attempt: facts.attempt })
    : undefined

  if (reason && attempt) return copy.t("failure.withReasonAndAttempt", { action, reason, attempt })

  if (reason) return copy.t("failure.withReason", { action, reason })

  if (attempt) return copy.t("failure.withAttempt", { action, attempt })

  return action
}

export function stepDetails(copy: Copy, facts?: Facts, options?: { outputCounts: boolean }) {
  if (!facts) return []

  return [
    ...(facts.sourceName ? [copy.t("field.source", { name: facts.sourceName })] : []),
    ...(facts.node?.label ? [copy.t("field.node", { name: facts.node.label })] : []),
    ...(facts.nodeCount === undefined ? [] : [copy.t("field.nodes", { count: facts.nodeCount })]),
    ...(facts.package ? [copy.t("field.package", facts.package)] : []),
    ...(options?.outputCounts === false ? [] : (facts.ports ?? [])).map(({ index, rowCount, columnCount }) =>
      copy.t("field.port", { port: index + 1, rows: rowCount, columns: columnCount }),
    ),
    ...(facts.files ?? []).map((file) => copy.t("field.file", file)),
  ]
}
