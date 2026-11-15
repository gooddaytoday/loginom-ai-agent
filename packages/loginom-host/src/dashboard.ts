import { Schema } from "effect"

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
