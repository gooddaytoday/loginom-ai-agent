import path from "path"
import { Effect, Schema } from "effect"
import { Ripgrep } from "@loginom-ai-agent/core/ripgrep"
import { FSUtil } from "@loginom-ai-agent/core/fs-util"
import { Skill } from "../skill"
import { Tool } from "./tool"
import DESCRIPTION from "./skill.txt"

export const Parameters = Schema.Struct({
  name: Schema.String.annotate({ description: "The name of the skill from available_skills" }),
})

export const SkillTool = Tool.define(
  "skill",
  Effect.gen(function* () {
    const skill = yield* Skill.Service
    const ripgrep = yield* Ripgrep.Service
    const fs = yield* FSUtil.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const info = yield* skill
            .require(params.name)
            .pipe(Effect.catchTag("Skill.NotFoundError", (error) => Effect.die(new Error(error.message))))

          yield* ctx.ask({
            permission: "skill",
            patterns: [params.name],
            always: [params.name],
            metadata: {},
          })

          const dir = path.dirname(info.location)
          const base = dir
          // Shipped skill resources must load offline without downloading an external search executable.
          const files =
            info.source === "bundled"
              ? (yield* fs.glob("**/*", { cwd: dir, dot: true, symlink: false }))
                  .filter((file) => path.basename(file) !== "SKILL.md")
                  .toSorted()
                  .slice(0, 10)
              : (yield* ripgrep.find({
                  cwd: dir,
                  pattern: "!**/SKILL.md",
                  hidden: true,
                  follow: false,
                  signal: ctx.abort,
                  limit: 10,
                })).map((file) => file.path)
          if (ctx.activate) yield* ctx.activate(info)

          return {
            title: `Loaded skill: ${info.name}`,
            output: [
              `<skill_content name="${info.name}">`,
              `# Skill: ${info.name}`,
              "",
              info.content.trim(),
              "",
              `Base directory for this skill: ${base}`,
              "Relative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.",
              "Note: file list is sampled.",
              "",
              "<skill_files>",
              files.map((file) => `<file>${path.resolve(dir, file)}</file>`).join("\n"),
              "</skill_files>",
              "</skill_content>",
            ].join("\n"),
            metadata: {
              name: info.name,
              dir,
            },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
