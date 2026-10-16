import path from "node:path"
import { chmod, open, readFile } from "node:fs/promises"
import type { superviseProcess } from "./process-supervisor"

export type ManagementBinding = {
  owner: { issue: string; task: string; role: string; phase: string; sha: string }
  acquiredAt: string; configSha256: string; containerId: string
}
type Result = Awaited<ReturnType<typeof superviseProcess>>
const hash = (text: string | Buffer) => new Bun.CryptoHasher("sha256").update(text).digest("hex")
export const nodeManagementArguments = (operation: "status" | "check") => ["loginom", operation, "--format", "json", "--headless"]

export function managementView(stdout: string) {
  try {
    const value: unknown = JSON.parse(stdout.trim().split("\n").at(-1) ?? "")
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
    const v = value as Record<string, unknown>
    if (typeof v.state !== "string" || v.recoveries !== undefined && (!Array.isArray(v.recoveries) || v.recoveries.some(x => typeof x !== "string")) ||
      v.failure !== undefined && typeof v.failure !== "string" || v.hasApiKey !== undefined && typeof v.hasApiKey !== "boolean") return undefined
    return { state: v.state, recoveries: v.recoveries as string[] | undefined, failure: v.failure as string | undefined, hasApiKey: v.hasApiKey as boolean | undefined }
  } catch { return undefined }
}

export function managementIsReady(result: Result) {
  const view = managementView(result.stdout)
  return result.exitCode === 0 && !result.timedOut && !result.interrupted && !result.sandboxError &&
    result.processCleanup.status === "confirmed" && !result.processCleanup.error && result.processCleanup.capture_complete && !result.processCleanup.unknownProcesses?.length &&
    !result.processCleanup.bindingRefusals?.length && view?.state === "ready" && !view.failure && !view.recoveries?.length && view.hasApiKey !== false
}

export function assertManagementBinding(actual: ManagementBinding, expected: ManagementBinding) {
  const ownerKeys = ["issue", "task", "role", "phase", "sha"] as const
  if (!actual || !expected || !actual.owner || !expected.owner || ownerKeys.some(k => typeof actual.owner[k] !== "string" || actual.owner[k] !== expected.owner[k]) ||
    !/^[0-9a-f]{40}$/.test(actual.owner.sha) || !Number.isFinite(Date.parse(actual.acquiredAt)) || actual.acquiredAt !== expected.acquiredAt ||
    !/^[0-9a-f]{64}$/.test(actual.configSha256) || actual.configSha256 !== expected.configSha256 ||
    !/^[0-9a-f]{64}$/.test(actual.containerId) || actual.containerId !== expected.containerId) throw Error("MANAGEMENT_BINDING_CHANGED")
}

/** Raw output/process records stay private; this receipt contains only hashes,
 * fixed argument vocabulary and schema indicators, never arbitrary CLI text.
 */
export async function writeManagementEvidence(out: string, args: string[], result: Result, binding?: ManagementBinding) {
  if (binding) assertManagementBinding(binding, binding)
  const captured = await Promise.all(["events.jsonl", "stderr.txt", "process-cleanup.json"].map(async file => {
    await chmod(path.join(out, file), 0o600)
    return readFile(path.join(out, file))
  }))
  const view = managementView(result.stdout)
  const knownStates = ["ready", "starting", "pending", "unconfigured", "recoverable-error", "failure"]
  const operation = args[0] === "loginom" && ["status", "check", "setup", "recover"].includes(args[1] ?? "") ? args[1] : "other"
  const exact = ["status", "check"].includes(operation ?? "") && JSON.stringify(args) === JSON.stringify(nodeManagementArguments(operation as "status" | "check"))
  const owner = binding ? Object.fromEntries(["issue", "task", "role", "phase", "sha"].map(k => [k, binding.owner[k as keyof ManagementBinding["owner"]]])) : undefined
  const receipt = { version: 1, binding: binding ? { owner, acquiredAt: binding.acquiredAt, configSha256: binding.configSha256, containerId: binding.containerId } : null,
    arguments: exact ? args : ["loginom", operation], mode: args.includes("--headless") ? "headless" : "default",
    exitCode: result.exitCode, timedOut: result.timedOut, interrupted: result.interrupted, sandbox_failed: Boolean(result.sandboxError),
    startedAt: result.startedAt, durationMs: result.durationMs,
    stdout: { bytes: captured[0]!.byteLength, sha256: hash(captured[0]!), private_file: "events.jsonl" },
    stderr: { bytes: captured[1]!.byteLength, sha256: hash(captured[1]!), private_file: "stderr.txt" },
    capture_matches_returned: captured[0]!.toString("utf8") === result.stdout && captured[1]!.toString("utf8") === result.stderr,
    view: { present: Boolean(view), state: view ? knownStates.includes(view.state) ? view.state : "unrecognized" : null,
      state_sha256: view ? hash(view.state) : null, failure_present: Boolean(view?.failure), recovery_count: view?.recoveries?.length ?? null, hasApiKey: view?.hasApiKey ?? null },
    process: { status: result.processCleanup.status, capture_complete: result.processCleanup.capture_complete,
      unknown_count: result.processCleanup.unknownProcesses?.length ?? 0, binding_refusal_count: result.processCleanup.bindingRefusals?.length ?? 0,
      proof_file: "process-cleanup.json", proof_sha256: hash(captured[2]!) },
    lower_exception: "UNKNOWN_UNLESS_PRESENT_IN_PRIVATE_OUTPUT" }
  const file = path.join(out, "management-result.json")
  const handle = await open(file, "wx", 0o600)
  try { await handle.writeFile(JSON.stringify(receipt, null, 2)); await handle.sync() } finally { await handle.close() }
  if (JSON.stringify(JSON.parse(await readFile(file, "utf8"))) !== JSON.stringify(receipt)) throw Error("MANAGEMENT_EVIDENCE_READBACK_FAILED")
  return receipt
}
