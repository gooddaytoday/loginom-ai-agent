import { SessionID } from "@opencode/schema/session-id"
import { Schema } from "effect"
import { PackagePath } from "./package-access"

export const CopyRequest = Schema.Union([
  Schema.Struct({ action: Schema.Literals(["save-version", "discard"]) }),
  Schema.Struct({ action: Schema.Literal("undo-save"), path: PackagePath }),
  Schema.Struct({ action: Schema.Literal("replace-original"), confirmed: Schema.Literal(true) }),
  Schema.Struct({ action: Schema.Literal("restore-previous"), backupPath: PackagePath }),
])
export type CopyRequest = typeof CopyRequest.Type

export const CopyBusy = Schema.Union([
  Schema.Struct({ packagePath: PackagePath, kind: Schema.Literal("other_conversation"), sessionID: SessionID }),
  Schema.Struct({ packagePath: PackagePath, kind: Schema.Literal("other_loginom_session") }),
  Schema.Struct({
    packagePath: PackagePath,
    kind: Schema.Literal("read_only"),
    lockMarker: Schema.Literals(["not_observed", "unknown"]),
  }),
])

export const CopyExists = Schema.Struct({ path: PackagePath })
export const CopyEmpty = Schema.Struct({})
const CopyFailures = Schema.Union([
  Schema.Struct({ code: Schema.Literal("package_busy"), data: CopyBusy }),
  Schema.Struct({ code: Schema.Literal("path_exists"), data: CopyExists }),
  Schema.Struct({ code: Schema.Literals(["access_denied", "copy_missing", "not_applied", "package_too_large", "state_check_required"]), data: CopyEmpty }),
])
export const CopyReply = Schema.Union([
  Schema.Struct({ output: Schema.Unknown }),
  Schema.Struct({ failure: CopyFailures }),
])

export const CopyVersion = Schema.Struct({ path: PackagePath, name: Schema.NonEmptyString })
export const CopyReplacement = Schema.Struct({ path: PackagePath, backupPath: PackagePath })
export const CopyRestore = Schema.Struct({ path: PackagePath })
