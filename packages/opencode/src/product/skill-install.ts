import { Effect, Schema } from "effect"
import { relative, resolve } from "node:path"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { validateSkillFolder } from "@loginom-ai-agent/loginom-host/bundled-skills"
import { EffectBridge } from "@/effect/bridge"
import { InstanceState } from "@/effect/instance-state"
import { assertExternalDirectoryEffect } from "@/tool/external-directory"
import { Tool } from "@/tool/tool"

const Parameters = Schema.Struct({ action: Schema.Literal("validate"), source: Schema.String })

export const SkillInstallTool = Tool.define(
  "skill_install",
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    return {
      description: "Validate a portable Agent Skill folder by path. Reports format and resource diagnostics without installation.",
      parameters: Parameters,
      execute: (args: typeof Parameters.Type, ctx: Tool.Context) =>
        Effect.gen(function* () {
          ctx.abort.throwIfAborted()
          const instance = yield* InstanceState.context
          const bridge = yield* EffectBridge.make()
          const source = resolve(instance.directory, args.source)
          const directory = yield* fs.realPath(source).pipe(Effect.orElseSucceed(() => source))
          const authorizeRead = (paths: string[]) =>
            ctx.ask({
              permission: "read",
              patterns: paths.map((path) => relative(instance.worktree, path)),
              always: ["*"],
              metadata: { filepath: directory },
            })
          yield* ctx.ask({ permission: "skill_install", patterns: [args.action], always: [args.action], metadata: {} })
          yield* assertExternalDirectoryEffect(ctx, source, { kind: "directory" })
          if (directory !== source) yield* assertExternalDirectoryEffect(ctx, directory, { kind: "directory" })
          yield* authorizeRead([...new Set([source, directory])])
          const result = yield* Effect.tryPromise(() =>
            validateSkillFolder(directory, {
              authorizeRead: (paths) =>
                bridge.promise(authorizeRead(paths)).then(() => ctx.abort.throwIfAborted()),
            }),
          ).pipe(Effect.orDie)
          return {
            title: "Validate skill folder",
            output: JSON.stringify({ path: source, name: result.data?.name, errors: result.errors, warnings: result.warnings }),
            metadata: {},
          }
        }),
    }
  }),
)
