import { Effect, Schema } from "effect"
import { dashboardResources } from "@loginom-ai-agent/dashboard/agent/resources"
import { draftDashboard } from "@loginom-ai-agent/dashboard/agent/draft"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Session } from "@/session/session"
import { Tool } from "./tool"

const Parameters = Schema.Struct({})

export const DashboardDraftTool = Tool.define(
  "dashboard_draft",
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const flags = yield* RuntimeFlags.Service
    return {
      description:
        "Build the dashboard draft from src/ of this dashboard folder, serve it on localhost and check the page. Returns the link for the user and the check results. Takes no arguments.",
      parameters: Parameters,
      execute: (_params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const session = yield* sessions.getForExecution(ctx.sessionID)
          const resources = dashboardResources(flags.loginomResources)
          const output = yield* Effect.promise(() => draftDashboard({ work: session.directory, resources, signal: ctx.abort }))
          return { title: "Черновик dashboard", output, metadata: { truncated: false } }
        }).pipe(Effect.orDie),
    }
  }),
)
