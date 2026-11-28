import type { Plugin } from "@opencode/plugin/gui"
import { Rpc } from "@opencode/schema/rpc"
import { Schema } from "effect"
import type definition from "./index"

type Context = Parameters<Plugin.Setup<typeof definition>>[0]

const CopyPath = Schema.Struct({
  document_id: Schema.NonEmptyString,
  workflow_id: Schema.NonEmptyString,
  workflow_ids: Schema.optionalKey(Schema.Array(Schema.NonEmptyString)),
  path: Schema.String.check(Schema.isPattern(/^\/[^\r\n]+\.lgp$/i)),
  lastSave: Schema.Boolean,
})

export type CopyPath = typeof CopyPath.Type

export function samePackage(path: CopyPath, workflow: Pick<CopyPath, "document_id" | "workflow_id">) {
  return path.document_id === workflow.document_id
    && (path.workflow_id === workflow.workflow_id || path.workflow_ids?.includes(workflow.workflow_id) === true)
}

const PackageState = Rpc.define({
  id: "loginom.package-state",
  methods: {
    snapshot: {
      input: Schema.toStandardSchemaV1(Schema.Struct({ sessionID: Schema.NonEmptyString })),
      output: Schema.toStandardSchemaV1(Schema.Struct({ copy: Schema.optionalKey(Schema.NullOr(CopyPath)) })),
    },
  },
  events: {},
})

export async function readPackageCopy(
  ctx: Context,
  request: { serverID: string; sessionID: string; directory: string },
) {
  const server = ctx.servers.get(request.serverID)

  if (!server) return null
  const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(6000)])

  const state = await server.client
    .rpc(PackageState)
    .snapshot({ sessionID: request.sessionID }, { location: { directory: request.directory }, signal })
    .catch(() => undefined)

  return signal.aborted ? null : (state?.copy ?? null)
}

export async function copyText(ctx: Context, text: string) {
  try {
    await ctx.system.copy(text)

    if (ctx.signal.aborted) return
    ctx.toast.show({ variant: "success", icon: "circle-check", title: ctx.t("copy.done"), description: text })
  } catch {
    if (ctx.signal.aborted) return
    ctx.toast.show({ variant: "error", title: ctx.t("copy.failed") })
  }
}
