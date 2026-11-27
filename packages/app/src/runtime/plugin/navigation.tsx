import { createEffect, createMemo, onCleanup, Show } from "solid-js"
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
import { useTabs, type Tab } from "@/shell/tabs/tabs"
import { mergeSidebarSessions } from "@/shell/titlebar/sidebar-sessions"
import { projectSettingsKey, useSettings } from "@/settings/model"
import { pathKey } from "@/workspaces/path-key"
import { usePluginHost } from "./host"
import { Contribution } from "./render"

export function useShellNavigation() {
  const host = usePluginHost()
  return () => host.items(ShellNavigation)[0]
}

export function hiddenWorkspace(ctx: ServerCtx | undefined, directory: string | undefined, projectID?: string) {
  if (!ctx) return false
  if (projectID) return !!ctx.data.project.get(projectID)?.hidden
  if (!directory) return false
  const current = ctx.data.location.info({ directory })
  if (current) return !!ctx.data.project.get(current.project.id)?.hidden
  const key = pathKey(directory)
  return ctx.data.project.list({ includeHidden: true }).some((item) => item.hidden && pathKey(item.canonical) === key)
}

export async function registerNavigationWorkspace(ctx: ServerCtx, input: { directory: string; hidden: boolean }) {
  ctx.data.project.remember(await ctx.sdk.api.project.register(input))
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
  const query = useQuery(() => ({
    ...homeSessionsQuery(props.connection, ctx()),
    enabled: ctx()?.sdk.connection.status() === "connected",
  }))

  createEffect(() => {
    const current = ctx()
    if (current?.sdk.connection.status() === "connected") void current.data.project.sync().catch(() => undefined)
  })

  const sessions = createMemo(() => {
    const current = ctx()
    if (!current) return []
    return current.data.session.apply(mergeSidebarSessions(query.data?.() ?? [], current.data.session.known()))
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
                    return !!current.data.project.get(session.projectID)?.hidden
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
              async projectNames() {
                const projects = await ctx()?.sdk.api.project.list()
                return projects?.map((project) => displayName({ name: project.name, worktree: project.canonical })) ?? []
              },
              async createProject(input) {
                const current = ctx()
                if (!current) throw new Error(language.t("common.requestFailed"))
                const project = await current.sdk.api.project.register(input)
                current.sync.project.update(project)
                current.projects.touch(project.canonical)
                openProject(project.canonical)
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
