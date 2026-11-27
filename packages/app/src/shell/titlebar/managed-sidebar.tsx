import { createEffect, createMemo, onCleanup } from "solid-js"
import { Schema } from "effect"
import { useQuery, useQueryClient } from "@tanstack/solid-query"
import { displayName } from "@opencode/ui/project-avatar"
import type { SessionInfo } from "@opencode/client/promise"
import { isConversationFolder, isManagedProject } from "@opencode/gui-plugins/managed-folders"
import {
  ConversationSidebar,
  folderActivity,
  type SidebarConversation,
  type SidebarText,
} from "@opencode/gui-plugins/conversation-sidebar"
import { homeSessionsQuery } from "../../home/sessions/queries"
import { Persist, persisted } from "@/runtime/persistence/storage"
import { createSessionRenamer } from "@/session/commands/rename-session"
import { sessionTreeIDs } from "@/session/requests/session-request-tree"
import { notifySessionTabsRemoved } from "./session-events"
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
import { useSettingsSurface } from "@/settings/surface"
import { projectSettingsKey, useSettings } from "@/settings/model"
import { pathKey } from "@/workspaces/path-key"
import { mergeSidebarSessions } from "./sidebar-sessions"

export function ManagedSidebar(props: { connection: ServerConnection.Sidecar; tab?: Tab; onNavigate?: () => void }) {
  const global = useGlobal()
  const host = usePluginHost()
  const language = useLanguage()
  const folders = useManagedFolders()
  const settings = useSettings()
  const settingsSurface = useSettingsSurface()
  const layout = useLayout()
  const tabs = useTabs()
  const actions = createProjectSessionActions()
  const rename = createSessionRenamer()
  const queryClient = useQueryClient()
  const [pinState, setPinState] = persisted(
    { ...Persist.global("loginom.sidebar.pins"), sync: true },
    Schema.Struct({
      ids: Schema.Array(Schema.String),
    }),
    { ids: [] },
  )
  const updatePins = (update: (ids: readonly string[]) => readonly string[]) =>
    setPinState((current) => ({ ids: update(current.ids) }))
  const inFlight = new Set<string>()
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
  const find = (id: string) => sessions().find((item) => item.id === id)
  const canManageProject = (directory: string) => !!folders() && isManagedProject(directory)
  const error = () => showToast({ variant: "error", title: language.t("common.requestFailed") })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["home-sessions", props.connection], exact: true })

  async function run<T>(id: string, task: () => Promise<T>) {
    if (inFlight.has(id)) return
    inFlight.add(id)
    try {
      return await task()
    } catch {
      error()
    } finally {
      inFlight.delete(id)
    }
  }

  async function deleteSession(current: NonNullable<ReturnType<typeof ctx>>, session: SessionInfo) {
    const ids = sessionTreeIDs(current.data.session.list(), session.id)
    await current.data.session.remove(session.id)
    notifySessionTabsRemoved({ server: key(), directory: session.location.directory, sessionIDs: ids })
    updatePins((previous) => previous.filter((pin) => !ids.some((id) => pin === `session:${id}`)))
  }

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
      pins={pinState.ids}
      onPin={(id) => updatePins((ids) => (ids.includes(id) ? ids.filter((pin) => pin !== id) : [...ids, id]))}
      canManageProject={canManageProject}
      onProjectSettings={(directory) => {
        props.onNavigate?.()
        settingsSurface.openProject({ server: key(), project: directory })
      }}
      onRename={async (id, title) =>
        !!(await run(id, async () => {
          const session = find(id)
          if (!session) return false
          await rename(key(), session, title)
          return true
        }))
      }
      onCountFiles={(id) => {
        const directory = find(id)?.location.directory
        if (!directory || !isConversationFolder(directory)) return Promise.resolve(undefined)
        return run(`count:${id}`, async () => folders()?.countFiles(directory))
      }}
      onMove={(id, target) =>
        run(id, async () => {
          const current = ctx()
          const api = folders()
          const session = find(id)
          if (!current || !api || !session || conversation(session).activity !== "idle") return
          const source = session.location.directory
          const project =
            target &&
            ("directory" in target
              ? current.projects.forDirectory(target.directory)
              : await current.projects.add(await api.project(target.name)))
          if (target && (!project || !canManageProject(project.worktree))) return
          if (target && "directory" in target && project && pathKey(project.worktree) !== pathKey(target.directory))
            return
          const directory = project?.worktree ?? (await api.conversation(sessionLabel(session)))
          await current.data.location.syncInfo({ directory })
          const moved =
            project && isConversationFolder(source)
              ? await api.moveFiles({ source, project: directory, title: sessionLabel(session) })
              : undefined
          current.data.session.remember(current.data.session.get(id) ?? session)
          try {
            await current.sdk.api.session.move({ sessionID: id, directory })
          } catch (cause) {
            // A disconnected response can arrive after the server accepted the move.
            // Keep the files at the destination unless the server explicitly rejected the request.
            if (
              moved &&
              cause instanceof Error &&
              (cause.name === "InvalidRequestError" || cause.name === "SessionNotFoundError")
            )
              await api.restoreFiles({ source: moved.directory, project: directory, original: source })
            throw cause
          }
          const loginom = host.context("loginom-gui")
          const description = project
            ? moved?.count
              ? loginom?.t("movedFiles", { name: displayName(project), count: moved.count })
              : loginom?.t("moved", { name: displayName(project) })
            : text("detached")
          showToast({ description: description ?? text("move") })
          void invalidate()
          return directory
        })
      }
      onDeleteConversation={async (id, files) =>
        !!(await run(id, async () => {
          const current = ctx()
          const session = find(id)
          if (!current || !session) return false
          await deleteSession(current, session)
          void invalidate()
          if (files && isConversationFolder(session.location.directory)) {
            await folders()?.remove(session.location.directory).catch(error)
          }
          return true
        }))
      }
      onDeleteProject={async (directory) =>
        !!(await run(directory, async () => {
          const current = ctx()
          const api = folders()
          const project = current?.projects.forDirectory(directory)
          if (!current || !api || !project || !canManageProject(directory)) return false
          if (pathKey(project.worktree) !== pathKey(directory)) return false
          await api.validateProject(directory)
          try {
            // Re-read the first page after each batch, including archived conversations.
            // Remove root sessions first so the server takes care of their subagents.
            for (const roots of [true, false]) {
              for (;;) {
                const result = await current.sdk.api.session.list({
                  project: project.id,
                  ...(roots ? { parentID: null } : {}),
                  limit: 50,
                })
                if (!result.data.length) break
                for (const session of result.data.filter(
                  (item) => !item.parentID || !result.data.some((parent) => parent.id === item.parentID),
                ))
                  await deleteSession(current, session)
              }
            }
            await api.remove(directory)
            current.projects.hide({ worktree: directory })
            updatePins((ids) => ids.filter((id) => id !== `project:${directory}`))
            const home = layout.home.selection()
            if (home.server === key() && home.directory && pathKey(home.directory) === pathKey(directory))
              layout.home.setSelection({ server: key() })
            return true
          } finally {
            void invalidate()
          }
        }))
      }
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
