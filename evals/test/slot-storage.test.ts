import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { chmod, mkdir, mkdtemp, readdir, rm, stat, symlink } from "node:fs/promises"
import { cleanupSlotStorage, readDeliveredStorage, requireServerFilesClosed } from "../src/slot-storage"
import { acquireEnvironmentLeases } from "../src/slots"
import { writeLeaseReceipt } from "../src/lease"
import { parallelFixture } from "./helpers/parallel-fixture"

test("slot deletion refuses unconfirmed or unknown processes before native calls and preserves files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-slot-delete-guard-")), fixture = await parallelFixture(root)
  const identity = { containerId: "a".repeat(64), startedAt: "2026-10-13T10:00:00Z", serverEpoch: "b".repeat(64),
    studioContainerId: "c".repeat(64), studioStartedAt: "2026-10-13T10:00:00Z", configurationHash: "d".repeat(64) }
  const journal = path.join(fixture.slots.controller.stateDir, "command.json")
  await writeLeaseReceipt(journal, { commandId: "cleanup-guard" })
  const environment = await acquireEnvironmentLeases(fixture.slots, 1, identity, journal, fixture.lockRoot)
  const canary = path.join(fixture.slots.slots[0]!.workspaceRoot, "canary")
  await Bun.write(canary, "preserve")
  const process = { pid: 123, starttime: "1", uid: 1001, parent: 1, group: 1, session: 1, executable: "/unknown", device: 1, inode: 1 }
  try {
    for (const processes of [{ status: "failed" as const, unknownProcesses: [] }, { status: "confirmed" as const, unknownProcesses: [process] }]) {
      await expect(cleanupSlotStorage(fixture.slots, environment.server, environment.slots[0]!, {
        identity,
        async inspectSessionInventory() { throw Error("Native must not be called") },
        async closeUserSession() { throw Error("Native must not be called") },
      }, { ...processes, processes: [], runtimeDirectories: [], writer: null, error: null, capture_complete: true }, ["eval-owned"]))
        .rejects.toThrow("SLOT_PROCESS_CLEANUP_UNCONFIRMED")
      expect(await Bun.file(canary).text()).toBe("preserve")
    }
  } finally { await Promise.all([environment.server.close(), ...environment.slots.map(lease => lease.close())]); await rm(root, { recursive: true }) }
})

test("direct server scan refuses missing coverage and own open files or mappings, but permits peer files", () => {
  const root = "/workdir/UserStorage/eval-a"
  const observed = { complete: true, files: [{ target: "/workdir/UserStorage/eval-b/keep.lgp" }], processes: [{ maps: "" }] }
  expect(() => requireServerFilesClosed(observed, root)).not.toThrow()
  expect(() => requireServerFilesClosed({ ...observed, complete: false }, root)).toThrow("SERVER_FILE_SCAN_UNCONFIRMED")
  expect(() => requireServerFilesClosed({ ...observed, files: [{ target: root + "/busy.lgp (deleted)" }] }, root))
    .toThrow("SLOT_SERVER_FILES_ACTIVE")
  expect(() => requireServerFilesClosed({ ...observed, processes: [{ maps: `1000-2000 r--p 00000000 00:01 2 ${root}/mapped.lgp` }] }, root))
    .toThrow("SLOT_SERVER_MAPPINGS_ACTIVE")
})

test("backup guard reads only: nonempty, unreadable and symlink directories refuse without changes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-backup-guard-"))
  const script = path.resolve(import.meta.dir, "../fixtures/empty-session-backup.sh")
  const check = async (target: string) => {
    const child = Bun.spawn(["sh", script, target], { env: { PATH: "/usr/bin:/bin" }, stdout: "pipe", stderr: "pipe" })
    const result = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect(result[1]).toBe("")
    return result[0]
  }
  try {
    await mkdir(path.join(root, "backup"))
    expect(await check(path.join(root, "backup"))).toBe(0)
    await Bun.write(path.join(root, "backup/canary"), "preserve")
    expect(await check(path.join(root, "backup"))).not.toBe(0)
    expect(await Bun.file(path.join(root, "backup/canary")).text()).toBe("preserve")
    await chmod(path.join(root, "backup"), 0)
    expect(await check(path.join(root, "backup"))).not.toBe(0)
    await chmod(path.join(root, "backup"), 0o700)
    await symlink(path.join(root, "backup"), path.join(root, "alias"))
    expect(await check(path.join(root, "alias"))).not.toBe(0)
    expect(await check(path.join(root, "missing"))).not.toBe(0)
    expect(await readdir(path.join(root, "backup"))).toEqual(["canary"])
  } finally { await chmod(path.join(root, "backup"), 0o700).catch(() => {}); await rm(root, { recursive: true }) }
})

test("own-root deletion validates every namespace before changing any file and preserves the root", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-own-delete-"))
  const script = path.resolve(import.meta.dir, "../fixtures/cleanup-slot-storage.sh")
  const before = await stat(root)
  const identity = `${before.dev} ${before.ino} ${before.uid} ${before.gid}`
  const check = async (expected = identity, prefixes = ["eval-own-run"]) => {
    const child = Bun.spawn(["sh", script, root, expected, String(prefixes.length), ...prefixes], { env: { PATH: "/usr/bin:/bin" }, stdout: "pipe", stderr: "pipe" })
    return (await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]))[0]
  }
  try {
    await Bun.write(path.join(root, "eval-own-run.lgp"), "own")
    await Bun.write(path.join(root, "foreign-canary"), "keep")
    expect(await check()).not.toBe(0)
    expect(await Bun.file(path.join(root, "eval-own-run.lgp")).text()).toBe("own")
    expect(await Bun.file(path.join(root, "foreign-canary")).text()).toBe("keep")
    await rm(path.join(root, "foreign-canary"))
    expect(await check("wrong identity")).not.toBe(0)
    expect(await check(identity, ["eval-*"])).not.toBe(0)
    expect(await Bun.file(path.join(root, "eval-own-run.lgp")).text()).toBe("own")
    expect(await check()).toBe(0)
    expect(await readdir(root)).toEqual([])
    expect((await stat(root)).ino).toBe(before.ino)
  } finally { await rm(root, { recursive: true }) }
})

test("own-root deletion accepts a delivered input only by its exact name, size and hash", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-delivered-delete-"))
  const script = path.resolve(import.meta.dir, "../fixtures/cleanup-slot-storage.sh")
  const before = await stat(root), content = "Amount\n10\n20\n", name = "a".repeat(64) + "-0-amounts.csv"
  const hash = new Bun.CryptoHasher("sha256").update(content).digest("hex")
  try {
    await Bun.write(path.join(root, "eval-own-run.lgp"), "package")
    await Bun.write(path.join(root, name), content)
    const child = Bun.spawn(["sh", script, root, `${before.dev} ${before.ino} ${before.uid} ${before.gid}`,
      "1", "eval-own-run", hash, String(Buffer.byteLength(content)), name], { stdout: "pipe", stderr: "pipe" })
    expect((await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]))[0]).toBe(0)
    expect(await readdir(root)).toEqual([])
    expect((await stat(root)).ino).toBe(before.ino)
  } finally { await rm(root, { recursive: true }) }
})

test("delivered storage comes from a successful final tool receipt in the slot username", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-delivery-receipt-"))
  const output = { result_version: "user-v1", state: "settled", status: "SUCCEEDED", cleanup_complete: true,
    output: { status: "SUCCEEDED", destination: "/eval-a/input.csv", bytes: 13, sha256: "a".repeat(64),
      upload_completion_verified: true, cleanup_complete: true } }
  try {
    await Bun.write(path.join(root, "events.jsonl"), JSON.stringify({ type: "tool_use", part: { type: "tool",
      tool: "loginom_dock_artifact_deliver", state: { status: "completed", output: JSON.stringify(output) } } }) + "\n")
    expect(await readDeliveredStorage([root], "eval-a")).toEqual([{ name: "input.csv", bytes: 13, sha256: "a".repeat(64) }])
    expect(await readDeliveredStorage([root], "eval-b")).toEqual([])
  } finally { await rm(root, { recursive: true }) }
})

test("unreceipted or changed uploads preserve every child before deletion", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-delivery-delete-refusal-"))
  const script = path.resolve(import.meta.dir, "../fixtures/cleanup-slot-storage.sh")
  const before = await stat(root), content = "Amount\n10\n20\n", hash = new Bun.CryptoHasher("sha256").update(content).digest("hex")
  const check = async (claims: string[]) => {
    const child = Bun.spawn(["sh", script, root, `${before.dev} ${before.ino} ${before.uid} ${before.gid}`,
      "1", "eval-own-run", ...claims], { stdout: "pipe", stderr: "pipe" })
    return (await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]))[0]
  }
  try {
    await Bun.write(path.join(root, "eval-own-run.lgp"), "package")
    await Bun.write(path.join(root, "input.csv"), content)
    for (const claims of [[], ["b".repeat(64), "13", "input.csv"], [hash, "14", "input.csv"], [hash, "13", "../input.csv"]]) {
      expect(await check(claims)).not.toBe(0)
      expect(await Bun.file(path.join(root, "eval-own-run.lgp")).text()).toBe("package")
      expect(await Bun.file(path.join(root, "input.csv")).text()).toBe(content)
    }
    await Bun.write(path.join(root, "foreign-canary"), "keep")
    expect(await check([hash, "13", "input.csv"])).not.toBe(0)
    expect(await Bun.file(path.join(root, "input.csv")).text()).toBe(content)
    expect(await Bun.file(path.join(root, "eval-own-run.lgp")).text()).toBe("package")
    expect(await Bun.file(path.join(root, "foreign-canary")).text()).toBe("keep")
    await rm(path.join(root, "foreign-canary"))
    await rm(path.join(root, "input.csv"))
    await symlink(path.join(root, "eval-own-run.lgp"), path.join(root, "input.csv"))
    expect(await check([hash, "13", "input.csv"])).not.toBe(0)
    expect(await Bun.file(path.join(root, "eval-own-run.lgp")).text()).toBe("package")
  } finally { await rm(root, { recursive: true }) }
})

test("delivery cleanup does not claim incomplete, failed, unrelated or escaping receipts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-delivery-invalid-"))
  const receipt = { state: "settled", status: "SUCCEEDED", cleanup_complete: true,
    output: { status: "SUCCEEDED", destination: "/eval-a/input.csv", bytes: 13, sha256: "a".repeat(64),
      upload_completion_verified: true, cleanup_complete: true } }
  const event = (output: unknown, tool = "loginom_dock_artifact_deliver", status = "completed") => ({
    type: "tool_use", part: { tool, state: { status, output: JSON.stringify(output) } },
  })
  try {
    for (const invalid of [event({ ...receipt, state: "running" }), event({ ...receipt, status: "FAILED" }),
      event({ ...receipt, output: { ...receipt.output, upload_completion_verified: false } }),
      event({ ...receipt, output: { ...receipt.output, destination: "/eval-a/../eval-b/input.csv" } }),
      event({ ...receipt, output: { ...receipt.output, bytes: -1 } }),
      event({ ...receipt, output: { ...receipt.output, sha256: "bad" } }), event(receipt, "read"),
      event(receipt, "loginom_dock_artifact_deliver", "error")]) {
      await Bun.write(path.join(root, "events.jsonl"), JSON.stringify(invalid) + "\n")
      expect(await readDeliveredStorage([root], "eval-a")).toEqual([])
    }
    expect(await readDeliveredStorage([path.join(root, "missing")], "eval-a")).toEqual([])
    await Bun.write(path.join(root, "events.jsonl"), "{truncated")
    await expect(readDeliveredStorage([root], "eval-a")).rejects.toThrow()
  } finally { await rm(root, { recursive: true }) }
})
