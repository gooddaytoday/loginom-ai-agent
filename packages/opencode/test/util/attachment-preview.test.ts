import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import path from "path"
import { attachmentContext, attachmentPreview } from "../../src/util/attachment-preview"
import { FSUtil } from "@loginom-ai-agent/core/fs-util"
import { LayerNode } from "@loginom-ai-agent/core/effect/layer-node"
import { Effect } from "effect"
import { Truncate } from "@/tool/truncate"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([Truncate.node, FSUtil.node])))

function snapshotPath(context: string) {
  const snapshot = context.match(/^Full attachment snapshot saved to: (.+)$/m)?.[1]
  if (!snapshot) throw new Error("missing attachment snapshot path")
  return snapshot
}

test("small attachments retain their exact model text", () => {
  expect(attachmentPreview("amount\n10\n20\n")).toBe("amount\n10\n20\n")
})

test("previews enforce Read line, UTF-8 byte, and individual line limits", () => {
  for (const text of ["row\n".repeat(3000), ("я".repeat(1000) + "\n").repeat(100), "x".repeat(100000)]) {
    const preview = attachmentPreview(text + "HIDDEN_END")
    expect(Buffer.byteLength(preview)).toBeLessThan(51 * 1024)
    expect(preview.split("\n").length).toBeLessThanOrEqual(2002)
    expect(preview).toContain("preview truncated")
    expect(preview).not.toContain("HIDDEN_END")
  }
})

it.live("refreshes existing inline snapshots without rewriting their content before retention cleanup", () =>
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const truncate = yield* Truncate.Service
    const content = "retention-source\n" + "row\n".repeat(2100) + "retention-tail"
    const snapshot = snapshotPath(yield* attachmentContext(content))
    const retained = "Existing cached bytes must not be rewritten"
    yield* fs.writeFileString(snapshot, retained)
    const expired = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
    yield* fs.utimes(snapshot, expired, expired)
    expect(snapshotPath(yield* attachmentContext(content))).toBe(snapshot)
    yield* truncate.cleanup()
    expect(yield* fs.exists(snapshot)).toBe(true)
    expect(Buffer.from(yield* fs.readFile(snapshot)).toString("utf8")).toBe(retained)
    yield* fs.remove(snapshot)
  }),
)

it.live("names oversized attachment snapshots with a sha256 of the full text", () =>
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const content = "hash-source\n" + "row\n".repeat(2100)
    const snapshot = snapshotPath(yield* attachmentContext(content))
    const expected = createHash("sha256").update(content).digest("hex")
    expect(path.basename(snapshot)).toBe(`tool_attachment_${expected}`)
    yield* fs.remove(snapshot)
  }),
)

// A Node subprocess cannot import this module: server sources use the @/ alias.
// Scanning those sources is what fails when a Bun API returns to the Desktop sidecar.
test("server sources do not call Bun APIs outside the CLI", () => {
  const root = path.join(import.meta.dir, "../../src")
  const hits: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === "cli" && path.resolve(dir) === path.resolve(root)) continue
        walk(full)
        continue
      }
      if (!entry.name.endsWith(".ts")) continue
      readFileSync(full, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (/\bBun\./.test(line) && !line.includes("typeof Bun")) hits.push(`${path.relative(root, full)}:${index + 1}`)
        })
    }
  }
  walk(root)
  expect(hits).toEqual([])
})

it.live("publishes concurrent inline snapshots only after their full bytes are available", () =>
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const content = "atomic-source\n" + "0123456789abcdef".repeat(262144) + "ATOMIC_REQUIRED_END"
    const snapshot = snapshotPath(yield* attachmentContext(content))
    yield* fs.remove(snapshot)
    const paths = yield* Effect.forEach(
      Array.from({ length: 8 }),
      () =>
        Effect.gen(function* () {
          const context = yield* attachmentContext(content)
          const file = snapshotPath(context)
          expect(Buffer.from(yield* fs.readFile(file)).equals(Buffer.from(content))).toBe(true)
          return file
        }),
      { concurrency: "unbounded" },
    )
    expect(new Set(paths).size).toBe(1)
    yield* fs.remove(snapshot)
  }),
)
