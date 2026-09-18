export * as ConfigPaths from "./paths"

import path from "path"
import { Flag } from "@loginom-ai-agent/core/flag/flag"
import { Global } from "@loginom-ai-agent/core/global"
import { unique } from "remeda"
import * as Effect from "effect/Effect"
import { FSUtil } from "@loginom-ai-agent/core/fs-util"

export const files = Effect.fn("ConfigPaths.projectFiles")(function* (
  name: string,
  directory: string,
  worktree?: string,
) {
  const afs = yield* FSUtil.Service
  return (yield* afs.up({
    targets: [`${name}.jsonc`, `${name}.json`],
    start: directory,
    stop: worktree,
  })).toReversed()
})

export const directories = Effect.fn("ConfigPaths.directories")(function* (directory: string, worktree?: string) {
  const afs = yield* FSUtil.Service
  return unique([
    Global.Path.config,
    ...(!Flag.LOGINOM_AI_AGENT_DISABLE_PROJECT_CONFIG
      ? yield* afs.up({
          targets: [".loginom-ai-agent"],
          start: directory,
          stop: worktree,
        })
      : []),
    ...(!process.env.LOGINOM_AI_AGENT_CLI_ROOT
      ? yield* afs.up({
          targets: [".loginom-ai-agent"],
          start: Global.Path.home,
          stop: Global.Path.home,
        })
      : []),
    ...(Flag.LOGINOM_AI_AGENT_CONFIG_DIR ? [Flag.LOGINOM_AI_AGENT_CONFIG_DIR] : []),
  ])
})

export function fileInDirectory(dir: string, name: string) {
  return [path.join(dir, `${name}.json`), path.join(dir, `${name}.jsonc`)]
}
