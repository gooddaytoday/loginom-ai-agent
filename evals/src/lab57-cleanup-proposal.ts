import path from "node:path"
import type { ProcessCleanup } from "./process-supervisor"

/** Preparation policy only. Never emits admission, completion, PASS or process settlement. */
export const lab57CleanupScope = Object.freeze({
  issue: "01a1214a-fcf8-7e0c-8c1c-f5dd600180b3", task: "01a1375d-ce4a-7c35-a3a3-94cf64a8b589",
  role: "ben", phase: "eval", sha: "eb1c2b0da02210a9d95569849ae056fa4784440c", version: 1,
  device: 64512, inode: 17837096, endpoint: "http://localhost/app/",
  containerId: "b030b7bc86873b473f5d77d90132b82d3a4d15e993074929939c099748e3918e",
  acquiredAt: "2026-10-13T22:28:17.228Z",
  configSha256: "d20475fc9ef2e273b6098943c810886f5f2af580bd76ba82d739022594f84981",
  raw_owner_sha256: "7d343a0f13f97506770e08a24e10f2d3360c88754dfd7184776cef4508b0be64",
  raw_config_sha256: "ffbc373a557e0156a4726874d424a330922286545310bb0e0cd9b12863646b35",
})
const profile = "/home/user/.local/share/loginom-evals-runtime/roles/ben/eval-profile"
const cleanupPath = "txt-semicolon-cp1251-decimal/1/cleanup.json"
const sources: Record<string, string> = {
  "summary.json": "93a750552ae7bfb97697e7e4563f1fd1b0ee046ca4a3018048bb632386985058",
  "code-verdict.json": "b832669145a229999b39d02f293a2e0300ea9466c7e4beae6bbdcae5a2c2bf10",
  [cleanupPath]: "1ef7a1544f4a779bcf9648300a3afa081953cf2eaa7ecda90c35769fb31862f1",
  "txt-semicolon-cp1251-decimal/1/result.json": "2b40770b25b69bf2357ed6a534161dfcfa155c9391c746fc4047e5cef96eb712",
  "txt-semicolon-cp1251-decimal/1/run.json": "05c608dd9e55b63273f4c4a3fe89b9dd1c0eb5d593742e09e128bbbe36c8c197",
}
const session = "ses_ec8768439ffevZMaARGaKwMSzf"
const packagePath = "/user/eval-20261013-225027-eb1c2b0da-txt-semicolon-cp1251-decimal-1.lgp"
const csv = { path: "/workdir/UserStorage/user/cc6187e46829a5fa768f09eeb024367d745628a1d10f46f26a0ec5543f76c997-0-semicolon_cp1251_decimal.txt",
  identity: "58:1179775:150:81a4", sha256: "94821af546f6454601f5338d6fe32b8bf7a85bf7208b34df2bc522e55e2ab4dd" }
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
const same = (value: unknown, expected: Record<string, unknown>) => Object.entries(expected).every(([field, v]) => object(value)[field] === v)
const hash = (value: string) => new Bun.CryptoHasher("sha256").update(value).digest("hex")
const time = (value: unknown) => typeof value === "string" ? Date.parse(value) : NaN

/** Saved admission/ancestry is validated without /proc, signals or changing the historical error. */
export function validateCapturedLineage(proof: ProcessCleanup, acquiredAt: string): string[] {
  if (!proof || proof.capture_complete !== true || proof.observation_mode !== "continuous" ||
    !Array.isArray(proof.unknownProcesses) || proof.unknownProcesses.length || !proof.launcher?.ready ||
    !proof.writer?.owner || !proof.selectedCli || !proof.processes?.length || !proof.runtimeDirectories?.length ||
    !proof.verification || proof.verification.length < 2 || proof.verification.some(p => p.owned_remaining !== 0 ||
      !Number.isFinite(time(p.observed_at)) || time(p.observed_at) < time(acquiredAt))) return ["SOURCE_CAPTURE_INCOMPLETE"]
  const ids = new Set(proof.processes.map(p => `${p.pid}:${p.starttime}`))
  if (ids.size !== proof.processes.length || proof.origins?.length !== ids.size || proof.admissions?.length !== ids.size ||
    proof.processes.some(p => !Number.isSafeInteger(p.pid) || p.pid < 1 || p.uid !== 1000 || !/^\d+$/.test(p.starttime) ||
      !Number.isSafeInteger(p.group) || p.group < 1 || !Number.isSafeInteger(p.session) || p.session < 1 ||
      !Number.isSafeInteger(p.device) || p.device < 1 || !Number.isSafeInteger(p.inode) || p.inode < 1 || !path.isAbsolute(p.executable) ||
      proof.admissions!.filter(a => a.pid === p.pid && a.starttime === p.starttime && a.status === "allowed").length !== 1 ||
      proof.origins!.filter(o => o.pid === p.pid && o.starttime === p.starttime && Number.isFinite(time(o.observed_at)) &&
        time(o.observed_at) >= time(acquiredAt) && (o.via === "launcher" ? o.pid === proof.launcher!.pid && o.parent_pid === null && o.parent_starttime === null :
          ["cli", "parent", "subreaper"].includes(o.via) && ids.has(`${o.parent_pid}:${o.parent_starttime}`))).length !== 1)) return ["SOURCE_ANCESTRY_UNCONFIRMED"]
  const cli = proof.processes.find(p => p.pid === proof.launcher!.cli_pid)
  if (!cli || cli.executable !== proof.selectedCli.executable || cli.device !== proof.selectedCli.device || cli.inode !== proof.selectedCli.inode ||
    proof.origins!.find(o => o.pid === cli.pid)?.via !== "cli") return ["SOURCE_CLI_UNCONFIRMED"]
  for (const identity of proof.processes) {
    const visited = new Set<string>()
    let current: string | undefined = `${identity.pid}:${identity.starttime}`
    while (current) {
      if (visited.has(current)) return ["SOURCE_ANCESTRY_CYCLE"]
      visited.add(current)
      const origin = proof.origins!.find(o => `${o.pid}:${o.starttime}` === current)
      if (!origin) return ["SOURCE_ANCESTRY_UNCONFIRMED"]
      current = origin.via === "launcher" ? undefined : `${origin.parent_pid}:${origin.parent_starttime}`
    }
  }
  return []
}

export function prepareLab57CleanupProposal(input: unknown) {
  const value = object(input), missing: string[] = []
  if (!same(value.binding, lab57CleanupScope)) missing.push("ORIGINAL_LEASE_BINDING_CHANGED")
  if (value.profile !== profile) missing.push("PROFILE_PATH_CHANGED")
  for (const [file, expected] of Object.entries(sources)) {
    const bytes = object(value.source)[file]
    if (typeof bytes !== "string" || hash(bytes) !== expected) missing.push(`SOURCE_BYTES_CHANGED:${file}`)
  }
  if (!missing.some(code => code.startsWith("SOURCE_BYTES_CHANGED:"))) {
    const cleanup = JSON.parse(object(value.source)[cleanupPath] as string) as { stages: unknown[]; result: { status: string }; processes: ProcessCleanup }
    if (cleanup.processes.status !== "failed" || cleanup.processes.error !== "Writer owner identity changed during release" ||
      cleanup.stages.length || cleanup.result.status !== "failed") missing.push("SOURCE_FAILURE_CHANGED")
    missing.push(...validateCapturedLineage(cleanup.processes, lab57CleanupScope.acquiredAt))
    if (cleanup.processes.runtimeDirectories.some(p => !p.startsWith(profile + path.sep))) missing.push("SOURCE_RUNTIME_PATH_CHANGED")
    const terminal = JSON.parse(object(value.source)["txt-semicolon-cp1251-decimal/1/run.json"] as string)
    const result = JSON.parse(object(value.source)["txt-semicolon-cp1251-decimal/1/result.json"] as string)
    if (terminal.sessionId !== session || terminal.exitCode !== 0 || terminal.timedOut || terminal.interrupted ||
      result.session_id !== session || result.package_path !== packagePath || result.status !== "completed" ||
      result.environment_cleanup.status !== "failed" || result.environment_cleanup.error !== cleanup.processes.error) missing.push("SOURCE_TERMINAL_CHANGED")
  }
  if (!same(value.registration, { path: `${profile}.process-group`, device: 64512, inode: 3710822, uid: 1000, mode: 0o600, size: 7,
    mtimeNs:"1791933110497611176",ctimeNs:"1791933110497611176",sha256: "f03f26330addd250ebebfc615ffb52350ba77aba21b95bc94ce93344dc27a0a9" })) missing.push("REGISTRATION_BINDING_CHANGED")
  if (!same(value.guard, { path: `${profile}.harness-lease`, device: 64512, inode: 3840909, uid: 1000, mode: 0o700, size:4096,
      mtimeNs:"1791931825725205266",ctimeNs:"1791931825725205266" }) ||
    !same(value.guardOwner, { path: `${profile}.harness-lease/owner.json`, device:64512,inode:3840913,uid: 1000, mode: 0o600,size:96,
      mtimeNs:"1791931825725205266",ctimeNs:"1791931825725205266",
      sha256: "f3d323b799d38e4a1ebe1ad901bf69a08e572479674cc94d6f1751642ea87106" }) ||
    !same(value.guardCurrentBirth, { pid: 2126565, uid: 1000, starttime: "99114278" })) missing.push("LEGACY_GUARD_BINDING_CHANGED")
  // No retroactive harness admission. A separately preserved ORIGINAL parent capture must fill the gap.
  if (value.guardAdmission !== null && value.guardAdmission !== undefined) missing.push("SYNTHESIZED_HARNESS_ADMISSION_REFUSED")
  const parent = object(value.guardParentCapture)
  if (!same(parent, { kind: "preserved-original-parent-capture", sourceCleanupSha256: sources[cleanupPath] }) ||
    !same(parent.process, { pid: 2126565, uid: 1000, starttime: "99114278" }) ||
    !Number.isFinite(time(parent.observedAt)) || time(parent.observedAt) < time(lab57CleanupScope.acquiredAt) ||
    time(parent.observedAt) > time("2026-10-13T23:15:04.503Z") || typeof parent.privateReceiptSha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(parent.privateReceiptSha256)) missing.push("LEGACY_GUARD_PARENT_BIRTH_UNCAPTURED")
  const ceased = object(value.serverCessation)
  if (!same(ceased, { kind: "genuine-eligible-server-cessation", sourceCleanupSha256: sources[cleanupPath], session, packagePath, confirmed: true }) ||
    typeof ceased.privateReceiptSha256 !== "string" || !/^[0-9a-f]{64}$/.test(ceased.privateReceiptSha256)) missing.push("SERVER_CESSATION_UNPROVEN")
  if (!Array.isArray(value.storage) || value.storage.length !== 1 || !same(value.storage[0], csv)) missing.push("FOREIGN_OR_CHANGED_STORAGE")
  const fresh = object(value.freshOperatorGuards)
  if (!same(fresh, { containerId: lab57CleanupScope.containerId, noMounts: true, queuesClear: true, allProfilesInspected: true,
    sourceAndGuardPidsAbsent: true, relevantInspectionComplete: true, nativeAbsent: true, browsersAndDebuggersAbsent: true, profileFdsAbsent: true,
    writerAbsent: true, foreignProfilesClean: true, storageExact: true, originalBindingUnchanged: true }) ||
    !Number.isFinite(time(fresh.observedAt)) || Math.abs(Date.now() - time(fresh.observedAt)) > 5000 ||
    !Array.isArray(fresh.passes) || fresh.passes.length !== 2 || fresh.passes.some(p => object(p).remaining !== 0 ||
      object(p).reused !== 0 || object(p).unknown !== 0)) missing.push("FRESH_OPERATOR_GUARDS_REQUIRED")
  return { status: "PREPARED" as const, applied: false, readiness: missing.length ? "NOT_READY" : "READY_FOR_COORDINATOR_REVIEW",
    missing: [...new Set(missing)], historicalError: "Writer owner identity changed during release", lowerTrace: "UNKNOWN",
    sourceHashes: sources, counters: { reviewCycle: 2, rejectCount: 1, benProduct: "6/6", recovery: 0 },
    caveat: "Offline evidence review only; receipt provenance and fresh guards require the pinned operator. No live command is registered." }
}
