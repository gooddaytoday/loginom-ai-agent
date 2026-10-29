import { expect, test } from "bun:test"
import { assertWitnessHost, digest, parseRootPolicy, parseRootWitness } from "../src/root-terminality-policy"
import { validateRootTerminality } from "../src/root-terminality"

test("JSON assertions never manufacture a native terminality proof", async () => {
  await expect(validateRootTerminality({ kind: "root-terminality" } as never, {} as never, {} as never)).rejects.toThrow("ROOT_TERMINALITY_UNTRUSTED")
})

test("strict root documents reject malformed scope and unbounded counter assertions", () => {
  for (const value of [null, {}, { version: 1, commandId: "not-a-command" }]) expect(() => parseRootPolicy(value)).toThrow("ROOT_POLICY_INVALID")
  const value = { version: 1, kind: "root-terminality", policySha256: "a".repeat(64), invocation: "b".repeat(32),
    observer: { pid: 123, starttime: "100" }, counter: "9007199254740993", counterAfter: "9007199254740993", elapsedMs: 20, groups: 5 }
  expect(parseRootWitness(value).counter).toBe("9007199254740993")
  for (const patch of [{ counter: "9223372036854775808" }, { counter: 1 }, { counterAfter: "9007199254740994" }, { elapsedMs: 1001 }, { elapsedMs: -1 },
    { extra: true }, { observer: { pid: 123, starttime: "100", ancestor: true } }])
    expect(() => parseRootWitness({ ...value, ...patch })).toThrow("ROOT_WITNESS_INVALID")
})

import { publishRootTerminality } from "../src/root-terminality-publisher"
import { rootTerminalityForSlot } from "../src/root-terminality"
import { cleanupSlotStorage } from "../src/slot-storage"

test.skipIf(process.getuid?.() === 0)("unprivileged caller cannot invoke the publisher", async () => {
  await expect(publishRootTerminality(crypto.randomUUID())).rejects.toThrow("ROOT_PUBLISHER_REQUIRED")
})
test("forged recovery cannot mint a proof", async () => {
  await expect(rootTerminalityForSlot({ commandId: crypto.randomUUID() }, {} as never, {} as never)).rejects.toThrow("ROOT_TERMINALITY_UNTRUSTED")
})
test("native destructive consumer rejects JSON terminality before any cleanup effect", async () => {
  const proof = { version: 1, kind: "root-terminality", commandId: crypto.randomUUID(), slotId: "a", witnessSha256: "a".repeat(64) } as const
  for (const [prefixes, attempts, startup] of [[[], [], false], [["measurement"], [], true], [[], ["/measurement"], false]] as const)
    await expect(cleanupSlotStorage({} as never, {} as never, {} as never, {} as never, proof, [...prefixes], [...attempts], undefined, startup))
      .rejects.toThrow(startup ? "STARTUP_ARCHIVE_SCOPE" : "ROOT_TERMINALITY_SCOPE")
  await expect(cleanupSlotStorage({} as never, {} as never, {} as never, {} as never, proof, [], [], undefined, true))
    .rejects.toThrow("ROOT_TERMINALITY_UNTRUSTED")
})

import { mkdtempSync, rmSync, writeFileSync, readFileSync, readlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { captureWitnessSource } from "../src/witness-source"
import { assertStandalonePolicy } from "../src/root-terminality-policy"

test.skipIf(process.platform !== "linux")("native user checks its own host anchors without requiring access to root PID1", () => {
  const policy = { owner: { bootId: readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim() }, host: {
    pid: readlinkSync("/proc/self/ns/pid"), mnt: readlinkSync("/proc/self/ns/mnt"), time: readlinkSync("/proc/self/ns/time"),
    user: readlinkSync("/proc/self/ns/user"), kernelNotes: digest(readFileSync("/sys/kernel/notes")),
  } }
  expect(() => assertWitnessHost(policy as never)).not.toThrow()
  expect(() => assertWitnessHost({ ...policy, host: { ...policy.host, mnt: "mnt:[0]" } } as never)).toThrow("ROOT_WITNESS_HOST")
})

test("exact standalone quarantine is eligible; changed source or admitted command is refused with original bytes intact", () => {
  const root = mkdtempSync(path.join(tmpdir(), "root-policy-")), uid = process.getuid!()
  const commandId = crypto.randomUUID(), owner = { bootId: crypto.randomUUID(), pid: 123, starttime: "100", uid }
  const identity = { containerId: "test-container" }, journal = path.join(root, "command.json")
  const write = (name: string, value: object) => { const file = path.join(root, name); writeFileSync(file, JSON.stringify(value), { mode: 0o600 }); return captureWitnessSource(file, uid) }
  const command = { version: 2, kind: "unactivated-preparation", phase: "unactivated", commandId, identity, slotIds: ["a"] }
  try {
    const binding = write("command.json", command)
    const failed = write(`preparation-${commandId}.json`, { commandId, journal, identity, status: "quarantined", ready: false })
    const server = write("server.json", { key: "server:test-container", state: "retained", commandId, journal, identity, owner })
    const slots = write("slots.json", {}), composite = write("composite.json", {}), reservation = write("profile.json", {})
    const policy = parseRootPolicy({ version: 1, commandId, source: "a".repeat(40), qualification: "b".repeat(64), owner,
      host: { pid: "pid:[1]", mnt: "mnt:[2]", time: "time:[3]", user: "user:[4]", kernelNotes: "c".repeat(64) },
      controllerLock: write("lock", {}), ownerFile: path.join(root, "owner.json"), slotsFile: slots.file, binary: "/bin/unused", cliSha256: "d".repeat(64),
      stateDir: root, batchUnit: "unused-batch.service", campaignUnit: "unused-campaign.service", fixed: [binding, failed, slots], server,
      slots: [{ id: "a", profile: path.join(root, "profile"), composite, reservation, registration: null, receipts: [] }],
      observer: { unit: "unused-observer.service", binary: "/unused/bun", binarySha256: "a".repeat(64), bundle: "/unused/bundle", bundleSha256: "a".repeat(64) } })
    expect(() => assertStandalonePolicy(policy)).not.toThrow()
    const original = readFileSync(failed.file)
    for (const patch of [{ runDir: "/measurement" }, { unitBinding: {} }, { attempts: [{}] }, { phase: "cli_admitted" }, { commandId: crypto.randomUUID() }]) {
      const changed = write("command.json", { ...command, ...patch })
      expect(() => assertStandalonePolicy(policy)).toThrow("WITNESS_SOURCE_CHANGED")
      expect(() => assertStandalonePolicy({ ...policy, fixed: [changed, failed, slots] })).toThrow("ROOT_RECOVERY_SCOPE")
    }
    expect(readFileSync(failed.file)).toEqual(original)
    expect(() => parseRootPolicy({ ...policy, slots: [...policy.slots, ...policy.slots] })).toThrow("ROOT_POLICY_INVALID")
  } finally { rmSync(root, { recursive: true, force: true }) }
})

import { existsSync, lstatSync, mkdirSync, readdirSync } from "node:fs"
import { publishWitnessFile } from "../src/root-terminality-publisher"
import { witnessRoot } from "../src/root-terminality-policy"
import { readRootWitnessFile } from "../src/root-witness-file"

test.skipIf(process.getuid?.() !== 0)("root publication is durable, read-only and refuses replacement of the final witness", () => {
  // Deliberately not a UUID basename: the native consumer cannot address this fixture.
  const name = `test-${crypto.randomUUID()}.json`, file = path.join(witnessRoot, name)
  mkdirSync(witnessRoot, { recursive: true, mode: 0o755 })
  const proof = parseRootWitness({ version: 1, kind: "root-terminality", policySha256: "a".repeat(64), invocation: "b".repeat(32),
    observer: { pid: 123, starttime: "100" }, counter: "10", counterAfter: "10", elapsedMs: 1, groups: 1 })
  try {
    publishWitnessFile(file, proof)
    const before = readRootWitnessFile(file, 65536)
    expect(JSON.parse(before.toString())).toEqual(proof)
    expect(lstatSync(file).mode & 0o777).toBe(0o444)
    expect(lstatSync(file).nlink).toBe(1)
    expect(() => publishWitnessFile(file, { ...proof, counter: "11", counterAfter: "11" })).toThrow("ROOT_WITNESS_PUBLICATION_REFUSED")
    expect(readRootWitnessFile(file, 65536)).toEqual(before)
  } finally {
    if (existsSync(file)) rmSync(file)
    for (const entry of readdirSync(witnessRoot)) if (entry.startsWith(`.${name}.`) && entry.endsWith(".tmp")) rmSync(path.join(witnessRoot, entry))
  }
})
