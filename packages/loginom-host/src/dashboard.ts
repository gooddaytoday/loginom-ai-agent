import { Schema } from "effect"
import { validPublicationSet } from "../../loginom-runtime/src/dashboard-storage.mjs"

export const DashboardBinding = Schema.Struct({
  packagePath: Schema.String,
  workflowGuid: Schema.String,
  nodeGuid: Schema.String,
})
export type DashboardBinding = typeof DashboardBinding.Type
export const DashboardRead = Schema.Struct({ origin: Schema.String, generation: Schema.Number, binding: DashboardBinding })
export type DashboardRead = typeof DashboardRead.Type
export const PublicationRef = Schema.Struct({ name: Schema.String, sourceHash: Schema.String })
export type PublicationRef = typeof PublicationRef.Type
export const PublicationSource = Schema.Struct({ version: PublicationRef, content: Schema.String })
export type PublicationSource = typeof PublicationSource.Type
export const PublicationWrite = Schema.Union([
  Schema.Struct({ status: Schema.Literal("written"), version: PublicationRef }),
  Schema.Struct({ status: Schema.Literal("changed"), latest: Schema.NullOr(PublicationRef) }),
])
export type PublicationWrite = typeof PublicationWrite.Type
export const DashboardOperation = Schema.Struct({ origin: Schema.String, binding: DashboardBinding })
export type DashboardOperation = typeof DashboardOperation.Type
export const DashboardPublish = Schema.Struct({ ...DashboardRead.fields, content: Schema.String, expected: Schema.NullOr(PublicationRef) })
export type DashboardPublish = typeof DashboardPublish.Type

export const PublicationSet = Schema.Array(PublicationRef).check(Schema.makeFilter(validPublicationSet))
export const DashboardVersionList = Schema.Struct({
  generation: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  versions: PublicationSet,
})
export type DashboardVersionList = typeof DashboardVersionList.Type
export const DashboardDelete = Schema.Struct({ ...DashboardRead.fields, expected: PublicationSet })
export type DashboardDelete = typeof DashboardDelete.Type

const ConfirmedRemoved = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
export const DashboardDeleteResult = Schema.Union([
  Schema.Struct({ status: Schema.Literal("empty") }),
  Schema.Struct({ status: Schema.Literal("changed"), remaining: PublicationSet, confirmedRemoved: ConfirmedRemoved }),
  Schema.Struct({
    status: Schema.Literal("failed"),
    reason: Schema.Literals([
      "DASHBOARD_ACCESS_DENIED",
      "DASHBOARD_DELETE_BUSY",
      "DASHBOARD_STORAGE_UNAVAILABLE",
      "DASHBOARD_DELETE_UNKNOWN",
    ]),
    confirmedRemoved: ConfirmedRemoved,
    remaining: Schema.optional(PublicationSet),
  }),
])
export type DashboardDeleteResult = typeof DashboardDeleteResult.Type
export const decodeDashboardDeleteResult = Schema.decodeUnknownOption(DashboardDeleteResult, { onExcessProperty: "error" })
