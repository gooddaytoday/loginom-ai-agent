import { SessionID } from "@opencode/schema/session-id"
import { Schema } from "effect"
import { StoragePackagePath } from "./package-folder"

export const ReadReferences = Schema.Struct({
  sessionID: SessionID,
  generation: Schema.Int.check(Schema.isGreaterThan(0)),
})
export type ReadReferences = typeof ReadReferences.Type

const Node = Schema.Struct({ guid: Schema.String, label: Schema.String })
export const Reference = Schema.Struct({
  node: Node,
  target: Node,
  copy: Schema.Literals(["node_and_outputs_present", "node_missing", "outputs_missing", "outputs_unknown"]),
})
export const ReferencingPackage = Schema.Struct({ path: StoragePackagePath, name: Schema.String, references: Schema.Array(Reference) })
const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const unchecked = ["inaccessible_folders", "version_compatibility", "schedules", "open_users"] as const
const Counters = {
  packages: Schema.Array(ReferencingPackage),
  packagesScanned: Count,
  foldersWithoutAccess: Count,
  notChecked: Schema.Array(Schema.Literals(unchecked)),
}
export const ReferenceResult = Schema.Union([
  Schema.Struct({ ...Counters, status: Schema.Literal("scanned"), complete: Schema.Boolean, timedOut: Schema.Boolean }),
  Schema.Struct({ ...Counters, status: Schema.Literal("not_checked"), complete: Schema.Literal(false),
    reason: Schema.Literals(["not_connected", "no_copy", "unavailable", "time_limit"]) }),
])
export type ReferenceResult = typeof ReferenceResult.Type

export function referencesNotChecked(reason: Extract<ReferenceResult, { status: "not_checked" }>["reason"]): ReferenceResult {
  return { status: "not_checked", reason, complete: false, packages: [], packagesScanned: 0,
    foldersWithoutAccess: 0, notChecked: unchecked }
}

export const referenceChecksExcluded = unchecked
