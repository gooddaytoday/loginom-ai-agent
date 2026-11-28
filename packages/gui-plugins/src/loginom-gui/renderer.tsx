import { SettingsPage, type Plugin } from "@opencode/plugin/gui"
import { Page as PluginPage, PermissionDock } from "@opencode/plugin/gui/builtin"
import { lazy, Suspense } from "solid-js"
import type definition from "./index"
import PermissionPrompt from "./permission-dock"
import { permissionDescription } from "./permission-model"

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

  ctx.add(PermissionDock, {
    id: "loginom",
    matches: (request) => permissionDescription(request) !== undefined,
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
