import { Schema } from "effect"
import { SessionID } from "@opencode/schema/session-id"

export const PackagePath = Schema.String.check(
  Schema.isMaxLength(1024),
  Schema.isPattern(/^\/(?:[^/\\\x00-\x1f]+\/)*[^/\\\x00-\x1f]+\.lgp$/i),
  Schema.makeFilter((path: string) => !path.split("/").some((part) => part === "." || part === "..")),
)

export const PackageRecheck = Schema.Struct({ sessionID: SessionID, packagePath: PackagePath })
const LockMarker = Schema.Literals(["present", "not_observed", "unknown"])
export const PackageObservation = Schema.NullOr(Schema.Struct({
  packages: Schema.Array(Schema.Struct({ path: PackagePath, readOnly: Schema.Boolean })).check(Schema.isMaxLength(256)),
  lockMarker: Schema.optional(LockMarker),
}))

export const PackageAccess = Schema.Union([
  Schema.Struct({ packagePath: PackagePath, kind: Schema.Literals(["unavailable", "writable", "other_loginom_session"]) }),
  Schema.Struct({ packagePath: PackagePath, kind: Schema.Literal("read_only"), lockMarker: Schema.Literals(["not_observed", "unknown"]) }),
  Schema.Struct({ packagePath: PackagePath, kind: Schema.Literal("other_conversation"), sessionId: SessionID }),
])
export type PackageAccess = typeof PackageAccess.Type
