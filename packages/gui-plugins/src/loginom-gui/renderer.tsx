import { createKeyed, SettingsPage, type Plugin } from "@opencode/plugin/gui"
import {
  Page as PluginPage,
  ShellNavigation,
  type NavigationActivity,
  type NavigationSession,
  type ShellNavigationInput,
} from "@opencode/plugin/gui/builtin"
import { createMemo, lazy, Suspense } from "solid-js"
import type definition from "./index"
import { availableProjectName, conversationTitle, ManagedFolders } from "./folders"
import { ConversationSidebar, folderActivity, type SidebarText } from "./sidebar"

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
  const Catalog = lazy(() => import("./catalog-page"))
  ctx.add(PluginPage, {
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
  const Page = lazy(() => import("./page"))
  ctx.add(SettingsPage, {
    id: "loginom",
    icon: "arrow-up-right",
    get title() {
      return ctx.t("title")
    },
    render: () => (
      <Suspense>
        <Page />
      </Suspense>
    ),
  })

  if (ctx.desktop) {
    const folders = ctx.main(ManagedFolders)

    const allocate = async (pending: Promise<string>, use: (directory: string) => Promise<void>) => {
      const directory = await pending
      const finish = (keep: boolean) => folders.finish({ directory, keep })

      try {
        await use(directory)

        return { directory, finish }
      } catch (error) {
        await finish(false).catch(() => undefined)
        throw error
      }
    }

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

            const project = await allocate(folders.project(name), (directory) => {
              signal.throwIfAborted()

              return input.createProject({ directory, name, signal })
            })

            void project.finish(true)
          }}
        />
      ),
      async draft({ directory, draftID, hidden, register, signal }) {
        if (directory && !hidden) return directory

        const draft = await folders.draftDirectory(draftID)

        try {
          signal.throwIfAborted()
          ctx.signal.throwIfAborted()
          await register({ directory: draft, hidden: true })
          signal.throwIfAborted()
          ctx.signal.throwIfAborted()

          return draft
        } catch (error) {
          void folders.discardDraft(draft).catch(() => undefined)
          throw error
        }
      },
      async discardDraft(input) {
        if (await folders.discardDraft(input.directory, { signal: ctx.signal })) await input.forget()
      },
      prepare({ hidden, prompt, register }) {
        if (!hidden) return

        return () =>
          allocate(folders.conversation(conversationTitle(prompt, ctx.t("newConversation"))), (directory) =>
            register({ directory, hidden: true }),
          )
      },
    })
  }
}

export default setup
