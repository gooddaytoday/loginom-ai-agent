import { SettingsPage, type Plugin } from "@opencode/plugin/gui"
import { Page as PluginPage, QuestionRenderer } from "@opencode/plugin/gui/builtin"
import { lazy, Suspense } from "solid-js"
import type definition from "./index"
import { LoginomRepeatDock } from "./repeat-dock"

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  ctx.add(QuestionRenderer, {
    matches: (request) => request.metadata?.loginomRepeat === true,
    render: (props) => <LoginomRepeatDock {...props} />,
  })

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
}

export default setup
