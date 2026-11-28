import { createKeyed, SettingsPage, type Plugin } from "@opencode/plugin/gui"
import {
  builtinContext,
  Page,
  QuestionRenderer,
  ShellNavigation,
  subscribeBuiltinDeepLinks,
  type NavigationActivity,
  type NavigationSession,
  type ShellNavigationInput,
} from "@opencode/plugin/gui/builtin"
import { dashboardLinkChannel } from "@loginom-ai-agent/product/dashboard-link"
import { Option, Schema } from "effect"
import { createMemo, lazy, onCleanup, Show, Suspense } from "solid-js"
import { unwrap } from "solid-js/store"
import { DashboardLink } from "./contract"
import { transitionDashboard, type DashboardState, type DashboardStore } from "./dashboard-machine"
import { allocateManagedFolder, availableProjectName, conversationTitle, ManagedFolders } from "./folders"
import type definition from "./index"
import { LoginomRepeatDock } from "./repeat-dock"
import { ConversationSidebar, folderActivity, type SidebarText } from "./sidebar"
import { registerStartScreen } from "./start-screen"
import { registerSystemProxy } from "./system-proxy"

const decodeLink = Schema.decodeUnknownOption(DashboardLink)

const activityLabels: Record<NavigationActivity, Parameters<SidebarText>[0]> = {
  input: "conversationWaiting",
  running: "conversationRunning",
  idle: "conversationNavigation",
}

function Navigation(props: {
  input: ShellNavigationInput
  text: SidebarText
  create(name: string, signal: AbortSignal): Promise<void>
}) {
  const loose = createMemo(() => props.input.sessions.filter((session) => session.hiddenProject))

  const projects = createMemo(() => {
    const sessions = new Map<string, NavigationSession[]>()

    for (const session of props.input.sessions) {
      if (session.hiddenProject) continue
      const conversation = sessions.get(session.directory)

      if (conversation) conversation.push(session)
      else sessions.set(session.directory, [session])
    }

    return props.input.projects.map((project) => ({
      ...project,
      conversations: sessions.get(project.directory) ?? [],
    }))
  })

  createKeyed(
    () => {
      const status = folderActivity([...loose(), ...projects().flatMap((project) => project.conversations)])

      return { status, label: props.text(activityLabels[status]) }
    },
    ({ status, label }) => props.input.announce(status, label),
    { equals: (previous, next) => previous.status === next.status && previous.label === next.label },
  )

  return (
    <ConversationSidebar
      projects={projects()}
      conversations={loose()}
      text={props.text}
      onCreate={props.create}
      onOpenProject={props.input.openProject}
      onNewInProject={props.input.openNewSession}
      onOpenConversation={props.input.openSession}
    />
  )
}

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  registerStartScreen(ctx)
  const Catalog = lazy(() => import("./catalog-page"))

  ctx.add(Page, {
    id: "catalog",
    nav: {},
    get title() {
      return ctx.t("catalog.title")
    },
    render: () => (
      <Suspense>
        <Catalog />
      </Suspense>
    ),
  })

  const Settings = lazy(() => import("./page"))

  ctx.add(SettingsPage, {
    id: "loginom",
    icon: "arrow-up-right",
    get title() {
      return ctx.t("title")
    },
    render: () => (
      <Suspense>
        <Settings />
      </Suspense>
    ),
  })

  if (ctx.desktop) {
    const folders = ctx.main(ManagedFolders)

    ctx.add(ShellNavigation, {
      get newSessionTitle() {
        return ctx.t("newConversation")
      },
      sidebarShortcut: "mod+b",
      render: (input) => (
        <Navigation
          input={input}
          text={(key) => ctx.t(key)}
          create={async (requested, attempt) => {
            const signal = AbortSignal.any([attempt, ctx.signal])
            const names = await input.projectNames(signal)
            signal.throwIfAborted()

            const name = availableProjectName(requested, names)

            const project = await allocateManagedFolder(
              folders.project(name),
              (directory) => {
                signal.throwIfAborted()

                return input.createProject({ directory, name, signal })
              },
              folders.finish,
            )

            void project.finish(true)
          }}
        />
      ),
      async draft({ directory, draftID, hidden, register, forget, signal }) {
        if (directory && !hidden) return directory

        const active = AbortSignal.any([signal, ctx.signal])

        const draft = await allocateManagedFolder(
          folders.draftDirectory(draftID),
          async (directory) => {
            active.throwIfAborted()
            await register({ directory, hidden: true })
            active.throwIfAborted()
          },
          ({ directory }) => folders.discardDraft(directory),
          forget,
        )

        return draft.directory
      },
      async discardDraft(input) {
        if (await folders.discardDraft(input.directory, { signal: ctx.signal })) await input.forget()
      },
      prepare({ hidden, prompt, register, forget }) {
        if (!hidden) return

        return () =>
          allocateManagedFolder(
            folders.conversation(conversationTitle(prompt, ctx.t("newConversation"))),
            (directory) => register({ directory, hidden: true }),
            folders.finish,
            forget,
          )
      },
    })
  }

  ctx.add(QuestionRenderer, {
    matches: (request) => request.metadata?.loginomRepeat === true,
    render: (props) => <LoginomRepeatDock {...props} />,
  })

  if (!ctx.desktop) return

  registerSystemProxy(ctx)

  const Dashboard = lazy(() => import("./dashboard"))
  const router = builtinContext(ctx).router

  const [store, setStore] = ctx.storage.memory<{ dashboard: DashboardState }>("dashboard", {
    initial: { dashboard: { nextAttempt: 1 } },
  })

  const dashboard: DashboardStore = {
    state: () => store.dashboard,
    dispatch(event) {
      const previous = unwrap(store.dashboard)
      const next = transitionDashboard(previous, event)

      if (next === previous) return

      setStore((draft) => {
        draft.dashboard = next
      })

      return next
    },
  }

  ctx.add(Page, {
    id: "dashboard",
    get title() {
      return ctx.t("dashboard")
    },
    render: () => (
      <Suspense>
        <Show
          when={dashboard.state().current?.link}
          keyed
          fallback={
            <p class="p-4" role="status">
              {ctx.t("dashboardOpenStudio")}
            </p>
          }
        >
          {(link) => <Dashboard link={link} dashboard={dashboard} />}
        </Show>
      </Suspense>
    ),
  })

  onCleanup(subscribeBuiltinDeepLinks(dashboardLinkChannel, (data) => {
    const decoded = decodeLink(data)

    if (Option.isNone(decoded)) return

    const link = decoded.value

    if ("code" in link) {
      const issue =
        link.code === "DASHBOARD_SNAPSHOT_UNAVAILABLE" || link.code === "DASHBOARD_SNAPSHOT_INVALID"
          ? "dashboardSnapshotGone"
          : link.code === "LOGINOM_CONFIG_REQUIRED"
            ? "dashboardConnect"
            : "dashboardOpenFailed"

      if (router.path().split("?")[0] === `/page/${ctx.id}/dashboard`) {
        if (dashboard.dispatch({ type: "link.failed", id: link.id, issue })) return
      }

      ctx.toast.show({ variant: "error", title: ctx.t(issue) })

      return
    }

    dashboard.dispatch({ type: "link.opened", link })
    router.openPage("dashboard")
  }))
}

export default setup
