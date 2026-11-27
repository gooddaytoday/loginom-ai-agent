import { Schema } from "effect"

export const WindowSnapshot = Schema.Struct({
  openedAt: Schema.Int.check(Schema.isGreaterThan(0)),
  state: Schema.Literals(["open", "minimized", "busy"]),
  package: Schema.NullOr(
    Schema.Struct({
      name: Schema.NullOr(Schema.String),
      path: Schema.NullOr(Schema.String),
    }),
  ),
})
export type WindowSnapshot = typeof WindowSnapshot.Type

export const WindowList = Schema.Array(
  Schema.Struct({
    sessionID: Schema.NonEmptyString,
    generation: Schema.Int.check(Schema.isGreaterThan(0)),
    ...WindowSnapshot.fields,
  }),
)
