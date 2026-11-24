import { Effect, Schema } from "effect"
import { relative, resolve } from "node:path"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Flock } from "@opencode-ai/core/util/flock"
import { Global } from "@opencode-ai/core/global"
import { validateSkillFolder } from "@loginom-ai-agent/loginom-host/bundled-skills"
import { prepareLocalSkill } from "@loginom-ai-agent/loginom-host/skill-install/index"
import { EffectBridge } from "@/effect/bridge"
import { InstanceState } from "@/effect/instance-state"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { assertExternalDirectoryEffect } from "@/tool/external-directory"
import { Skill } from "@/skill"
import { Tool } from "@/tool/tool"

const Parameters = Schema.Struct({ action: Schema.Literals(["validate", "install"]), source: Schema.NonEmptyString })

const literal = (text: string) =>
  JSON.stringify(text).replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, (char) => `\\u{${char.codePointAt(0)!.toString(16)}}`)

export const SkillInstallTool = Tool.define(
  "skill_install",
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const flags = yield* RuntimeFlags.Service
    const skills = yield* Skill.Service
    return {
      description: "Validate a portable Agent Skill folder without installing it. Use install only when the user asks to copy a skill from a local folder; the product will request one-time approval.",
      parameters: Parameters,
      execute: (args: typeof Parameters.Type, ctx: Tool.Context) =>
        Effect.gen(function* () {
          ctx.abort.throwIfAborted()
          if (args.action === "install" && flags.disableExternalSkills)
            throw Error("External skills are disabled in this Loginom process.")
          const instance = yield* InstanceState.context
          const bridge = yield* EffectBridge.make()
          const source = args.source.startsWith("~/") ? resolve(Global.Path.home, args.source.slice(2)) : resolve(instance.directory, args.source)
          const directory = yield* fs.realPath(source).pipe(Effect.orElseSucceed(() => source))
          const askPaths = (permission: "read" | "edit", paths: string[], filepath: string) =>
            ctx.ask({
              permission,
              patterns: paths.map((path) => relative(instance.worktree, path)),
              always: ["*"],
              metadata: { filepath },
            })
          const authorizeRead = (paths: string[]) =>
            bridge.promise(askPaths("read", paths, directory)).then(() => ctx.abort.throwIfAborted())
          if (args.action === "validate")
            yield* ctx.ask({ permission: "skill_install", patterns: [args.action], always: [args.action], metadata: {} })
          yield* assertExternalDirectoryEffect(ctx, source, { kind: "directory" })
          if (directory !== source) yield* assertExternalDirectoryEffect(ctx, directory, { kind: "directory" })
          yield* askPaths("read", [...new Set([source, directory])], directory)
          if (args.action === "validate") {
            const result = yield* Effect.tryPromise(() =>
              validateSkillFolder(directory, { authorizeRead }),
            ).pipe(Effect.orDie)
            return {
              title: "Validate skill folder",
              output: JSON.stringify({ path: source, name: result.data?.name, errors: result.errors, warnings: result.warnings }),
              metadata: {},
            }
          }

          return yield* Effect.acquireUseRelease(
            Effect.tryPromise(() => prepareLocalSkill(directory, Global.Path.home, authorizeRead, {
              signal: ctx.abort,
              lock: (name, control, run) => Flock.withLock("skill-install:" + name, run, { dir: control, signal: ctx.abort }),
            })),
            (candidate) => Effect.gen(function* () {
              const active = yield* skills.get(candidate.name)
              const override = active?.source === "project" || active?.source === "config" || active?.source === "url"
                ? active.location
                : undefined
              const result = (status: string) => ({
                title: "Install skill",
                output: JSON.stringify({ status, name: candidate.name, path: candidate.path, warnings: candidate.warnings, override }),
                metadata: {},
              })
              let previous = candidate.previous
              while (true) {
                if (previous?.digest === candidate.digest) return result("already-installed")
                yield* assertExternalDirectoryEffect(ctx, candidate.path, { kind: "directory", write: true })
                yield* askPaths("edit", [...new Set([...candidate.paths, ...(previous?.paths ?? [])])], candidate.path)
                yield* ctx.ask({
                  permission: "skill_install",
                  patterns: [candidate.name],
                  always: [],
                  metadata: {
                    operationId: candidate.id,
                    skillInstall: [
                      (previous ? "Замена скилла " : "Установка скилла ") + literal(candidate.name),
                      "Источник: " + literal(source),
                      ...(previous ? ["Текущая ревизия: " + previous.digest] : []),
                      "Ревизия копии: " + candidate.digest,
                      "Описание автора: " + literal(candidate.description),
                      "Папка установки: " + literal(candidate.path),
                      "Скилл будет доступен другим агентам, которые используют ~/.agents/skills.",
                      ...candidate.warnings.map((warning) => "Замечание: " + literal(warning)),
                    ],
                  },
                })
                const publication = yield* Effect.tryPromise(() => candidate.publish(previous))
                if (typeof publication === "string") return result(publication)
                previous = publication.previous
              }
            }),
            (candidate) => Effect.tryPromise(candidate.dispose).pipe(Effect.catch(() => Effect.logWarning("Could not remove the skill staging folder"))),
          ).pipe(Effect.orDie)
        }),
    }
  }),
)
