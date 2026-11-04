import { Option, Schema } from "effect"

const decode = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)

const files = Schema.decodeUnknownOption(
  Schema.Array(
    Schema.Struct({
      artifact_id: Schema.NonEmptyString,
      path: Schema.NonEmptyString,
      name: Schema.NonEmptyString,
    }),
  ),
)

export function completedOutputFiles(input: { status?: string; metadata?: Record<string, unknown>; output?: string }) {
  if (input.status !== "completed") return []
  const result = files(input.metadata?.outputFiles)
  if (Option.isNone(result)) return []
  return result.value.filter(
    (file, index, all) =>
      (file.path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(file.path) || file.path.startsWith("\\\\")) &&
      !/[\x00-\x1f\x7f]/.test(file.path) &&
      !file.path.split(/[\\/]/).some((part) => part === ".." || part === ".") &&
      file.path.split(/[\\/]/).at(-1) === file.name &&
      all.findIndex((other) => other.path === file.path) === index,
  )
}

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
