import { Effect, Schema } from "effect"
import { relative, resolve } from "node:path"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Flock } from "@opencode-ai/core/util/flock"
import { Global } from "@opencode-ai/core/global"
import { validateSkillFolder } from "@loginom-ai-agent/loginom-host/bundled-skills"
import { githubSkillURL, prepareGitHubSkill } from "@loginom-ai-agent/loginom-host/skill-install/github"
import { prepareLocalSkill } from "@loginom-ai-agent/loginom-host/skill-install/index"
import { Command } from "@/command"
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
    const commands = yield* Command.Service
    return {
      description: "Validate a portable Agent Skill folder without installing it. For a requested installation, pass a local folder or an HTTPS GitHub URL. If several candidates are returned, ask the user to choose and pass its exact returned URL. Publication requires one-time approval.",
      parameters: Parameters,
      execute: (args: typeof Parameters.Type, ctx: Tool.Context) =>
        Effect.gen(function* () {
          ctx.abort.throwIfAborted()
          if (args.action === "install" && flags.disableExternalSkills)
            throw Error("External skills are disabled in this Loginom process.")
          const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(args.source)
          if (args.action === "validate" && url)
            return {
              title: "Validate skill folder",
              output: JSON.stringify({ errors: [{
                code: "LOGINOM_SKILL_LOCAL_FOLDER_REQUIRED",
                message: 'Validation takes a local folder. For a GitHub repository or tree URL, use action: "install".',
              }], warnings: [] }),
              metadata: {},
            }
          const instance = yield* InstanceState.context
          const bridge = yield* EffectBridge.make()
          const withAbort = <A>(effect: Effect.Effect<A>) =>
            Effect.tryPromise({
              try: () => bridge.promise(effect, ctx.abort),
              catch: (error) => error,
            }).pipe(Effect.orDie)
          const github = url ? githubSkillURL(args.source) : undefined
          const source = github ?? (args.source.startsWith("~/") ? resolve(Global.Path.home, args.source.slice(2)) : resolve(instance.directory, args.source))
          const directory = github ? source : yield* fs.realPath(source).pipe(Effect.orElseSucceed(() => source))
          const askPaths = (permission: "read" | "edit", paths: string[], filepath: string) =>
            ctx.ask({
              permission,
              patterns: paths.map((path) => relative(instance.worktree, path)),
              always: ["*"],
              metadata: { filepath },
            })
          const authorizeRead = (paths: string[]) =>
            bridge.promise(askPaths("read", paths, directory), ctx.abort).then(() => ctx.abort.throwIfAborted())
          if (args.action === "validate")
            yield* withAbort(ctx.ask({ permission: "skill_install", patterns: [args.action], always: [args.action], metadata: {} }))
          if (github) {
            yield* withAbort(ctx.ask({ permission: "webfetch", patterns: [github], always: [github], metadata: { url: github } }))
          } else {
            yield* withAbort(assertExternalDirectoryEffect(ctx, source, { kind: "directory" }))
            if (directory !== source)
              yield* withAbort(assertExternalDirectoryEffect(ctx, directory, { kind: "directory" }))
            yield* withAbort(askPaths("read", [...new Set([source, directory])], directory))
          }
          if (args.action === "validate") {
            const result = yield* Effect.tryPromise({
              try: () => validateSkillFolder(directory, { authorizeRead }),
              catch: (error) => error,
            }).pipe(Effect.orDie)
            return {
              title: "Validate skill folder",
              output: JSON.stringify({ path: source, name: result.data?.name, errors: result.errors, warnings: result.warnings }),
              metadata: {},
            }
          }

          const staging = {
            signal: ctx.abort,
            lock: <T>(name: string, control: string, run: () => Promise<T>) =>
              Flock.withLock("skill-install:" + name, run, { dir: control, signal: ctx.abort }),
            authorizeInstalled: (path: string, resources: string[]) =>
              bridge.promise(Effect.gen(function* () {
                if (resources.includes(path)) yield* assertExternalDirectoryEffect(ctx, path, { kind: "directory" })
                yield* askPaths("read", resources, path)
              }), ctx.abort).then(() => ctx.abort.throwIfAborted()),
          }
          return yield* Effect.acquireUseRelease(
            Effect.tryPromise({
              try: async () => github
                ? prepareGitHubSkill(github, Global.Path.home, staging)
                : { candidate: await prepareLocalSkill(directory, Global.Path.home, authorizeRead, staging), sha: undefined, directory: undefined, alternatives: undefined },
              catch: (error) => error,
            }),
            (prepared) => Effect.gen(function* () {
              const candidate = prepared.candidate
              if (!candidate) return {
                title: "Choose a skill",
                output: JSON.stringify({ status: "choose", sha: prepared.sha, candidates: prepared.alternatives, message: "Choose a self-contained folder. A parent with nested skills cannot be installed as one skill." }),
                metadata: {},
              }
              const active = yield* skills.get(candidate.name)
              const override = active?.source === "project" || active?.source === "config" || active?.source === "url"
                ? active.location
                : undefined
              const command = yield* commands.get(candidate.name)
              const warnings = command && command.source !== "skill"
                ? [...candidate.warnings, `/${candidate.name} still runs the existing ${command.source === "mcp" ? "MCP prompt" : "command"}.`]
                : candidate.warnings
              const result = (status: string) => ({
                title: "Install skill",
                output: JSON.stringify({ status, name: candidate.name, path: candidate.path, sha: prepared.sha, warnings, override }),
                metadata: {},
              })
              let previous = candidate.previous
              while (true) {
                if (previous?.digest === candidate.digest) return result("already-installed")
                yield* withAbort(assertExternalDirectoryEffect(ctx, candidate.path, { kind: "directory", write: true }))
                yield* withAbort(askPaths("edit", [...new Set([...candidate.paths, ...(previous?.paths ?? [])])], candidate.path))
                yield* withAbort(ctx.ask({
                  permission: "skill_install",
                  patterns: [candidate.name],
                  always: [],
                  metadata: {
                    operationId: candidate.id,
                    skillInstall: [
                      (previous ? "Замена скилла " : "Установка скилла ") + literal(candidate.name),
                      "Источник: " + literal(source),
                      ...(prepared.sha ? ["GitHub SHA: " + prepared.sha, "Каталог в репозитории: " + literal(prepared.directory ?? ".")] : []),
                      ...(previous ? ["Текущая ревизия: " + previous.digest] : []),
                      "Ревизия копии: " + candidate.digest,
                      "Описание автора: " + literal(candidate.description),
                      "Папка установки: " + literal(candidate.path),
                      "Скилл будет доступен другим агентам, которые используют ~/.agents/skills.",
                      ...warnings.map((warning) => "Замечание: " + literal(warning)),
                    ],
                  },
                }))
                const publication = yield* Effect.tryPromise({ try: () => candidate.publish(previous), catch: (error) => error })
                if (typeof publication === "string") return result(publication)
                previous = publication.previous
              }
            }),
            (prepared) => prepared.candidate
              ? Effect.tryPromise(prepared.candidate.dispose).pipe(Effect.catch(() => Effect.logWarning("Could not remove the skill staging folder")))
              : Effect.void,
          ).pipe(Effect.orDie)
        }),
    }
  }),
)
