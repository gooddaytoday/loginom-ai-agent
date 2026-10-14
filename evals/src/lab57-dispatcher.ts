import { createHash } from "node:crypto"

/** Source-only adapter. These IDs describe the original records, NOT a server session ID. */
export const dispatcherScope = Object.freeze({
  issue: "01a1214a-fcf8-7e0c-8c1c-f5dd600180b3", ownerTask: "01a1375d-ce4a-7c35-a3a3-94cf64a8b589",
  frozen: "eb1c2b0da02210a9d95569849ae056fa4784440c", origin: "http://localhost",
  container: "b030b7bc86873b473f5d77d90132b82d3a4d15e993074929939c099748e3918e", build: "7.4.2",
  account: "user", packagePath: "/user/eval-20261013-225027-eb1c2b0da-txt-semicolon-cp1251-decimal-1.lgp",
  runtimeId: "39fb1f91-b58c-4c2a-bcfa-dcf8d0500d8d", document: "a9c28158-6c99-4dab-8665-88df7b2127cf",
  journalSha: "532cc89d11559c18159cd65b405c3d53211c9b38cf47dcf0a56861e0bf3631af",
  runSha: "05c608dd9e55b63273f4c4a3fe89b9dd1c0eb5d593742e09e128bbbe36c8c197",
  packageSha: "d88f4a24b6666d580aafad64eeebdcd8782781872001c88028bac8c2c38a10c7",
})

export type DispatcherPackage = { key: string; name: string; path: string | null; created: number | null;
  modified: number | null; readOnly: boolean; references: number; running: boolean }
export type DispatcherSession = { key: string; name: string; type: number; created: number; ip: string;
  packages: DispatcherPackage[]; packageCount: number; last: number; pendingDisconnect: boolean }
export type DispatcherInventory = { version: 1; origin: string; build: string; observer: string; admin: boolean;
  complete: boolean; filtered: boolean; dialogs: boolean; countBefore: number; countAfter: number;
  collectedAt: number; sessions: DispatcherSession[] }
export type OriginalBinding = { journalSha: string; runSha: string; packageSha: string; runtimeId: string;
  document: string; executionId: string; startedAt: number; durationMs: number; host: string | null;
  container: string; containerStartedAt: string }
export const dispatcherDigest = (v: unknown) => createHash("sha256").update(JSON.stringify(v,(_key,value:unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))) : value)).digest("hex")
const refuse = (reason: string): never => { throw Error(reason) }
const bounded = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 1024 && !/[\x00-\x1f\x7f]/.test(v)
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
const fields = (v: object, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k))

/** All indices including shared/pool and all packages; neither virtual rows nor a workspace snapshot. */
export function validateDispatcherInventory(value: unknown, now = Date.now()): DispatcherInventory {
  if (!value || typeof value !== "object" || Array.isArray(value)) refuse("INVENTORY_MISSING")
  const v = value as DispatcherInventory
  if (!fields(v,["version","origin","build","observer","admin","complete","filtered","dialogs","countBefore","countAfter","collectedAt","sessions"])) refuse("INVENTORY_UNKNOWN_FIELDS")
  if (v.version !== 1 || v.origin !== dispatcherScope.origin || v.build !== "7.4.2" || v.admin !== true)
    refuse("ORIGIN_BUILD_OR_PRIVILEGE")
  if (v.complete !== true || v.filtered !== false || v.dialogs !== false || !Array.isArray(v.sessions)
    || v.countBefore !== v.countAfter || v.countBefore !== v.sessions.length || v.sessions.length > 10000)
    refuse("INVENTORY_INCOMPLETE_OR_UNSTABLE")
  if (!finite(v.collectedAt) || v.collectedAt > now || now - v.collectedAt > 15000) refuse("STALE_OBSERVATION")
  const keys = new Set<string>(), names = new Set<string>(), paths = new Set<string>()
  for (const s of v.sessions) {
    if (!s || typeof s !== "object" || !fields(s,["key","name","type","created","ip","packages","packageCount","last","pendingDisconnect"])) refuse("SESSION_UNKNOWN_FIELDS")
    if (!bounded(s.key) || !bounded(s.name) || ![0, 1, 2, 3, 4].includes(s.type) || !finite(s.created)
      || !finite(s.last) || typeof s.ip !== "string" || !Array.isArray(s.packages)
      || s.packageCount !== s.packages.length || typeof s.pendingDisconnect !== "boolean"
      || keys.has(s.key) || names.has(s.name)) refuse("UNKNOWN_OR_DUPLICATE_SESSION")
    keys.add(s.key); names.add(s.name)
    for (const p of s.packages) {
      if (!p || typeof p !== "object" || !fields(p,["key","name","path","created","modified","readOnly","references","running"])) refuse("PACKAGE_UNKNOWN_FIELDS")
      if (!bounded(p.key) || !bounded(p.name) || keys.has(p.key) || typeof p.readOnly !== "boolean"
        || typeof p.running !== "boolean" || !Number.isSafeInteger(p.references) || p.references < 0
        || (p.created !== null && !finite(p.created)) || (p.modified !== null && !finite(p.modified))) refuse("UNKNOWN_OR_DUPLICATE_PACKAGE")
      keys.add(p.key)
      if (p.path !== null) {
        if (!bounded(p.path) || !/^\/(?:[^/\\\x00-\x1f]+\/)*[^/\\\x00-\x1f]+$/.test(p.path)
          || p.path.slice(1).split("/").some(x => x === ".." || x === ".") || paths.has(p.path)) refuse("PACKAGE_PATH_OR_DUPLICATE")
        paths.add(p.path)
      }
    }
  }
  const self = v.sessions.filter(s => s.type === 1)
  if (self.length !== 1 || self[0]!.key !== v.observer || self[0]!.packages.length !== 0
    || !/^[^:\s]+:[0-9]+$/.test(self[0]!.name) || self[0]!.name.toLowerCase().startsWith("user:")) refuse("OBSERVER_UNBOUND")
  return v
}

export function validateOriginalBinding(b: OriginalBinding) {
  if (!b || b.journalSha !== dispatcherScope.journalSha || b.runSha !== dispatcherScope.runSha
    || b.packageSha !== dispatcherScope.packageSha || b.runtimeId !== dispatcherScope.runtimeId
    || b.document !== dispatcherScope.document || b.executionId !== `${dispatcherScope.document}:145:1`
    || b.startedAt !== 1791933110493 || b.durationMs !== 194095 || b.container !== dispatcherScope.container
    || !bounded(b.containerStartedAt) || !finite(Date.parse(b.containerStartedAt))
    || Date.parse(b.containerStartedAt) > b.startedAt || b.host !== null) refuse("ORIGINAL_LINEAGE_CHANGED")
}

/** Hash actual immutable input bytes, rather than trusting a caller's claimed hashes. */
export function deriveOriginalBinding(runBytes: Uint8Array, journalBytes: Uint8Array, packageBytes: Uint8Array, containerStartedAt: string): OriginalBinding {
  const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex")
  if (hash(runBytes) !== dispatcherScope.runSha || hash(journalBytes) !== dispatcherScope.journalSha
    || hash(packageBytes) !== dispatcherScope.packageSha) refuse("ORIGINAL_BYTES_CHANGED")
  const run = JSON.parse(new TextDecoder().decode(runBytes)) as {startedAt: number; durationMs: number}
  const b: OriginalBinding = {runSha:hash(runBytes),journalSha:hash(journalBytes),packageSha:hash(packageBytes),
    runtimeId:dispatcherScope.runtimeId,document:dispatcherScope.document,executionId:`${dispatcherScope.document}:145:1`,
    startedAt:run.startedAt,durationMs:run.durationMs,container:dispatcherScope.container,containerStartedAt,host:null}
  validateOriginalBinding(b)
  return b
}

export type DispatcherDecision = { status: "BOUND_PRESENT" | "OWNERSHIP_SCOPE_ABSENT"; target: DispatcherSession | null;
  inventorySha: string; originalSha: string; closePermitted: boolean; limitation: string | null }

export function correlateDispatcher(inventory: unknown, original: OriginalBinding, now = Date.now()): DispatcherDecision {
  validateOriginalBinding(original)
  const v = validateDispatcherInventory(inventory, now)
  const own = v.sessions.filter(s => s.type !== 1 && s.name.startsWith(`${dispatcherScope.account}:`))
  const path = v.sessions.flatMap(s => s.packages.filter(p => p.path === dispatcherScope.packagePath).map(p => ({ s, p })))
  const unknownAccount = v.sessions.some(s => s.type === 0 && !/^[^:\s]+:[0-9]+$/.test(s.name))
  if (unknownAccount) refuse("SERVER_NAME_FORMAT_UNCONFIRMED")
  if (v.sessions.some(s => s.type !== 1 && s.name.toLowerCase().startsWith("user:") && !s.name.startsWith("user:"))) refuse("ACCOUNT_CASE_UNCONFIRMED")
  if (own.length === 0 && path.length === 0) return { status: "OWNERSHIP_SCOPE_ABSENT", target: null,
    inventorySha: dispatcherDigest(v), originalSha: dispatcherDigest(original), closePermitted: false, limitation: null }
  if (own.length !== 1 || path.length !== 1 || own[0] !== path[0]!.s) refuse("AMBIGUOUS_OR_FOREIGN_OWNERSHIP")
  const target = own[0]!, pkg = path[0]!.p
  if (target.type !== 0 || target.key === v.observer || !/^user:[0-9]+$/.test(target.name)
    || target.created < original.startedAt || target.created > original.startedAt + original.durationMs
    || (original.host !== null && target.ip !== original.host)) refuse("REUSED_REPLACED_OR_FOREIGN_SESSION")
  if (target.packages.length !== 1 || target.packages[0] !== pkg || pkg.path === null || pkg.created === null
    || pkg.modified === null || pkg.references !== 1 || pkg.running || pkg.created < original.startedAt
    || pkg.modified < pkg.created || pkg.modified > original.startedAt + original.durationMs) refuse("RUNNING_OR_UNKNOWN_PACKAGE")
  return { status: "BOUND_PRESENT", target, inventorySha: dispatcherDigest(v), originalSha: dispatcherDigest(original),
    closePermitted: pkg.readOnly === true,
    limitation: pkg.readOnly ? null : "WRITABLE_TARGET_DIRTY_STATE_UNOBSERVABLE" }
}

/** Repeated complete inventories, immutable server incarnation, exact owner and preserved non-target scope. */
export function stableDispatcherDecision(before: unknown, after: unknown, original: OriginalBinding, now = Date.now()) {
  const a = correlateDispatcher(before, original, now), b = correlateDispatcher(after, original, now)
  const av = validateDispatcherInventory(before, now), bv = validateDispatcherInventory(after, now)
  if (av.observer !== bv.observer || bv.collectedAt <= av.collectedAt
    || dispatcherDigest(av.sessions) !== dispatcherDigest(bv.sessions) || a.status !== b.status) refuse("INVENTORY_REFRESH_RACE")
  return b
}

/** No cleanup/PASS/RELEASED claim. This is only an addressed server cessation boundary. */
export function verifyDispatcherCessation(before: DispatcherInventory, after: unknown, original: OriginalBinding, now = Date.now()) {
  const decision = correlateDispatcher(before, original, now), v = validateDispatcherInventory(after, now)
  if (v.observer !== before.observer || v.collectedAt <= before.collectedAt) refuse("POST_OBSERVATION_UNBOUND")
  if (v.sessions.some(s => s.type !== 1 && s.name.startsWith("user:"))
    || v.sessions.some(s => s.packages.some(p => p.path === dispatcherScope.packagePath))) refuse("ORIGINAL_SCOPE_STILL_PRESENT")
  const preserved = before.sessions.filter(s => s.key !== decision.target?.key)
  if (dispatcherDigest(preserved) !== dispatcherDigest(v.sessions)) refuse("NON_TARGET_INVENTORY_CHANGED")
  return { version: 1, status: "SERVER_OWNERSHIP_SCOPE_CEASED", source: "vendor-dispatcher" as const,
    issue: dispatcherScope.issue, ownerTask: dispatcherScope.ownerTask, frozen: dispatcherScope.frozen,
    originalSha: decision.originalSha, beforeSha: dispatcherDigest(before), afterSha: dispatcherDigest(v),
    serverName: decision.target?.name ?? null, serverCreated: decision.target?.created ?? null,
    observerKey: v.observer, packagePath: dispatcherScope.packagePath, container: original.container,
    containerStartedAt: original.containerStartedAt, cleanup: "UNCONFIRMED", originalOutcome: "ERROR" }
}
