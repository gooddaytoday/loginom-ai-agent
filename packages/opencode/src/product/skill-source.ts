import { verifyProductSkills } from "@loginom-ai-agent/loginom-host/bundled-skills"
import { isReservedSkillName, reservedSkillNames } from "@loginom-ai-agent/product/skills"
import { NamedError } from "@opencode-ai/core/util/error"
import { Effect } from "effect"
import { createHash } from "node:crypto"
import { readFile, realpath, stat } from "node:fs/promises"
import { join } from "node:path"
import { Glob } from "@opencode-ai/core/util/glob"
import type { EventV2Bridge } from "@/event-v2-bridge"

const externalPattern = "skills/**/SKILL.md"
const agentsDirectory = ".agents"

type Events = EventV2Bridge.Service["Service"]

const reportError = Effect.fnUntraced(function* (events: Events, message: string) {
  const { Session } = yield* Effect.promise(() => import("@/session/session"))
  yield* events.publish(Session.Event.Error, { error: new NamedError.Unknown({ message }).toObject() })
})

export const skillSource = {
  agentsDirectory,
  externalPattern,

  revision: Effect.fnUntraced(function* (home: string) {
    return yield* Effect.tryPromise(async () => {
      const root = join(home, agentsDirectory)
      const info = await stat(root).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error
      })
      if (!info?.isDirectory()) return ""
      const digest = createHash("sha256")
      const matches = await Glob.scan(externalPattern, {
        cwd: root, absolute: true, include: "file", symlink: true, dot: true,
      })
      for (const file of matches.toSorted()) {
        const resolved = await realpath(file)
        digest.update(JSON.stringify([file, resolved, createHash("sha256").update(await readFile(resolved)).digest("hex")]))
      }
      return digest.digest("hex")
    }).pipe(
      Effect.catch(() => Effect.logWarning("Could not refresh user skill catalog").pipe(Effect.as(undefined))),
    )
  }),

  commandParts: (body: string, args: string) =>
    [body, ...(args.trim() ? [args] : [])].map((text) => ({ type: "text" as const, text })),

  isReserved: isReservedSkillName,

  admits: (name: string, source: string | undefined) => source === "bundled" || !isReservedSkillName(name),

  refuseSkill: Effect.fnUntraced(function* (events: Events, input: { name: string; location: string }) {
    yield* Effect.logWarning("ignored reserved product skill from an untrusted source", { skill: input.location })
    yield* reportError(
      events,
      `Ignored external skill '${input.name}': this name is reserved for a bundled Loginom skill.`,
    )
  }),

  refuseCommand: Effect.fnUntraced(function* (events: Events, input: { name: string; source: "config" | "MCP" }) {
    yield* Effect.logWarning("ignored reserved product command from an external source", input)
    yield* reportError(
      events,
      `Ignored external command '${input.name}' from ${input.source}: this name is reserved for a bundled Loginom skill.`,
    )
  }),

  bundled: Effect.fnUntraced(function* (resources: string, events: Events) {
    return yield* Effect.tryPromise(() => verifyProductSkills(resources)).pipe(
      Effect.catch(
        Effect.fnUntraced(function* () {
          yield* reportError(
            events,
            "Bundled skills are unavailable. Verify the Loginom resource path or reinstall the application.",
          )
          yield* Effect.logWarning("bundled skill verification failed")
          return []
        }),
      ),
    )
  }),

  notFoundHint: (name: string) =>
    reservedSkillNames.some((reserved) => reserved === name)
      ? " Bundled skills are unavailable. Verify the Loginom resource path or reinstall the application."
      : "",

  // Bundled product skills run in the caller's session, not in a subtask.
  commandSubtask: (skill: { name: string; source?: string }) =>
    skill.source === "bundled" && isReservedSkillName(skill.name) ? (false as const) : undefined,
}
