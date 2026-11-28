import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js"
import type { SessionInfo } from "@opencode/client/promise"
import { useQuery } from "@tanstack/solid-query"
import { displayName } from "@opencode/ui/project-avatar"
import { ShellNavigation, type NavigationSession } from "@opencode/plugin/gui/builtin"
import { homeSessionsQuery } from "../../home/sessions/queries"
import { useLanguage } from "@/runtime/i18n/language"
import { ServerConnection } from "@/runtime/server/registry"
import { useGlobal, type ServerCtx } from "@/runtime/server/runtime"
import { sessionLabel } from "@/session/title"
import { sessionStatus } from "@/shell/layout/project-avatar-state"
import { setSidebarConversationActivity } from "@/shell/sidebar-peek"
import { useLayout } from "@/shell/state/layout"
import { createProjectSessionActions } from "@/shell/tabs/project-sessions"
import { useTabs, type DraftTab, type Tab } from "@/shell/tabs/tabs"
import { mergeSidebarSessions } from "@/shell/titlebar/sidebar-sessions"
import { projectSettingsKey, useSettings } from "@/settings/model"
import { pathKey } from "@/workspaces/path-key"
import { usePluginHost } from "./host"
import { Contribution } from "./render"

export function useShellNavigation() {
  const host = usePluginHost()

  return () => host.items(ShellNavigation)[0]
}

export function useManagedNavigationConnection() {
  const navigation = useShellNavigation()
  const global = useGlobal()
  const layout = useLayout()
  const tabs = useTabs()

  return createMemo(() => {
    if (!navigation()) return

    const route = layout.route()
    let server = layout.home.selection().server

    if (route.type === "session") server = route.server

    if (route.type === "draft") {
      const draft = tabs.store.find((tab) => tab.type === "draft" && tab.draftID === route.draftID)

      if (!draft) return
      server = draft.server
    }

    const connections = global.servers.list()
    const conn = server ? connections.find((item) => ServerConnection.key(item) === server) : connections[0]

    return conn?.type === "sidecar" ? conn : undefined
  })
}

export function hiddenWorkspace(ctx: ServerCtx | undefined, directory: string | undefined, projectID?: string) {
  if (!ctx || !directory) return

  const id = projectID ?? ctx.data.location.info({ directory })?.project.id
  const key = pathKey(directory)

  const project =
    (id ? ctx.data.project.get(id) : undefined) ??
    ctx.data.project.list({ includeHidden: true }).find((item) => pathKey(item.canonical) === key)

  return project ? project.experimental?.hidden === true : undefined
}

export async function forgetNavigationWorkspace(ctx: ServerCtx, directory: string, hiddenOnly = true) {
  const signal = AbortSignal.timeout(10_000)
  const key = pathKey(directory)
  const matches = (project: { canonical: string }) => pathKey(project.canonical) === key

  const project =
    ctx.data.project.list({ includeHidden: true }).find(matches) ??
    (await ctx.sdk.api.experimental.project.list({ signal })).find(matches)

  if (!project || (hiddenOnly && !project.experimental?.hidden)) return

  await ctx.sdk.api.experimental.project.forget(
    { projectID: project.id, includeVisible: hiddenOnly ? undefined : true },
    { signal },
  )
  const remaining = await ctx.sdk.api.experimental.project.list({ signal })

  if (!remaining.some((item) => item.id === project.id)) ctx.data.project.forget(project.id)
}

export async function registerNavigationWorkspace(ctx: ServerCtx, input: { directory: string; hidden: boolean }) {
  const project = await ctx.sdk.api.experimental.project.register({
    directory: input.directory,
    experimental: { hidden: input.hidden },
  })

  ctx.data.project.remember(project)
}

export function useDiscardNavigationDraft() {
  const navigation = useShellNavigation()
  const global = useGlobal()

  return (tab: DraftTab) => {
    const policy = navigation()?.value
    const ctx = global.serverCtx(tab.server)

    if (!policy || !ctx || tab.server !== ServerConnection.Key.make("sidecar")) return

    void policy
      .discardDraft({
        directory: tab.directory,
        forget: () => forgetNavigationWorkspace(ctx, tab.directory),
      })
      .catch(() => undefined)
  }
}

export function PluginNavigation(props: { connection: ServerConnection.Sidecar; tab?: Tab; onNavigate?: () => void }) {
  const item = useShellNavigation()
  const global = useGlobal()
  const language = useLanguage()
  const settings = useSettings()
  const layout = useLayout()
  const tabs = useTabs()
  const actions = createProjectSessionActions()
  const key = () => ServerConnection.key(props.connection)
  const ctx = () => global.serverCtx(key())
  const [projectSessions, setProjectSessions] = createSignal(new Map<string, SessionInfo[]>())

  const query = useQuery(() => ({
    ...homeSessionsQuery(props.connection, ctx()),
    enabled: ctx()?.sdk.connection.status() === "connected",
  }))

  createEffect(() => {
    const current = ctx()

    if (current?.sdk.connection.status() === "connected")
      void current.data.project.sync({ includeHidden: true }).catch(() => undefined)
  })

  const sessions = createMemo(() => {
    const current = ctx()

    if (!current) return []

    const fetched = [...(query.data?.() ?? []), ...[...projectSessions().values()].flat()]

    return current.data.session.apply(mergeSidebarSessions(fetched, current.data.session.known()))
  })

  if (!props.onNavigate) onCleanup(() => setSidebarConversationActivity(undefined))

  const openProject = (directory: string) => {
    layout.home.setSelection({ server: key(), directory })

    if (layout.route().type !== "home") tabs.toggleHome({ home: false, current: props.tab })
    props.onNavigate?.()
  }

  return (
    <Show when={item()} keyed>
      {(entry) => (
        <Contribution plugin={entry.plugin}>
          {() =>
            entry.value.render({
              get projects() {
                return (ctx()?.projects.used() ?? []).map((project) => ({
                  id: project.id,
                  directory: project.worktree,
                  title: displayName(project),
                }))
              },
              get sessions(): NavigationSession[] {
                const current = ctx()

                if (!current) return []

                return sessions().map((session) => ({
                  id: session.id,
                  title: sessionLabel(session),
                  directory: current.projects.forSession(session)?.worktree ?? session.location.directory,
                  created: session.time.created,
                  get hiddenProject() {
                    return !!current.data.project.get(session.projectID)?.experimental?.hidden
                  },
                  get active() {
                    return (
                      props.tab?.type === "session" && props.tab.server === key() && props.tab.sessionId === session.id
                    )
                  },
                  get activity() {
                    const status = sessionStatus(current, session.id, {
                      root: true,
                      autoApprove: settings.permissions.autoApproves(
                        projectSettingsKey(current.sdk.scope, session.projectID),
                      ),
                      snapshot: session,
                    })

                    return status === "running" || status === "input" ? status : "idle"
                  },
                }))
              },
              async loadProjectSessions(project, limit, signal) {
                const current = ctx()

                if (!current) return false

                const page = await current.sdk.api.session.list(
                  { project, limit, parentID: null, archived: false, order: "desc" },
                  { signal },
                )

                signal.throwIfAborted()
                setProjectSessions((previous) => new Map(previous).set(project, page.data))

                return !!page.cursor.next
              },
              async projectNames(signal) {
                const projects = await ctx()?.sdk.api.project.list(undefined, { signal })

                return (
                  projects?.map((project) => displayName({ name: project.name, worktree: project.canonical })) ?? []
                )
              },
              async createProject(input) {
                const current = ctx()

                if (!current) throw new Error(language.t("common.requestFailed"))

                input.signal.throwIfAborted()

                const project = await current.sdk.api.experimental.project.register({
                  directory: input.directory,
                  name: input.name,
                })

                input.signal.throwIfAborted()
                current.sync.project.update(project)
                current.projects.touch(project.canonical)
                openProject(project.canonical)
              },
              async forgetProject(directory) {
                const current = ctx()

                if (current) await forgetNavigationWorkspace(current, directory, false)
              },
              openProject,
              openNewSession(directory) {
                actions.openProjectNewSession(props.connection, directory)
                props.onNavigate?.()
              },
              openSession(id) {
                const session = sessions().find((item) => item.id === id)

                if (!session) return
                actions.openProjectSession(
                  props.connection,
                  ctx()?.projects.forSession(session)?.worktree ?? session.location.directory,
                  session,
                )
                props.onNavigate?.()
              },
              announce(status, label) {
                if (!props.onNavigate) setSidebarConversationActivity({ status, label })
              },
            })
          }
        </Contribution>
      )}
    </Show>
  )
}
