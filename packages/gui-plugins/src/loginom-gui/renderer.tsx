import { SettingsPage, type Plugin } from "@opencode/plugin/gui"
import { Page as PluginPage } from "@opencode/plugin/gui/builtin"
import { createEffect, createSignal, lazy, Suspense } from "solid-js"
import type { ChatAction } from "./documentation-run"
import type definition from "./index"

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const Page = lazy(() => import("./page"))
  const Documentation = lazy(() => import("./documentation"))
  const [chatAction, setChatAction] = createSignal<ChatAction>()
  createEffect(() => {
    const action = chatAction()
    if (!action) return
    const session = ctx.sessions.current()
    const screen = ctx.screen.current()
    if (!session || session.id !== action.sessionID || session.server.id !== action.server || !screen) return
    setChatAction(undefined)
    if (action.kind === "preview") ctx.links.open({ href: action.file, exact: true, session })
    else for (const path of action.files) screen.composer.attach({ type: "file", path })
  })
  ctx.add(PluginPage, {
    id: "document-package",
    nav: {},
    get title() {
      return ctx.t("docs.title")
    },
    render: () => (
      <Suspense>
        <Documentation onChatAction={setChatAction} />
      </Suspense>
    ),
  })
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
}

export default setup
