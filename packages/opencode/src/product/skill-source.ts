import { verifyProductSkills } from "@loginom-ai-agent/loginom-host/bundled-skills"
import { isReservedSkillName, reservedSkillNames } from "@loginom-ai-agent/product/skills"
import { NamedError } from "@opencode-ai/core/util/error"
import { Effect } from "effect"
import type { EventV2Bridge } from "@/event-v2-bridge"

type Events = EventV2Bridge.Service["Service"]

const reportError = Effect.fnUntraced(function* (events: Events, message: string) {
  const { Session } = yield* Effect.promise(() => import("@/session/session"))
  yield* events.publish(Session.Event.Error, { error: new NamedError.Unknown({ message }).toObject() })
})

// Reserved names belong to the skills the product ships. Only the `bundled`
// source may declare them; every other source is refused, never shadowed.
export const skillSource = {
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

  // A damaged or incomplete resource directory yields no bundled skills and an
  // error event. It never falls back to another location.
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
