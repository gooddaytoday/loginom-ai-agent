import { Rpc } from "@opencode/schema/rpc"
import { Schema } from "effect"

const standard = Schema.toStandardSchemaV1

export const Format = Schema.Literals(["pdf", "docx", "md"])
export type Format = typeof Format.Type

export const documentName = (filename: string, format: Format) => `${filename.slice(0, -4)} — описание.${format}`

export function documentationPermissions(filename: string, formats: readonly Format[]) {
  return [
    { action: "external_directory", resource: "*", effect: "deny" },
    { action: "edit", resource: "*", effect: "deny" },
    { action: "edit", resource: ".work/package-docs/**", effect: "allow" },
    ...formats.map((format) => ({
      action: "edit",
      resource: documentName(filename, format),
      effect: "allow" as const,
    })),
  ] as const
}

export const Runner = Rpc.define({
  id: "loginom.runner",
  methods: {
    ready: {
      input: standard(Schema.Struct({})),
      output: standard(Schema.Struct({})),
    },
    prepareDocumentation: {
      input: standard(Schema.Struct({ packagePath: Schema.String })),
      output: standard(Schema.Struct({ directory: Schema.String, filename: Schema.String })),
    },
    finishDocumentation: {
      input: standard(Schema.Struct({ directory: Schema.String, keep: Schema.Boolean })),
      output: standard(Schema.Struct({})),
    },
    start: {
      input: standard(
        Schema.Struct({
          sessionID: Schema.String,
          profile: Schema.Literals(["package-docs", "loginom-automation"]),
          text: Schema.String,
          documentationFile: Schema.optionalKey(Schema.String),
          customDocumentation: Schema.optionalKey(Schema.Boolean),
        }),
      ),
      output: standard(Schema.Struct({ granted: Schema.Boolean })),
    },
  },
  events: {},
})

export async function waitForRunner(ready: () => Promise<unknown>, signal?: AbortSignal) {
  const deadline = Date.now() + 5_000
  for (;;) {
    signal?.throwIfAborted()
    try {
      await ready()
      return
    } catch (error) {
      if (
        Date.now() >= deadline ||
        !error ||
        typeof error !== "object" ||
        !("type" in error) ||
        error.type !== "rpc.unavailable"
      )
        throw error
      await new Promise((resolve) => setTimeout(resolve, 80))
    }
  }
}
