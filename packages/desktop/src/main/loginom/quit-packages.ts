import type { OpenCode } from "@opencode/client"
import { Schema } from "effect"

const Inventory = Schema.Array(
  Schema.Struct({
    sessionID: Schema.String,
    directory: Schema.NullOr(Schema.String),
    state: Schema.NullOr(
      Schema.Struct({
        open: Schema.NullOr(Schema.Boolean),
        path: Schema.NullOr(Schema.String),
        modified: Schema.NullOr(Schema.Boolean),
      }),
    ),
  }),
)

const SaveReply = Schema.Union([
  Schema.Struct({ status: Schema.Literal("clean") }),
  Schema.Struct({
    status: Schema.Literal("saved"),
    lastSave: Schema.Struct({ path: Schema.String, confirmedAt: Schema.Int }),
  }),
])

type Decision = "save" | "discard" | "cancel"
const ClosedReply = Schema.Struct({ status: Schema.Literal("closed") })

export async function confirmPackageQuit(input: {
  rpc: Pick<ReturnType<typeof OpenCode.make>["rpc"], "call">
  ask: (kind: "unsaved" | "unknown", choices: readonly Decision[]) => Promise<Decision>
  failed: (decision: "save" | "discard") => Promise<void>
}) {
  const rpcID = "loginom.package-state"

  const read = () =>
    input.rpc
      .call({ rpcID, method: "active", input: {} }, { signal: AbortSignal.timeout(4000) })
      .then(({ output }) =>
        Schema.decodeUnknownSync(Inventory)(output).filter(
          ({ state }) => state?.open !== false && state?.modified !== false,
        ),
      )
      .catch(() => null)

  const candidates = await read()

  if (candidates?.length === 0) return true

  const uncertain = !candidates || candidates.some(({ state, directory }) => state?.open !== true || state.modified !== true || !directory)
  const decision = uncertain
    ? await input.ask("unknown", ["discard", "cancel"])
    : await input.ask("unsaved", ["save", "discard", "cancel"])

  if (decision === "discard") {
    const results = await Promise.allSettled(
      (candidates ?? []).map(async ({ sessionID, directory, state }) => {
        if (!directory || state?.open !== true || state.modified !== true) return
        const { output } = await input.rpc.call(
          { rpcID, method: "close", location: { directory }, input: { sessionID, path: state.path, decision } },
          { signal: AbortSignal.timeout(110_000) },
        )
        Schema.decodeUnknownSync(ClosedReply)(output)
      }),
    )

    if (results.some((result) => result.status === "rejected")) {
      await input.failed("discard")
      return false
    }

    return true
  }

  if (decision === "cancel" || uncertain) return false

  let saved = 0

  for (const { sessionID, directory, state } of candidates) {
    if (!directory || !state) break

    try {
      const { output } = await input.rpc.call(
        { rpcID, method: "save", location: { directory }, input: { sessionID, path: state.path } },
        { signal: AbortSignal.timeout(58000) },
      )

      const result = Schema.decodeUnknownSync(SaveReply)(output)

      if (
        result.status !== "clean" &&
        (state.path === null ? !result.lastSave.path.endsWith(".lgp") : result.lastSave.path !== state.path)
      )
        break

      saved++
    } catch {
      break
    }
  }

  if (saved === candidates.length && (await read())?.length === 0) return true

  await input.failed("save")

  return false
}
