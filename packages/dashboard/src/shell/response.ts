// Effect's browser decoder adds 367 KB; these checks cover only fields consumed by the shell.
// Conformance against the service schemas is checked in shell-contract.test.mjs.
export function lookupResponse(value: unknown) {
  if (!isLookup(value)) throw Error("Некорректный ответ службы dashboard (lookup).")
  return { key: value.key, exists: value.exists, hash: value.hash, appOrigin: value.appOrigin, mode: value.mode, cliButton: value.cliButton }
}

function isLookup(value: unknown): value is {
  key: string
  exists: boolean
  hash: string | null
  appOrigin: string
  mode: "normal" | "strict"
  cliButton: boolean
} {
  if (typeof value !== "object" || value === null) return false
  if (!("key" in value) || typeof value.key !== "string") return false
  if (!("exists" in value) || typeof value.exists !== "boolean") return false
  if (!("hash" in value)) return false
  if (!(value.hash === null || (typeof value.hash === "string" && /^[a-f0-9]{64}$/.test(value.hash)))) return false
  if (!("appOrigin" in value) || typeof value.appOrigin !== "string" || !httpOrigin(value.appOrigin)) return false
  if (!("mode" in value) || (value.mode !== "normal" && value.mode !== "strict")) return false
  if (!("cliButton" in value) || typeof value.cliButton !== "boolean") return false
  return true
}

function httpOrigin(value: string) {
  const url = URL.parse(value)
  return url?.origin === value && (url.protocol === "http:" || url.protocol === "https:")
}

export function snapshotResponse(value: unknown) {
  if (
    typeof value !== "object" ||
    value === null ||
    !("id" in value) ||
    typeof value.id !== "string" ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value.id) ||
    Object.keys(value).length !== 1
  )
    throw Error("Некорректный ответ службы dashboard (snapshot).")
  return { id: value.id }
}
