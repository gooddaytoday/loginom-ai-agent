import { Option, Schema } from "effect"

const decode = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)

export function completedPackageDocument(input: {
  status?: string
  input?: Record<string, unknown>
  output?: string
  directory: string
}) {
  if (input.status !== "completed" || input.input?.operation !== "emit") return
  const parsed = decode(input.output ?? "")
  if (Option.isNone(parsed) || !parsed.value || typeof parsed.value !== "object" || !("output" in parsed.value)) return
  const path = parsed.value.output
  if (typeof path !== "string") return
  const filename = path.split("/").at(-1)
  if (!filename || !/\.(pdf|docx|md)$/i.test(filename) || /[\x00-\x1f\\]/.test(path)) return
  const directory = input.directory.replace(/\/$/, "")
  if (!directory.startsWith("/") || path !== directory + "/" + filename) return
  return { filename, url: "file://" + path.split("/").map(encodeURIComponent).join("/") }
}
