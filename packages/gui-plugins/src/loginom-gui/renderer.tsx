import { SettingsPage, type Plugin } from "@opencode/plugin/gui"
import { lazy, Suspense } from "solid-js"
import type definition from "./index"

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const Page = lazy(() => import("./page"))
  const Instructions = lazy(() => import("./instructions"))
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
    id: "instructions",
    icon: "file-document",
    get title() {
      return ctx.t("instructionsTitle")
    },
    render: () => (
      <Suspense>
        <Instructions />
      </Suspense>
    ),
  })
}

export default setup
