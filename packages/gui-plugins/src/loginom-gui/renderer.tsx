import { SettingsPage, type Plugin } from "@opencode/plugin/gui"
import { lazy, Suspense } from "solid-js"
import type definition from "./index"
import { registerStartScreen } from "./start-screen"

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  registerStartScreen(ctx)
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
