import { PermissionDock } from "@opencode/plugin/gui/builtin"
import PermissionPrompt from "./permission-dock"
import { SettingsPage, type Plugin } from "@opencode/plugin/gui"
import { lazy, Suspense } from "solid-js"
import type definition from "./index"

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  ctx.add(PermissionDock, {
    id: "loginom",
    matches: () => true,
    get waiting() {
      return ctx.t("permissionWaiting")
    },
    render: (input) => <PermissionPrompt {...input} />,
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
