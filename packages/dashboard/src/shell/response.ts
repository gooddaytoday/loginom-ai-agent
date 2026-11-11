// Effect's browser decoder adds 367 KB; these checks cover only fields consumed by the shell.
// Conformance against the service schemas is checked in shell-contract.test.mjs.
export function lookupResponse(value: unknown) {
  if (
    typeof value !== "object" ||
    value === null ||
    !("key" in value) ||
    typeof value.key !== "string" ||
    !("exists" in value) ||
    typeof value.exists !== "boolean"
  )
    throw Error("Некорректный ответ службы dashboard (lookup).")
  return { key: value.key, exists: value.exists }
}

export function snapshotResponse(value: unknown) {
  if (
    typeof value !== "object" ||
    value === null ||
    !("id" in value) ||
    typeof value.id !== "string" ||
    !("nodeName" in value) ||
    typeof value.nodeName !== "string"
  )
    throw Error("Некорректный ответ службы dashboard (snapshot).")
  return { id: value.id, nodeName: value.nodeName }
}
