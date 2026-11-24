// The dashboard's tools (B2.9e…g), ported from 0.4 `packages/opencode/src/tool/dashboard.ts`: the names, descriptions,
// inputs and results are 0.4's. The plugin registers them only in a dashboard's Location, whose hooks already confine
// every call: the profile, the paths and the chat's draft are checked before and after it (B2.9b…d). The dashboard
// package is loaded by the first call, as 0.4 loaded it only for a dashboard session.
import { realpath } from "node:fs/promises"
import { setTimeout } from "node:timers/promises"
import type { draftServer } from "@loginom-ai-agent/dashboard/draft/server"
import { hostErrorText } from "@loginom-ai-agent/loginom-host/errors"
import { SessionV1 } from "@loginom-ai-agent/loginom-host/session-v1"
import type { Plugin } from "@opencode/plugin"
import type { Info, ToolContext } from "@opencode/plugin/promise/tool"
import { Schema } from "effect"
import { ServiceHost } from "./host"

const Parameters = Schema.Struct({})

/**
 * The tools of the dashboard whose work folder is the Location at `directory`; `resources` is the installation's
 * resource root (0.4: `LOGINOM_AI_AGENT_RESOURCES`). The draft server is the Location's own: its first draft starts it
 * and `close`, when the plugin unloads, stops it. 0.4 kept one for the whole process, which ended with the CLI run or
 * Desktop; the server process outlives a Location. `session` asks the user (`permission`) and checks that a chat still
 * belongs to its folder's draft (`bound` throws when it does not, B2.9d).
 */
export function dashboardTools(
  directory: string,
  resources: string | undefined,
  session: {
    permission: Pick<Plugin.Context["permission"], "assert" | "list" | "reply">
    bound: (sessionID: string) => Promise<void>
  },
) {
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
  // The question of the Host's node and package (B2.9f): «Сохранять пакеты в Loginom» decides whether it is asked
  // (В-102, `permissions.ts`), and a refusal reaches `execute.after` as it is, so the turn goes on (B2.6b, B2.6c). 0.4
  // raced it with the call's abort; the plugin's `assert` outlives a stopped call, so a stop withdraws the call's open
  // question instead (the core's `reply` then declines the session's other open questions too, as for any decline).
  const ask = async (call: ToolContext, request: { resources: string[]; metadata: Record<string, unknown> }) => {
    const settled = { done: false }
    call.signal.throwIfAborted()
    const asking = session.permission
      .assert({
        sessionID: call.sessionID,
        agent: call.agent,
        action: "dashboard_publish",
        source: { type: "tool", messageID: call.messageID, id: call.id },
        ...request,
      })
      .finally(() => {
        settled.done = true
      })
    const withdraw = async () => {
      // The question may not be open yet: its rules and hooks are still being evaluated.
      while (!settled.done) {
        const open = await session.permission.list({ sessionID: call.sessionID }).catch(() => [])
        await Promise.all(
          open
            .filter((item) => item.source?.messageID === call.messageID && item.source.id === call.id)
            .map((item) =>
              session.permission
                .reply({ sessionID: call.sessionID, requestID: item.id, decision: "reject" })
                .catch(() => undefined),
            ),
        )
        await setTimeout(50)
      }
    }
    call.signal.addEventListener("abort", () => void withdraw(), { once: true })
    await asking.catch((error: unknown) => {
      call.signal.throwIfAborted()
      throw error
    })
    call.signal.throwIfAborted()
  }
  const publish: Info<typeof Parameters> = {
    name: "dashboard_publish",
    description:
      "Build this dashboard and send the approved sources to Loginom for publication. Request only when the user explicitly asks to publish. Takes no arguments.",
    input: Parameters,
    options: { codemode: false },
    execute: async (_input, call) => {
      const { dashboardResources } = await import("@loginom-ai-agent/dashboard/agent/resources")
      const { withDashboardStage } = await import("@loginom-ai-agent/dashboard/agent/folder")
      const { preparePublish, finishPublish, outputText } = await import("@loginom-ai-agent/dashboard/agent/publish")
      const result = (status: string, text: string) => ({ content: outputText(Buffer.from(status + ": " + text)) })
      const installed = dashboardResources(resources)
      const work = await realpath(directory)
      const prepared = await withDashboardStage(work, (operation) =>
        preparePublish({ work, operation, resources: installed, signal: call.signal }),
      )
      if (!prepared.ok) return result("failed", prepared.text)
      // The captured sources belong to the chat's draft (0.4 compared the session's marker).
      await session.bound(call.sessionID)
      const target = { origin: prepared.control.origin, binding: prepared.control.binding }
      const latest = await host(call, (lease) => lease.dashboardRead(target, call.signal)).catch((error: unknown) => {
        throw Error(hostErrorText(error))
      })
      const expected = latest?.version ?? null
      const base = prepared.control.base
      await ask(call, {
        resources: [prepared.control.nodeName, prepared.control.binding.packagePath],
        metadata: {
          sourceHash: prepared.publication.sourceHash,
          ...(expected && (base?.name !== expected.name || base.sourceHash !== expected.sourceHash)
            ? { dashboardConflict: { base: base ?? null, latest: expected } }
            : {}),
        },
      })
      // The folder may have been prepared again while the user answered: the approval sends nothing then.
      await session.bound(call.sessionID)
      const finished = await finishPublish({
        work,
        publication: prepared.publication,
        control: prepared.control,
        expected,
        signal: call.signal,
        publish: (request, signal) => host(call, (lease) => lease.dashboardPublish(request, signal)),
      }).catch((error: unknown) => ({ status: "failed", text: hostErrorText(error) }))
      return result(finished.status, finished.text)
    },
  }
  return {
    draft,
    publish,
    close: async () => {
      state.closed = true
      await state.server?.then(
        (server) => server.close(),
        () => undefined,
      )
    },
  }
}

/**
 * One request to the Host on a run of its own, bound to the dashboard's profile and released after it (0.4
 * `dashboardOperation`): a dashboard session leases no Host for its execution, and none is held while the user answers.
 */
async function host<T>(call: ToolContext, operation: (lease: ServiceHost.Lease) => Promise<T>) {
  call.signal.throwIfAborted()
  const lease = await ServiceHost.acquire(call.sessionID)
  if (!lease) throw Error("LOGINOM_HOST_NOT_READY")
  try {
    await lease.scope(
      "bind",
      { taskMessageID: SessionV1.MessageID.make(call.messageID), profile: "loginom-dashboard" },
      call.signal,
    )
    return await operation(lease)
  } finally {
    await ServiceHost.release(lease)
  }
}
