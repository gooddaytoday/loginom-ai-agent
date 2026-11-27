import { SettingsPage, type Plugin } from "@opencode/plugin/gui"
import { lazy, Suspense } from "solid-js"
import type definition from "./index"

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
  const Permissions = lazy(() => import("./permissions-page"))
  ctx.add(SettingsPage, {
    id: "permissions",
    icon: "lock",
    get title() {
      return ctx.t("permissionsTitle")
    },
    render: (input) => (
      <Suspense>
        <Permissions workspace={input.workspace} />
      </Suspense>
    ),
  })
}

export default setup
