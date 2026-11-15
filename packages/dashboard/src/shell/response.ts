// Effect's browser decoder adds 367 KB; these checks cover only fields consumed by the shell.
// Conformance against the service schemas is checked in shell-contract.test.mjs.
export function lookupResponse(value: unknown) {
  if (!isLookup(value)) throw Error("Некорректный ответ службы dashboard (lookup).")
  return { key: value.key, exists: value.exists, hash: value.hash, appOrigin: value.appOrigin, mode: value.mode, cliButton: value.cliButton,
    currentVersion: value.currentVersion && { name: value.currentVersion.name },
    latest: value.latest && { name: value.latest.name, status: value.latest.status, ...("error" in value.latest ? { error: value.latest.error } : {}) },
  }
}

function isLookup(value: unknown): value is {
  key: string
  exists: boolean
  hash: string | null
  appOrigin: string
  mode: "normal" | "strict"
  cliButton: boolean
  currentVersion: null | { name: string }
  latest: null | { name: string; status: "pending" | "building" | "ready" | "failed"; error?: string }
} {
  if (!isObject(value)) return false
  if (typeof value.key !== "string" || typeof value.exists !== "boolean") return false
  if (!(value.hash === null || (typeof value.hash === "string" && /^[a-f0-9]{64}$/.test(value.hash)))) return false
  if (typeof value.appOrigin !== "string" || !httpOrigin(value.appOrigin)) return false
  if (value.mode !== "normal" && value.mode !== "strict") return false
  if (typeof value.cliButton !== "boolean") return false
  if (value.currentVersion !== null && !hasVersionName(value.currentVersion)) return false
  if (value.latest !== null) {
    const latest = value.latest
    if (!hasVersionName(latest)) return false
    if (typeof latest.status !== "string" || !["pending", "building", "ready", "failed"].includes(latest.status)) return false
    if (latest.error !== undefined && typeof latest.error !== "string") return false
  }
  return true
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function hasVersionName(value: unknown): value is Record<string, unknown> & { name: string } {
  return isObject(value) && typeof value.name === "string" && /^\d{8}T\d{6}Z\.json$/.test(value.name)
}

function httpOrigin(value: string) {
  const url = URL.parse(value)
  return url?.origin === value && (url.protocol === "http:" || url.protocol === "https:")
}

export function snapshotResponse(value: unknown) {
  if (
    !isObject(value) ||
    typeof value.id !== "string" ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value.id) ||
    Object.keys(value).length !== 1
  )
    throw Error("Некорректный ответ службы dashboard (snapshot).")
  return { id: value.id }
}
