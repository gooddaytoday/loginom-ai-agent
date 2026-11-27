import { SettingsPage, type Plugin } from "@opencode/plugin/gui"
import { lazy, Suspense } from "solid-js"
import type definition from "./index"

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const Page = lazy(() => import("./page"))
  const Diagnostics = lazy(() => import("./diagnostics-page"))
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
  ctx.add(SettingsPage, {
    id: "diagnostics",
    icon: "checklist",
    get title() {
      return ctx.t("diagnostics.title")
    },
    render: () => (
      <Suspense>
        <Diagnostics />
      </Suspense>
    ),
  })
}

export default setup
