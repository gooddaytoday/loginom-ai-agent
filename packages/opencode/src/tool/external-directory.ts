import path from "path"
import { mkdirSync, writeFileSync } from "node:fs"
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
    ins.directory,
    path.isAbsolute(target) ? target : `${ins.directory}${path.sep}${target}`,
    options?.write,
  )
  if (denied)
    return yield* Effect.die(
      new PermissionV1.DeniedError({
        ruleset: [{ permission: "dashboard_path", pattern: denied, action: "deny" }],
      }),
    )
  if (options?.bypass || DashboardSession.isDashboardWork(ins.directory)) return false
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
  if (!work) return fs.writeWithDirs
  return (file: string, content: string | Uint8Array) => Effect.sync(() => {
    if (!DashboardSession.isDashboardWork(work)) throw Error("LOGINOM_SCOPE_DENIED")
    // The deletion can detach this folder while the edit permission is pending.
    withSnapshot(work, current => {
      if (!DashboardSession.isDashboardWork(current)) throw Error("LOGINOM_SCOPE_DENIED")
      const denied = DashboardSession.dashboardPathError(current, file, true)
      if (denied) throw new PermissionV1.DeniedError({
        ruleset: [{ permission: "dashboard_path", pattern: denied, action: "deny" }],
      })
      mkdirSync(path.dirname(file), { recursive: true })
      writeFileSync(file, content)
    })
  })
}

export async function assertExternalDirectory(ctx: Tool.Context, target?: string, options?: Options) {
  return Effect.runPromise(assertExternalDirectoryEffect(ctx, target, options))
}
