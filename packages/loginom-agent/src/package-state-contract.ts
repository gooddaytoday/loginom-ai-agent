import { Schema } from "effect"

const sessionID = { type: "string", minLength: 1 } as const
const path = { type: ["string", "null"] } as const
const lastSave = {
  type: "object",
  properties: { path: { type: "string" }, confirmedAt: { type: "integer" } },
  required: ["path", "confirmedAt"],
  additionalProperties: false,
} as const
const stateProperties = {
  open: { type: ["boolean", "null"] },
  path,
  modified: { type: ["boolean", "null"] },
  modifiedDetectedAt: { type: ["integer", "null"] },
  lastSave: { anyOf: [lastSave, { type: "null" }] },
} as const
const state = {
  type: "object",
  properties: stateProperties,
  required: Object.keys(stateProperties),
  additionalProperties: false,
} as const
const errors = { invalid_session: { type: "object", additionalProperties: false } } as const
const statuses = ["blocked", "clean", "saved", "closed", "cancelled"] as const
const actionOutput = {
  type: "object",
  properties: { status: { enum: statuses }, lastSave },
  required: ["status"],
  additionalProperties: false,
} as const

export const PackageCloseRecord = Schema.Union([
  Schema.Struct({ decision: Schema.Literal("save"), path: Schema.String }),
  Schema.Struct({ decision: Schema.Literal("discard") }),
])

const SaveReceipt = Schema.Struct({ path: Schema.String, confirmedAt: Schema.Int })

export const PackageSnapshot = Schema.Struct({
  open: Schema.NullOr(Schema.Boolean),
  path: Schema.NullOr(Schema.String),
  modified: Schema.NullOr(Schema.Boolean),
  modifiedDetectedAt: Schema.NullOr(Schema.Int),
  lastSave: Schema.NullOr(SaveReceipt),
})

export const PackageActionReply = Schema.Struct({
  status: Schema.Literals(statuses),
  lastSave: Schema.optional(SaveReceipt),
})

export const packageStateRpc = {
  id: "loginom.package-state",
  methods: {
    snapshot: {
      input: {
        type: "object",
        properties: { sessionID },
        required: ["sessionID"],
        additionalProperties: false,
      },
      errors,
      output: state,
    },
    active: {
      input: { type: "object", additionalProperties: false },
      output: {
        type: "array",
        items: {
          type: "object",
          properties: { sessionID, directory: path, state: { anyOf: [state, { type: "null" }] } },
          required: ["sessionID", "directory", "state"],
          additionalProperties: false,
        },
      },
    },
    save: {
      input: {
        type: "object",
        properties: { sessionID, path },
        required: ["sessionID", "path"],
        additionalProperties: false,
      },
      errors,
      output: actionOutput,
    },
    close: {
      input: {
        type: "object",
        properties: { sessionID, path, decision: { enum: ["clean", "save", "discard", "cancel"] } },
        required: ["sessionID", "path", "decision"],
        additionalProperties: false,
      },
      errors,
      output: actionOutput,
    },
  },
  events: {},
} as const
