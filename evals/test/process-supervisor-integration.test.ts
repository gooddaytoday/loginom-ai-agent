import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdir, mkdtemp, readFile, readlink, rm, writeFile } from "node:fs/promises"
import { readLeaseReceipt, writeLeaseReceipt } from "../src/lease"
import { verifyAdminRuntime } from "../src/preflight"
import { signalProcess, superviseProcess, type ProcessOwner } from "../src/process-supervisor"

test.skipIf(!process.env.EVAL_PROCESS_CANDIDATE_RECEIPT)("installed browser: trusted Node-owned Chromium exits with confirmed ownership without auth", async () => {
  const receipt = await readLeaseReceipt(process.env.EVAL_PROCESS_CANDIDATE_RECEIPT!) as { binary: string; manifestSha256: string }
  const runtime = await verifyAdminRuntime(receipt.binary)
  expect(runtime.manifestHash).toBe(receipt.manifestSha256)
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-native-process-"))
  const profile = path.join(root, "profile")
  await mkdir(profile, { mode: 0o700 })
  const input = new TransformStream<Uint8Array, Uint8Array>()
  const writer = input.writable.getWriter()
  const ready = Promise.withResolvers<void>()
  const abort = new AbortController()
  const pending = superviseProcess({ cmd: [runtime.node, path.resolve(import.meta.dir, "../fixtures/native-browser-probe.mjs"),
    runtime.resources, path.join(profile, "loginom/runtime/probe/attempts/context/browser-profile"), path.join(root, "heartbeat")],
    cwd: root, env: { PATH: "/usr/bin:/bin", HOME: root, LANG: "C.UTF-8", LOGINOM_AI_AGENT_CLI_BUNDLE: runtime.resources },
    profileDir: profile, outDir: root, stdin: input.readable,
    stdout: new WritableStream<Uint8Array>({ write(chunk) { if (new TextDecoder().decode(chunk).includes("ready")) ready.resolve() } }),
    timeoutMs: 15_000, signal: abort.signal, owner: { kind: "admin", id: "nonmodel-browser-probe" } })
  const timer = setTimeout(() => { ready.reject(Error("Native browser readiness deadline")); abort.abort() }, 10_000)
  try {
    await Promise.race([ready.promise, pending.then(() => { throw Error("Native browser exited before readiness") })])
    clearTimeout(timer)
    expect(await Bun.file(path.join(root, "heartbeat")).exists()).toBe(true)
    await writer.write(new TextEncoder().encode("close\n"))
    await writer.close()
    const run = await pending
    const proof = { version: 1, kind: "nonmodel-browser-process-proof", scope: "single-trusted-node-browser; no-loginom-or-provider-calls",
      manifestHash: runtime.manifestHash, liveQualified: false, processes: run.processCleanup }
    await writeLeaseReceipt(path.join(root, "receipt.json"), proof)
    expect(run.exitCode).toBe(0)
    expect(run.processCleanup).toMatchObject({ status: "confirmed", error: null, unknownProcesses: [], capture_complete: true })
    expect(run.processCleanup.browserBindings?.length).toBeGreaterThan(0)
    expect(run.processCleanup.verification?.map(pass => pass.owned_remaining)).toEqual([0, 0])
    expect(run.processCleanup.observations?.max_start_delay_ms).toBeGreaterThanOrEqual(0)
    expect(run.processCleanup.observations?.max_gap_ms).toBeGreaterThanOrEqual(0)
    if (process.env.EVAL_PROCESS_PROOF_FILE) {
      await writeLeaseReceipt(process.env.EVAL_PROCESS_PROOF_FILE, proof)
      expect(await readLeaseReceipt(process.env.EVAL_PROCESS_PROOF_FILE)).toEqual(proof)
    }
    await rm(root, { recursive: true })
  } finally { clearTimeout(timer); abort.abort(); await writer.abort().catch(() => {}); await pending }
}, 90_000)

test.skipIf(!process.env.EVAL_PROCESS_CANDIDATE_RECEIPT)("installed parallel browsers: abort A preserves B and admin-role reconnect", async () => {
  const receipt = await readLeaseReceipt(process.env.EVAL_PROCESS_CANDIDATE_RECEIPT!) as { binary: string; manifestSha256: string }
  const runtime = await verifyAdminRuntime(receipt.binary)
  expect(runtime.manifestHash).toBe(receipt.manifestSha256)
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-native-parallel-process-"))
  const contexts: Awaited<ReturnType<typeof nativeBrowser>>[] = []
  try {
    const a = await nativeBrowser(root, "a", { kind: "slot", id: "a" }, runtime)
    contexts.push(a)
    const b = await nativeBrowser(root, "b", { kind: "slot", id: "b" }, runtime)
    contexts.push(b)
    const admin = await nativeBrowser(root, "admin", { kind: "admin", id: "admin-probe" }, runtime)
    contexts.push(admin)
    const before = await Promise.all([b.heartbeat(), admin.heartbeat()])
    const finishedA = await a.stop()
    expect(finishedA.interrupted).toBe(true)
    expect(finishedA.processCleanup).toMatchObject({ status: "confirmed", error: null, unknownProcesses: [] })
    expect(await b.heartbeat()).not.toBe(before[0])
    expect(await admin.heartbeat()).not.toBe(before[1])
    for (const owner of ["b", "admin-probe"]) {
      const peers = finishedA.processCleanup.peerProcesses?.filter(entry => entry.owner.id === owner) ?? []
      expect(peers.some(entry => entry.process.executable === runtime.browser)).toBe(true)
      expect(peers.every(entry => !finishedA.processCleanup.processes.some(owned => owned.pid === entry.process.pid && owned.starttime === entry.process.starttime))).toBe(true)
    }
    const finishedAdmin = await admin.close()
    expect(finishedAdmin.processCleanup.status).toBe("confirmed")
    const replacement = await nativeBrowser(root, "admin-reconnect", { kind: "admin", id: "admin-probe" }, runtime)
    contexts.push(replacement)
    const replacementBefore = await replacement.heartbeat()
    const finishedB = await b.close()
    expect(finishedB.processCleanup).toMatchObject({ status: "confirmed", error: null, unknownProcesses: [] })
    expect(finishedB.processCleanup.peerProcesses?.some(entry => entry.owner.kind === "admin" && entry.process.executable === runtime.browser)).toBe(true)
    expect(await replacement.heartbeat()).not.toBe(replacementBefore)
    const finishedReplacement = await replacement.close()
    expect(finishedReplacement.processCleanup.status).toBe("confirmed")
    const proofs = [finishedA, finishedB, finishedAdmin, finishedReplacement].map(run => run.processCleanup)
    expect(proofs.every(proof => proof.verification?.length === 2 && proof.verification.every(pass => pass.owned_remaining === 0))).toBe(true)
    const proof = { version: 1, kind: "parallel-browser-process-proof", checkedAt: new Date().toISOString(),
      pidNamespace: await readlink("/proc/self/ns/pid"), scope: "three-trusted-node-browser-chains; admin-role-reconnect; no-loginom-or-provider-calls",
      manifestHash: runtime.manifestHash, liveQualified: false, processes: proofs }
    if (process.env.EVAL_PROCESS_PROOF_FILE) {
      const file = path.join(path.dirname(process.env.EVAL_PROCESS_PROOF_FILE), "parallel.json")
      await writeLeaseReceipt(file, proof)
      expect(await readLeaseReceipt(file)).toEqual(proof)
    }
    await rm(root, { recursive: true })
  } finally { await Promise.all(contexts.map(context => context.stop())) }
}, 120_000)

test.skipIf(!process.env.EVAL_PROCESS_PID_REUSE)("kernel PID reuse cannot adopt or signal a new launcher through a retained failed owner", async () => {
  const pidNamespace = await readlink("/proc/self/ns/pid")
  const userNamespace = await readlink("/proc/self/ns/user")
  if (!process.env.EVAL_PROCESS_HOST_PID_NAMESPACE || !process.env.EVAL_PROCESS_HOST_USER_NAMESPACE ||
    pidNamespace === process.env.EVAL_PROCESS_HOST_PID_NAMESPACE || userNamespace === process.env.EVAL_PROCESS_HOST_USER_NAMESPACE)
    throw Error("PID reuse test requires separate PID and user namespaces")
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-kernel-pid-reuse-"))
  const first = path.join(root, "first"), second = path.join(root, "second")
  await Promise.all([mkdir(first), mkdir(second)])
  await mkdir(path.join(first, "process-cleanup.json"))
  const original = await superviseProcess({ cmd: [process.execPath, "-e", "await Bun.sleep(50)"], cwd: first,
    env: { PATH: "/usr/bin:/bin" }, outDir: first, timeoutMs: 2_000, owner: { kind: "slot", id: "a" } })
  expect(original.processCleanup).toMatchObject({ status: "failed", error: "Process evidence persistence failed", unknownProcesses: [] })
  const saved = original.processCleanup.processes.find(entry => entry.pid === original.processCleanup.launcher?.pid)!
  expect(await Bun.file(`/proc/${saved.pid}/stat`).exists()).toBe(false)
  const ready = Promise.withResolvers<number>()
  await writeFile("/proc/sys/kernel/ns_last_pid", String(saved.pid - 1))
  const pending = superviseProcess({ cmd: [process.execPath, "-e", "console.log(process.ppid); await Bun.sleep(1000)"], cwd: second,
    env: { PATH: "/usr/bin:/bin" }, outDir: second, timeoutMs: 3_000, owner: { kind: "slot", id: "b" },
    stdout: new WritableStream<Uint8Array>({ write(chunk) { ready.resolve(Number(new TextDecoder().decode(chunk).trim())) } }) })
  try {
    expect(await ready.promise).toBe(saved.pid)
    const current = (await readFile(`/proc/${saved.pid}/stat`, "utf8")).split(") ")[1]!.split(" ")
    expect(current[19]).not.toBe(saved.starttime)
    await expect(signalProcess(saved, "SIGKILL")).rejects.toThrow("Process identity changed")
    const run = await pending
    expect(run.exitCode).toBe(0)
    expect(run.processCleanup).toMatchObject({ status: "confirmed", error: null, unknownProcesses: [] })
    expect(run.processCleanup.peerProcesses?.some(entry => entry.process.starttime === saved.starttime && entry.process.pid === saved.pid)).toBe(false)
    const replacement = run.processCleanup.processes.find(entry => entry.pid === saved.pid)!
    expect(replacement.starttime).not.toBe(saved.starttime)
    expect([replacement.uid, replacement.device, replacement.inode, replacement.group, replacement.session])
      .toEqual([saved.uid, saved.device, saved.inode, saved.group, saved.session])
    if (process.env.EVAL_PROCESS_PROOF_FILE) {
      const file = path.join(path.dirname(process.env.EVAL_PROCESS_PROOF_FILE), "pid-reuse.json")
      const proof = { version: 1, kind: "kernel-pid-reuse-proof", pidNamespace, userNamespace,
        uidMap: await readFile("/proc/self/uid_map", "utf8"), liveQualified: false, original: saved, replacement, processes: run.processCleanup }
      await writeLeaseReceipt(file, proof)
      expect(await readLeaseReceipt(file)).toEqual(proof)
    }
    await rm(root, { recursive: true })
  } finally { await pending }
}, 10_000)

async function nativeBrowser(root: string, name: string, owner: ProcessOwner, runtime: Awaited<ReturnType<typeof verifyAdminRuntime>>) {
  const directory = path.join(root, name)
  const profile = path.join(directory, "profile")
  await mkdir(profile, { recursive: true, mode: 0o700 })
  const input = new TransformStream<Uint8Array, Uint8Array>()
  const writer = input.writable.getWriter()
  const ready = Promise.withResolvers<void>()
  const abort = new AbortController()
  const pending = superviseProcess({ cmd: [runtime.node, path.resolve(import.meta.dir, "../fixtures/native-browser-probe.mjs"),
    runtime.resources, path.join(profile, "loginom/runtime/probe/attempts/context/browser-profile"), path.join(directory, "heartbeat")],
    cwd: directory, env: { PATH: "/usr/bin:/bin", HOME: directory, LANG: "C.UTF-8", LOGINOM_AI_AGENT_CLI_BUNDLE: runtime.resources },
    profileDir: profile, outDir: directory, stdin: input.readable,
    stdout: new WritableStream<Uint8Array>({ write(chunk) { if (new TextDecoder().decode(chunk).includes("ready")) ready.resolve() } }),
    timeoutMs: 60_000, signal: abort.signal, owner })
  const timer = setTimeout(() => { ready.reject(Error("Native browser readiness deadline")); abort.abort() }, 10_000)
  const stop = async () => {
    const closed = writer.close().catch(() => {})
    abort.abort()
    await closed
    return pending
  }
  try {
    await Promise.race([ready.promise, pending.then(() => { throw Error("Native browser exited before readiness") })])
    return { heartbeat: () => Bun.file(path.join(directory, "heartbeat")).text(), stop,
      async close() { await writer.write(new TextEncoder().encode("close\n")); await writer.close(); return pending } }
  } catch (error) { await stop(); throw error }
  finally { clearTimeout(timer) }
}
