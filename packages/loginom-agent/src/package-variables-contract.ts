import { ReadStoredPackage } from "@loginom-ai-agent/loginom-host/package-folder"
import { Schema } from "effect"

const coverage = Schema.Literals(["complete", "partial", "unavailable"])
export const PackageVariables = Schema.Struct({
  source: Schema.Literals(["saved", "window"]),
  definitionsCoverage: coverage,
  usagesCoverage: coverage,
  definitions: Schema.NullOr(Schema.Array(Schema.Struct({ name: Schema.String, type: Schema.String }))),
  defaults: Schema.NullOr(Schema.Array(Schema.Struct({ name: Schema.String, value: Schema.String }))),
  usages: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      kind: Schema.Literals(["template", "binding"]),
      scope: Schema.Literal("control"),
      module: Schema.String,
      branch: Schema.Array(Schema.String),
      nodeID: Schema.String,
      nodeLabel: Schema.String,
      parameter: Schema.String,
    }),
  ),
})
export type PackageVariables = typeof PackageVariables.Type

const empty = Schema.toStandardSchemaV1(Schema.Struct({}))
export const packageVariablesRpc = {
  id: "loginom.package",
  methods: {
    variables: {
      input: Schema.toStandardSchemaV1(
        Schema.Union([
          Schema.Struct({ sessionID: Schema.NonEmptyString, localPath: Schema.optionalKey(Schema.NonEmptyString) }),
          ReadStoredPackage,
        ]),
      ),
      output: Schema.toStandardSchemaV1(Schema.Struct({ snapshot: Schema.NullOr(PackageVariables) })),
      errors: { invalid_session: empty, unreadable_package: empty },
    },
  },
  events: {},
}
