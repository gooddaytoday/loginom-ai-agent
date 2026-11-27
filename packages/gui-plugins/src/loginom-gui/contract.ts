import { Rpc } from "@opencode/schema/rpc"
import { Schema } from "effect"

const standard = Schema.toStandardSchemaV1

const session = Schema.Struct({ sessionID: Schema.NonEmptyString })

export const PackageSnapshot = Schema.Struct({
  open: Schema.NullOr(Schema.Boolean),
  path: Schema.NullOr(Schema.String),
  modified: Schema.NullOr(Schema.Boolean),
  modifiedDetectedAt: Schema.NullOr(Schema.Int),
  lastSave: Schema.NullOr(Schema.Struct({ path: Schema.String, confirmedAt: Schema.Int })),
})

export const PackageState = Rpc.define({
  id: "loginom.package-state",
  methods: { snapshot: { input: standard(session), output: standard(PackageSnapshot) } },
  events: { changed: { schema: standard(session) } },
})

const Window = Schema.Struct({
  windowID: Schema.NonEmptyString,
  sessionID: Schema.NonEmptyString,
  sessionTitle: Schema.optional(Schema.String),
  packageName: Schema.NullOr(Schema.String),
  path: Schema.NullOr(Schema.String),
  state: Schema.Literals(["open", "minimized"]),
  modified: Schema.optional(Schema.NullOr(Schema.Boolean)),
  busy: Schema.optional(Schema.Boolean),
  readOnly: Schema.optional(Schema.Boolean),
  openedAt: Schema.Int,
})

export type LoginomWindow = typeof Window.Type

export const WindowList = Schema.Struct({ windows: Schema.Array(Window) })

export const Windows = Rpc.define({
  id: "loginom.windows",
  methods: { list: { input: standard(Schema.Struct({})), output: standard(WindowList) } },
  events: { changed: { schema: standard(Schema.Struct({})) } },
})

export const FocusStatus = Schema.Literals(["focused", "focus-unconfirmed", "no-window"])

export const WindowFocus = Rpc.define({
  id: "loginom.window",
  methods: { show: { input: standard(session), output: standard(FocusStatus) } },
  events: {},
})
