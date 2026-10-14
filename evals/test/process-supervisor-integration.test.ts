import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { readLeaseReceipt, writeLeaseReceipt } from "../src/lease"
import { verifyAdminRuntime } from "../src/preflight"
import { superviseProcess } from "../src/process-supervisor"

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
