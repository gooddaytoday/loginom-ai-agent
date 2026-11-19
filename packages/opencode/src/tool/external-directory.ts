import path from "path"
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { withSnapshot } from "@loginom-ai-agent/dashboard/agent/folder"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { DashboardSession } from "@/product/dashboard-session"
import { Effect } from "effect"
import { InstanceState } from "@/effect/instance-state"
import type * as Tool from "./tool"
import { containsPath } from "../project/instance-context"
import { FSUtil } from "@opencode-ai/core/fs-util"

type Kind = "file" | "directory"

type Options = {
  bypass?: boolean
  kind?: Kind
  write?: boolean
}

export const assertExternalDirectoryEffect = Effect.fn("Tool.assertExternalDirectory")(function* (
  ctx: Tool.Context,
  target?: string,
  options?: Options,
) {
  if (!target) return false

  const ins = yield* InstanceState.context
  const denied = DashboardSession.dashboardPathError(
    ctx.dashboardWork ?? ins.directory,
    path.isAbsolute(target) ? target : `${ins.directory}${path.sep}${target}`,
    options?.write,
    ctx.dashboardWork !== undefined,
  )
  if (denied)
    return yield* Effect.die(
      new PermissionV1.DeniedError({
        ruleset: [{ permission: "dashboard_path", pattern: denied, action: "deny" }],
      }),
    )
  if (ctx.dashboardWork || options?.bypass || DashboardSession.isDashboardWork(ins.directory)) return false
  const full = process.platform === "win32" ? FSUtil.normalizePath(target) : target
  if (containsPath(full, ins)) return false

  const kind = options?.kind ?? "file"
  const dir = kind === "directory" ? full : path.dirname(full)
  const glob =
    process.platform === "win32"
      ? FSUtil.normalizePathPattern(path.join(dir, "*"))
      : path.join(dir, "*").replaceAll("\\", "/")

  yield* ctx.ask({
    permission: "external_directory",
    patterns: [glob],
    always: [glob],
    metadata: {
      filepath: full,
      parentDir: dir,
    },
  })
  return true
})

export function workspaceWriter(fs: FSUtil.Interface, ctx: Tool.Context, directory: string) {
  const work = ctx.dashboardWork ?? (DashboardSession.isDashboardWork(directory) ? directory : undefined)
  if (!work) return { write: fs.writeWithDirs, remove: fs.remove }
  const snapshotId = (control: string) => {
    const id: unknown = JSON.parse(readFileSync(path.join(control, "binding.json"), "utf8")).snapshotId
    if (typeof id !== "string" || !id) throw Error("LOGINOM_SCOPE_DENIED")
    return id
  }
  if (!DashboardSession.isDashboardWork(work)) throw Error("LOGINOM_SCOPE_DENIED")
  const captured = withSnapshot(work, (_directory, control) => snapshotId(control))
  const change = (file: string, apply: () => void) => Effect.sync(() => {
    if (!DashboardSession.isDashboardWork(work)) throw Error("LOGINOM_SCOPE_DENIED")
    withSnapshot(work, (current, control) => {
      if (snapshotId(control) !== captured) throw Error("LOGINOM_SCOPE_DENIED")
      const denied = DashboardSession.dashboardPathError(current, file, true, true)
      if (denied) throw new PermissionV1.DeniedError({
        ruleset: [{ permission: "dashboard_path", pattern: denied, action: "deny" }],
      })
      apply()
    })
  })
  return {
    write: (file: string, content: string | Uint8Array) => change(file, () => {
      mkdirSync(path.dirname(file), { recursive: true })
      writeFileSync(file, content)
    }),
    remove: (file: string) => change(file, () => unlinkSync(file)),
  }
}

export async function assertExternalDirectory(ctx: Tool.Context, target?: string, options?: Options) {
  return Effect.runPromise(assertExternalDirectoryEffect(ctx, target, options))
}
