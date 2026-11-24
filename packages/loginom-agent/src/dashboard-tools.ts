// The dashboard's tools (B2.9e…g), ported from 0.4 `packages/opencode/src/tool/dashboard.ts`: the names, descriptions,
// inputs and results are 0.4's. The plugin registers them only in a dashboard's Location, whose hooks already confine
// every call: the profile, the paths and the chat's draft are checked before and after it (B2.9b…d). The dashboard
// package is loaded by the first call, as 0.4 loaded it only for a dashboard session.
import type { draftServer } from "@loginom-ai-agent/dashboard/draft/server"
import type { Info } from "@opencode/plugin/promise/tool"
import { Schema } from "effect"

const Parameters = Schema.Struct({})

/**
 * The tools of the dashboard whose work folder is the Location at `directory`; `resources` is the installation's
 * resource root (0.4: `LOGINOM_AI_AGENT_RESOURCES`). The draft server is the Location's own: its first draft starts it
 * and `close`, when the plugin unloads, stops it. 0.4 kept one for the whole process, which ended with the CLI run or
 * Desktop; the server process outlives a Location.
 */
export function dashboardTools(directory: string, resources: string | undefined) {
  const state: { server?: ReturnType<typeof draftServer>; closed?: boolean } = {}
  const serve = async (page: string) => {
    const { draftServer } = await import("@loginom-ai-agent/dashboard/draft/server")
    // A draft still building when the plugin unloaded must not start a server that nobody would close.
    if (state.closed) throw Error("Черновик остановлен. Попросите агента показать его снова.")
    return (state.server ??= draftServer(page).catch((error: unknown) => {
      state.server = undefined
      throw error
    }))
  }
  const draft: Info<typeof Parameters> = {
    name: "dashboard_draft",
    description:
      "Build the dashboard draft from src/ of this dashboard folder, serve it on localhost and check the page. Returns the link for the user and the check results. Takes no arguments.",
    input: Parameters,
    options: { codemode: false },
    execute: async (_input, call) => {
      const { dashboardResources } = await import("@loginom-ai-agent/dashboard/agent/resources")
      const { draftDashboard } = await import("@loginom-ai-agent/dashboard/agent/draft")
      const { outputText } = await import("@loginom-ai-agent/dashboard/agent/build")
      const output = await draftDashboard({
        work: directory,
        resources: dashboardResources(resources),
        signal: call.signal,
        server: serve,
      })
      return { content: outputText(Buffer.from(output)) }
    },
  }
  return {
    draft,
    close: async () => {
      state.closed = true
      await state.server?.then(
        (server) => server.close(),
        () => undefined,
      )
    },
  }
}
