import path from "path"
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

export async function assertExternalDirectory(ctx: Tool.Context, target?: string, options?: Options) {
  return Effect.runPromise(assertExternalDirectoryEffect(ctx, target, options))
}
