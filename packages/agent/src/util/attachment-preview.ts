import { FSUtil } from "@loginom-ai-agent/core/fs-util"
import { DateTime, Effect } from "effect"
import path from "path"
import { TRUNCATION_DIR, TRUNCATION_LOCK } from "@/tool/truncation-dir"
import { ToolID } from "@/tool/schema"

// The original snapshot is retained separately for Dock admission. Only this
// bounded preview goes into model text, using Read's line and byte limits.
export function attachmentPreview(text: string) {
  const lines = text.split("\n")
  const result: string[] = []
  let bytes = 0
  let truncated = false
  for (const original of lines) {
    const line = original.length > 2000 ? original.slice(0, 2000) + "... (line truncated to 2000 chars)" : original
    const size = Buffer.byteLength(line, "utf8") + (result.length ? 1 : 0)
    if (result.length === 2000 || bytes + size > 50 * 1024) {
      truncated = true
      break
    }
    result.push(line)
    bytes += size
    if (line !== original) truncated = true
  }
  return result.join("\n") + (truncated ? "\n\n[Attachment preview truncated; full snapshot retained for Dock.]" : "")
}

export const attachmentContext = Effect.fn("Attachment.context")(function* (text: string) {
  const preview = attachmentPreview(text)
  if (preview === text) return preview

  const fs = yield* FSUtil.Service
  const snapshot = path.join(
    TRUNCATION_DIR,
    `tool_attachment_${new Bun.CryptoHasher("sha256").update(text).digest("hex")}`,
  )
  yield* TRUNCATION_LOCK.withPermit(
    Effect.gen(function* () {
      if (!(yield* fs.exists(snapshot).pipe(Effect.orDie))) {
        yield* fs.ensureDir(TRUNCATION_DIR).pipe(Effect.orDie)
        // Publish complete bytes atomically without replacing another concurrent writer's snapshot.
        yield* Effect.acquireUseRelease(
          Effect.succeed(path.join(TRUNCATION_DIR, ToolID.ascending())),
          (pending) =>
            Effect.gen(function* () {
              yield* fs.writeFileString(pending, text, { flag: "wx" })
              yield* fs.link(pending, snapshot).pipe(
                Effect.catchIf(
                  (error) => error.reason._tag === "AlreadyExists",
                  () => Effect.void,
                ),
              )
            }),
          (pending) => fs.remove(pending, { force: true }).pipe(Effect.orDie),
        ).pipe(Effect.orDie)
      }
      const now = yield* DateTime.nowAsDate
      yield* fs.utimes(snapshot, now, now).pipe(Effect.orDie)
    }),
  )
  return `Full attachment snapshot saved to: ${snapshot}\nUse Grep to search the full content or Read with offset/limit to view specific sections.\n\n${preview}`
})
