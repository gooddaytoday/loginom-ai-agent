import { createEffect, createMemo, onCleanup } from "solid-js"
import { useQuery } from "@tanstack/solid-query"
import { displayName } from "@opencode/ui/project-avatar"
import type { SessionInfo } from "@opencode/client/promise"
import { isConversationFolder } from "@opencode/gui-plugins/managed-folders"
import {
  ConversationSidebar,
  folderActivity,
  type SidebarConversation,
  type SidebarText,
} from "@opencode/gui-plugins/conversation-sidebar"
import { homeSessionsQuery } from "../../home/sessions/queries"
import { useLanguage } from "@/runtime/i18n/language"
import { usePluginHost } from "@/runtime/plugin/host"
import { useManagedFolders } from "@/runtime/plugin/managed-folders"
import { ServerConnection } from "@/runtime/server/registry"
import { useGlobal } from "@/runtime/server/runtime"
import { sessionLabel } from "@/session/title"
import { sessionStatus } from "@/shell/layout/project-avatar-state"
import { showToast } from "@/shell/notifications/toast"
import { setSidebarConversationActivity } from "@/shell/sidebar-peek"
import { useLayout } from "@/shell/state/layout"
import { createProjectSessionActions } from "@/shell/tabs/project-sessions"
import { useTabs, type Tab } from "@/shell/tabs/tabs"
import { projectSettingsKey, useSettings } from "@/settings/model"
import { pathKey } from "@/workspaces/path-key"
import { mergeSidebarSessions } from "./sidebar-sessions"

export function ManagedSidebar(props: { connection: ServerConnection.Sidecar; tab?: Tab; onNavigate?: () => void }) {
  const global = useGlobal()
  const host = usePluginHost()
  const language = useLanguage()
  const folders = useManagedFolders()
  const settings = useSettings()
  const layout = useLayout()
  const tabs = useTabs()
  const actions = createProjectSessionActions()
  const key = () => ServerConnection.key(props.connection)
  const ctx = () => global.serverCtx(key())
  const text: SidebarText = (key) => host.context("loginom-gui")?.t(key) ?? key

  const query = useQuery(() => ({
    ...homeSessionsQuery(props.connection, ctx()),
    enabled: ctx()?.sdk.connection.status() === "connected",
  }))

  const sessions = createMemo(() => {
    const current = ctx()
    if (!current) return []
    return current.data.session
      .apply(mergeSidebarSessions(query.data?.() ?? [], current.data.session.known()))
      .toSorted((left, right) => right.time.created - left.time.created || right.id.localeCompare(left.id))
  })

  const conversation = (session: SessionInfo): SidebarConversation => ({
    id: session.id,
    title: sessionLabel(session),
    get active() {
      return props.tab?.type === "session" && props.tab.server === key() && props.tab.sessionId === session.id
    },
    get activity() {
      const current = ctx()
      if (!current) return "idle"
      const status = sessionStatus(current, session.id, {
        root: true,
        autoApprove: settings.permissions.autoApproves(projectSettingsKey(current.sdk.scope, session.projectID)),
        snapshot: session,
      })
      return status === "running" || status === "input" ? status : "idle"
    },
  })
  const loose = createMemo(() =>
    sessions()
      .filter((session) => isConversationFolder(session.location.directory))
      .map(conversation),
  )
  const grouped = createMemo(() => {
    const current = ctx()
    return Map.groupBy(
      sessions().filter((session) => !isConversationFolder(session.location.directory)),
      (session) => pathKey(current?.projects.forSession(session)?.worktree ?? session.location.directory),
    )
  })
  const projects = createMemo(() =>
    (ctx()?.projects.used() ?? []).map((project) => ({
      directory: project.worktree,
      title: displayName(project),
      conversations: (grouped().get(pathKey(project.worktree)) ?? []).map(conversation),
    })),
  )

  if (!props.onNavigate) {
    createEffect(() => {
      const status = folderActivity([...loose(), ...projects().flatMap((project) => project.conversations)])
      const label = text(
        status === "input"
          ? "conversationWaiting"
          : status === "running"
            ? "conversationRunning"
            : "conversationNavigation",
      )
      setSidebarConversationActivity({ status, label })
    })
    onCleanup(() => setSidebarConversationActivity(undefined))
  }

  const openProject = (directory: string) => {
    layout.home.setSelection({ server: key(), directory })
    if (layout.route().type !== "home") tabs.toggleHome({ home: false, current: props.tab })
    props.onNavigate?.()
  }

  return (
    <ConversationSidebar
      projects={projects()}
      conversations={loose()}
      text={text}
      onCreate={async (name) => {
        const api = folders()
        if (!api) return false
        try {
          const project = await ctx()?.projects.add(await api.project(name))
          if (!project) return false
          openProject(project.worktree)
          return true
        } catch {
          showToast({ variant: "error", title: language.t("common.requestFailed") })
          return false
        }
      }}
      onOpenProject={openProject}
      onNewInProject={(directory) => {
        actions.openProjectNewSession(props.connection, directory)
        props.onNavigate?.()
      }}
      onOpenConversation={(id) => {
        const session = sessions().find((item) => item.id === id)
        if (!session) return
        actions.openProjectSession(
          props.connection,
          ctx()?.projects.forSession(session)?.worktree ?? session.location.directory,
          session,
        )
        props.onNavigate?.()
      }}
    />
  )
}
