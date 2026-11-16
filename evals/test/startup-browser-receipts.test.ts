import { afterEach, expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { writeLeaseReceipt } from "../src/lease"
import { readStartupManagement } from "../src/startup-reconciliation"

const roots: string[] = []
const producerPid = 424242
const processes = () => ({ status: "confirmed", capture_complete: true, unknownProcesses: [],
  lifetime: { producer_pid: producerPid, owner: { kind: "admin", id: "browser-readiness" } } })
async function fixture() {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "startup-browser-receipt-"))
  roots.push(stateDir)
  const input = { stateDir, commandId: "native-command", slotId: "slot-a", producerPid }
  const directory = path.join(stateDir, "management-native-command-slot-a", `browser-${crypto.randomUUID()}`)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  return { input, directory }
}
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })

test("startup browser receipt: actual native wrapper coexists with ordinary management cleanup", async () => {
  const { input, directory } = await fixture()
  const ordinary = path.join(path.dirname(directory), "1794573225273-2aa3c053-2696-42a9-8587-ad4f11af13a6")
  await mkdir(ordinary, { mode: 0o700 })
  await writeLeaseReceipt(path.join(ordinary, "cleanup.json"), { processes: processes() })
  await writeLeaseReceipt(path.join(directory, "browser-readiness.json"), { ready: true, exitCode: 0, timedOut: false, sandboxError: null, processes: processes() })
  expect(await readStartupManagement(input)).toMatchObject({ status: "confirmed", lifetime: { producer_pid: producerPid } })
  expect(await Bun.file(path.join(directory, "cleanup.json")).exists()).toBe(false)
})

test("startup browser receipt: failed readiness can still prove cleanup before a new readiness check", async () => {
  const { input, directory } = await fixture()
  await writeLeaseReceipt(path.join(directory, "browser-readiness.json"), { ready: false, exitCode: 1, processes: processes() })
  expect((await readStartupManagement(input))?.status).toBe("confirmed")
})

test.each([
  { name: "failed cleanup", patch: { status: "failed" } },
  { name: "incomplete capture", patch: { capture_complete: false } },
  { name: "unknown process", patch: { unknownProcesses: [{ pid: 123 }] } },
  { name: "wrong producer", patch: { lifetime: { producer_pid: producerPid + 1, owner: { kind: "admin", id: "browser-readiness" } } } },
])("startup browser receipt: $name cannot authorize cleanup", async value => {
  const { input, directory } = await fixture()
  await writeLeaseReceipt(path.join(directory, "browser-readiness.json"), { ready: true, processes: { ...processes(), ...value.patch } })
  await expect(readStartupManagement(input)).rejects.toThrow("STARTUP_PROCESS_CLEANUP_UNCONFIRMED")
})

test("startup browser receipt: foreign owner cannot borrow the browser path", async () => {
  const { input, directory } = await fixture()
  await writeLeaseReceipt(path.join(directory, "browser-readiness.json"), { ready: true,
    processes: { ...processes(), lifetime: { producer_pid: producerPid, owner: { kind: "command", id: "other-profile" } } } })
  await expect(readStartupManagement(input)).rejects.toThrow("STARTUP_BROWSER_OWNERSHIP_UNCONFIRMED")
})

test("startup browser receipt: raw process record cannot replace the native wrapper", async () => {
  const { input, directory } = await fixture()
  await writeLeaseReceipt(path.join(directory, "process-cleanup.json"), processes())
  await expect(readStartupManagement(input)).rejects.toThrow()
})
