import { SettingsPage, Style, type Plugin } from "@opencode/plugin/gui"
import { lazy, Suspense } from "solid-js"
import networkCss from "./network.css?inline"
import type definition from "./index"

const setup: Plugin.Setup<typeof definition> = (ctx) => {
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
  ctx.add(SettingsPage, {
    id: "network",
    icon: "globe",
    get title() {
      return ctx.t("network.title")
    },
    get entries() {
      return [
        { id: "network-mode", title: ctx.t("network.mode") },
        { id: "network-proxy", title: ctx.t("network.proxy") },
        { id: "network-port", title: ctx.t("network.port") },
      ]
    },
    render: () => (
      <Suspense>
        <Network />
      </Suspense>
    ),
  })
}

export default setup
