import path from "node:path"
import { lstat } from "node:fs/promises"
import { childEnvironment } from "./child-environment"
import { EvalFailure } from "./fail"
import { superviseProcess } from "./process-supervisor"
import type { ResourceBound } from "./parallel-resource-budget"

export function requireAvailableMemory(available: number | null, bounds: readonly ResourceBound[]) {
  const minimum = bounds.find(bound => bound.scope === "host" && bound.metric === "memory.available_bytes")?.minimum
  if (minimum === undefined || minimum === null || !Number.isSafeInteger(minimum) || minimum <= 0)
    throw new EvalFailure("HOST_MEMORY_BUDGET_REQUIRED", 2)
  if (available === null || !Number.isSafeInteger(available) || available < 0) throw new EvalFailure("HOST_MEMORY_UNAVAILABLE", 2)
  if (available < minimum) throw new EvalFailure(`HOST_MEMORY_BUDGET_INSUFFICIENT: available=${available} required=${minimum}`, 2)
}

export async function startRunResourceSampler(input: { slotsFile: string; out: string; runId: string },
  env: Record<string, string | undefined> = process.env) {
  if (await lstat(input.out).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw new EvalFailure("RESOURCE_OUTPUT_PRIVATE", 2)
  })) throw new EvalFailure("RESOURCE_OUTPUT_EXISTS", 2)
  const controller = new AbortController()
  const state = { settled: false }
  const pending = superviseProcess({ cmd: [process.execPath, "--no-env-file", "run", path.resolve(import.meta.dir, "../script/sample-parallel-resources.ts"),
    "--config", input.slotsFile, "--out", input.out, "--run-id", input.runId, "--phase", "run", "--interval-ms", "1000"],
    cwd: path.resolve(import.meta.dir, ".."), env: childEnvironment(env), timeoutMs: null, signal: controller.signal,
    owner: { kind: "command", id: `${input.runId}-resources` } })
  void pending.then(() => { state.settled = true }, () => { state.settled = true })
  let stopped: Promise<void> | undefined
  const stop = () => stopped ??= (async () => {
    controller.abort()
    const result = await pending
    if (result.exitCode !== 0 || result.processCleanup.status !== "confirmed" || !result.processCleanup.capture_complete ||
      !await Bun.file(`${input.out}.summary.json`).exists()) throw new EvalFailure("RESOURCE_SAMPLER_UNCONFIRMED", 2)
  })()
  const deadline = Date.now() + 15_000
  while (!state.settled && Date.now() < deadline) {
    if ((await Bun.file(input.out).text().catch(() => "")).includes("\n")) return { stop }
    await Bun.sleep(25)
  }
  await stop().catch(() => {})
  throw new EvalFailure("RESOURCE_SAMPLER_NOT_READY", 2)
}
