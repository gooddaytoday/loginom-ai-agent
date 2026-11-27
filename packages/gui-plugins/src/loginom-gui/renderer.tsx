import { createKeyed, SettingsPage, type Plugin } from "@opencode/plugin/gui"
import { ShellNavigation, type NavigationSession, type ShellNavigationInput } from "@opencode/plugin/gui/builtin"
import { createMemo, lazy, Suspense } from "solid-js"
import type definition from "./index"
import { availableProjectName, conversationTitle, ManagedFolders } from "./folders"
import { ConversationSidebar, folderActivity, type SidebarText } from "./sidebar"

function Navigation(props: { input: ShellNavigationInput; text: SidebarText; create(name: string): Promise<void> }) {
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
      const key =
        status === "input"
          ? "conversationWaiting"
          : status === "running"
            ? "conversationRunning"
            : "conversationNavigation"
      return { status, label: props.text(key) }
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
          create={async (requested) => {
            const name = availableProjectName(requested, await input.projectNames())
            const project = await allocate(folders.project(name), (directory) =>
              input.createProject({ directory, name }),
            )
            await project.finish(true)
          }}
        />
      ),
      async draft({ directory, draftID, hidden, register }) {
        if (directory && !hidden) return directory
        const draft = await allocate(folders.draftDirectory(draftID), (directory) =>
          register({ directory, hidden: true }),
        )
        await draft.finish(true)
        return draft.directory
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
