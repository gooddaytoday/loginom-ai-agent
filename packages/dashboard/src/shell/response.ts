// Effect's browser decoder adds 367 KB; these checks cover only fields consumed by the shell.
// Conformance against the service schemas is checked in shell-contract.test.mjs.
export function lookupResponse(value: unknown) {
  if (!isObject(value)) return invalid("lookup")
  const { key, exists, hash, appOrigin, mode, cliButton, currentVersion, latest } = value
  if (
    typeof key !== "string" || typeof exists !== "boolean" || typeof cliButton !== "boolean" ||
    (hash !== null && (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash))) ||
    typeof appOrigin !== "string" || !httpOrigin(appOrigin) ||
    (mode !== "normal" && mode !== "strict") ||
    (currentVersion !== null && !hasVersionName(currentVersion))
  ) return invalid("lookup")
  if (latest !== null) {
    if (!hasVersionName(latest) || typeof latest.status !== "string" ||
        !["pending", "building", "ready", "failed"].includes(latest.status)) return invalid("lookup")
    if (latest.error !== undefined && typeof latest.error !== "string") return invalid("lookup")
  }
  return { key, exists, hash, appOrigin, mode, cliButton,
    currentVersion: currentVersion && { name: currentVersion.name },
    latest: latest && { name: latest.name, status: latest.status, ...("error" in latest ? { error: latest.error } : {}) },
  }
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
    return invalid("snapshot")
  return { id: value.id }
}

function invalid(endpoint: string): never {
  throw Error(`Некорректный ответ службы dashboard (${endpoint}).`)
}
