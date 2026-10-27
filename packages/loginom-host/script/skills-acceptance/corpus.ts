import { Schema } from "effect"

const corpusSchema = Schema.Struct({
  schema_version: Schema.Literal("loginom-skills-routing.v1"),
  fixtures: Schema.Record(Schema.String, Schema.String),
  cases: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      group: Schema.String,
      prompt: Schema.String,
      input: Schema.String,
      fixture: Schema.optional(Schema.String),
      connection: Schema.optional(Schema.String),
      setup: Schema.optional(Schema.Unknown),
      followup: Schema.optional(Schema.Unknown),
      expected: Schema.Struct({ profile: Schema.String, result: Schema.Unknown }),
    }),
  ),
})

export const decodeAcceptanceCorpus = Schema.decodeUnknownSync(corpusSchema)
