import { decodeLoginomMetadata, type LoginomMetadata } from "@loginom-ai-agent/loginom-agent/loginom-metadata"
import { Option, Schema } from "effect"
import type { Plugin } from "@opencode/plugin/gui"
import { getDirectory, getFilename } from "@opencode/util/path"
import type definition from "./index"

type Copy = Pick<Parameters<Plugin.Setup<typeof definition>>[0], "t">

const count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

const positive = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))

const Progress = Schema.Struct({
  version: Schema.Literal(1),
  phase: Schema.Literals(["waiting", "configuring", "executing", "reading"]),
  startedAt: count,
  lastReplyAt: Schema.NullOr(count),
  stalledSince: Schema.NullOr(count),
  substep: Schema.NullOr(Schema.Struct({ kind: Schema.Literal("fields"), index: positive, total: positive })),
})

export const decodeFacts = Option.liftNullishOr(decodeLoginomMetadata)

export const decodeProgress = Schema.decodeUnknownOption(Progress)

type Facts = LoginomMetadata

function savedPackage(facts: Facts) {
  const saved = facts.evidence?.find((item) => item.kind === "saved")

  if (!saved) return

  return { name: getFilename(saved.path), directory: getDirectory(saved.path).replace(/\/$/, "") || "/" }
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
      return copy.t("step.import.unnamed")
    case "save": {
      const saved = savedPackage(facts)

      return saved?.name ? copy.t("step.save", saved) : copy.t("step.save.unnamed")
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

  const reason = facts?.error?.message
  const attempt = facts?.attempt ? copy.t("failure.attempt", { attempt: facts.attempt }) : undefined

  if (reason && attempt) return copy.t("failure.withReasonAndAttempt", { action, reason, attempt })

  if (reason) return copy.t("failure.withReason", { action, reason })

  if (attempt) return copy.t("failure.withAttempt", { action, attempt })

  return action
}

export function stepDetails(copy: Copy, facts?: Facts) {
  if (!facts) return []

  const saved = savedPackage(facts)

  return [
    ...(facts.node?.label ? [copy.t("field.node", { name: facts.node.label })] : []),
    ...(saved?.name ? [copy.t("field.package", saved)] : []),
    ...(facts.ports ?? []).map(({ index, rowCount, columnCount }) =>
      copy.t("field.port", { port: index + 1, rows: rowCount, columns: columnCount }),
    ),
    ...(facts.files ?? []).map((file) => copy.t("field.file", file)),
  ]
}
