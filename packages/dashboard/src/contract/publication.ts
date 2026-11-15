import { Option, Schema } from "effect"
import { Binding } from "./snapshot.ts"

const SourceFile = Schema.Struct({ path: Schema.String, encoding: Schema.Literals(["utf8", "base64"]), content: Schema.String }).check(
  Schema.makeFilter(file => {
    if (!file.path.startsWith("src/") || /[\\\0]/.test(file.path) || file.path.split("/").some(part => !part || part.startsWith("."))) return false
    if (file.encoding === "utf8") return /\.(ts|tsx|css|json|svg)$/i.test(file.path)
    return /\.(png|jpg|webp|woff2)$/i.test(file.path) &&
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.content) &&
      btoa(atob(file.content)) === file.content
  }),
)

export const Publication = Schema.Struct({
  format: Schema.Literal(1),
  template: Schema.Literal(1),
  binding: Binding,
  title: Schema.String,
  parameters: Schema.Array(Schema.Struct({
    name: Schema.String, label: Schema.String,
    min: Schema.optional(Schema.Number), step: Schema.optional(Schema.Number),
  })),
  files: Schema.Array(SourceFile).check(Schema.makeFilter(files =>
    files.length <= 200 && files.some(file => file.path === "src/main.tsx") && new Set(files.map(file => file.path)).size === files.length,
  )),
})
export type Publication = typeof Publication.Type

export function parsePublication(content: string): Publication {
  if (new TextEncoder().encode(content).byteLength > 1_048_576) throw Error("DASHBOARD_PUBLICATION_TOO_LARGE")
  const result = Schema.decodeUnknownOption(Schema.fromJsonString(Publication), { onExcessProperty: "error" })(content)
  if (Option.isNone(result)) throw Error("DASHBOARD_PUBLICATION_INVALID")
  return result.value
}

export const PublicationVersion = Schema.Struct({
  name: Schema.String.check(Schema.makeFilter(value => /^\d{8}T\d{6}Z\.json$/.test(value))),
  sourceHash: Schema.String.check(Schema.makeFilter(value => /^[a-f0-9]{64}$/.test(value))),
})
export type PublicationVersion = typeof PublicationVersion.Type
export const PublicationSource = Schema.Struct({ version: PublicationVersion, content: Schema.String })
export const PublicationWrite = Schema.Union([
  Schema.Struct({ status: Schema.Literal("written"), version: PublicationVersion }),
  Schema.Struct({ status: Schema.Literal("changed"), latest: Schema.NullOr(PublicationVersion) }),
])
export type PublicationWrite = typeof PublicationWrite.Type
