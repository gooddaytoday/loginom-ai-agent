export * as SessionSkill from "./skill.js"

import type { Session } from "@opencode/schema/session"
import { Effect } from "effect"
import { Instance } from "../instance/service.js"
import { Permission } from "../permission.js"
import { Plugin } from "../plugin/service.js"
import { Skill } from "../skill.js"
import { SkillNotFoundError } from "./error.js"

export const get = Effect.fn("SessionSkill.get")(function* (input: { session: Session.Info; skill: Skill.ID }) {
  const instances = yield* Instance.Service
  const services = yield* Plugin.awaitActivation.pipe(
    Effect.andThen(Effect.all({ skills: Skill.Service, permission: Permission.Service })),
    instances.provide(input.session),
  )
  const skill = yield* services.skills.get(input.skill)
  if (!skill) return yield* new SkillNotFoundError({ skill: input.skill })
  // Fork seam U3 (CAT-06): direct activation honours the session's `skill` rules like the skill tool, without asking.
  yield* services.permission.assertNotDenied({ sessionID: input.session.id, action: "skill", resources: [skill.id] })
  return skill
})
