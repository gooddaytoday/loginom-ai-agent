import { Schema } from "effect"

export const WindowBounds = Schema.Struct({
  x: Schema.Int,
  y: Schema.Int,
  width: Schema.Int.check(Schema.isGreaterThan(0)),
  height: Schema.Int.check(Schema.isGreaterThan(0)),
})
export type WindowBounds = typeof WindowBounds.Type

const Session = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256))
export const WindowChat = Schema.Struct({ sessionID: Session })
export const WindowPlacement = Schema.Struct({ ...WindowChat.fields, bounds: WindowBounds })
export type WindowPlacement = typeof WindowPlacement.Type
export const WindowStatus = Schema.Literals(["focused", "focus-unconfirmed", "no-window"])
