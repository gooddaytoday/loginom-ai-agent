export * as Wildcard from "./wildcard.js"

export const caseInsensitive = () => typeof process !== "undefined" && process.platform === "win32"

export function match(input: string, pattern: string, ignoreCase = caseInsensitive()) {
  const normalized = input.replaceAll("\\", "/")
  let escaped = pattern
    .replaceAll("\\", "/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")

  if (escaped.endsWith(" .*")) escaped = escaped.slice(0, -3) + "( .*)?"

  return new RegExp("^" + escaped + "$", ignoreCase ? "si" : "s").test(normalized)
}
