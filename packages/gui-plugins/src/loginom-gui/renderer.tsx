import { SettingsPage, Style, type Plugin } from "@opencode/plugin/gui"
import { Page as PluginPage } from "@opencode/plugin/gui/builtin"
import { lazy, Suspense } from "solid-js"
import networkCss from "./network.css?inline"
import type definition from "./index"

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
  const Network = lazy(() => import("./network"))
  ctx.add(Style, networkCss)
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

  const network: SettingsPage = {
    id: "network",
    icon: "globe",
    get title() {
      return ctx.t("network.title")
    },
    get entries() {
      return [
        { id: "network-proxy", title: ctx.t("network.proxy") },
        { id: "network-port", title: ctx.t("network.port") },
      ]
    },
    render: () => (
      <Suspense>
        <Network />
      </Suspense>
    ),
  }

  // #1439 adds "work" to the registry type.
  Object.assign(network, { group: "work" })
  ctx.add(SettingsPage, network)
}

export default setup
