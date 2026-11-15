import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import test from "node:test"
import { createEventLog } from "../../src/log.ts"

test("each role reports suppression when the next logging window opens", () => {
  let now = 0
  const lines = []
  const web = createEventLog("web", line => lines.push(JSON.parse(line)), () => now)
  const publisher = createEventLog("publisher", line => lines.push(JSON.parse(line)), () => now)
  for (let i = 0; i < 65; i++) web("request_rejected", { code: "host" })
  assert.equal(lines.length, 60)
  publisher("publication_pending")
  assert.equal(lines.at(-1).role, "publisher")
  now = 59_999
  web("request_rejected", { code: "host" })
  assert.equal(lines.length, 61)
  now = 60_000
  web("request_rejected", { code: "origin" })
  assert.equal(lines.length, 63)
  assert.deepEqual(lines.slice(-2), [
    { timestamp: new Date(now).toISOString(), role: "web", event: "events_suppressed", count: 6 },
    { timestamp: new Date(now).toISOString(), role: "web", event: "request_rejected", code: "origin" },
  ])
})

test("event lines remain valid JSON within 8 KiB, including UTF-8 and escaped fields", () => {
  const lines = []
  const log = createEventLog("publisher", line => lines.push(line))
  const long = "\0ø😀".repeat(4_096)
  const key = "a".repeat(64)
  log("build_ready", {
    code: long, key, sourceHash: long, buildHash: long, builderImage: long, directive: long,
    publication: `user/synthetic/${long}`, template: 1, unlisted: "synthetic-unlisted-field",
  })
  assert.equal(lines.length, 1)
  assert.ok(Buffer.byteLength(lines[0]) <= 8_192)
  const event = JSON.parse(lines[0])
  assert.equal(event.event, "build_ready")
  assert.equal(event.key, key)
  assert.equal(event.template, 1)
  assert.ok(event.publication.startsWith("user/synthetic/"))
  assert.equal(event.unlisted, undefined)
})

test("a sink exception counts as a dropped event and the logger keeps working", () => {
  let now = 0
  const lines = []
  const log = createEventLog("publisher", line => {
    if (now === 0) throw new Error("synthetic sink failure")
    lines.push(JSON.parse(line))
  }, () => now)
  log("build_started")
  now = 60_000
  log("build_ready")
  assert.deepEqual(lines.map(line => line.event), ["events_suppressed", "build_ready"])
  assert.equal(lines[0].count, 1)
})

test("the stdout sink counts events dropped across full logging windows without queueing them", () => {
  const logUrl = new URL("../../src/log.ts", import.meta.url)
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    import assert from "node:assert/strict"
    import { once } from "node:events"
    import { createEventLog } from ${JSON.stringify(logUrl.href)}
    let now = 0
    const log = createEventLog("web", undefined, () => now)
    process.stdout.write(Buffer.alloc(1_048_576))
    assert.ok(process.stdout.writableNeedDrain)
    const buffered = process.stdout.writableLength
    log("request_rejected", { code: "host" })
    log("request_rejected", { code: "origin" })
    now = 60_000
    log("request_failed")
    assert.equal(process.stdout.writableLength, buffered)
    await once(process.stdout, "drain")
    now = 120_000
    log("request_rejected", { code: "host" })
  `], { encoding: "utf8", maxBuffer: 2_097_152, timeout: 5_000 })
  assert.ifError(child.error)
  assert.equal(child.status, 0, child.stderr)
  const timestamp = new Date(120_000).toISOString()
  assert.deepEqual(child.stdout.slice(1_048_576).trimEnd().split("\n").map(line => JSON.parse(line)), [
    { timestamp, role: "web", event: "events_suppressed", count: 3 },
    { timestamp, role: "web", event: "request_rejected", code: "host" },
  ])
})
