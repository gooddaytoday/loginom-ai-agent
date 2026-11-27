import { providerPrefix } from "@loginom-ai-agent/loginom-host/model-server-rpc"
import { bindPlugin, SettingsPage, type Plugin } from "@opencode/plugin/gui"
import { BuiltinProviderSetup, type ProviderSetupProps } from "@opencode/plugin/gui/builtin"
import { lazy, Suspense } from "solid-js"
import type definition from "./index"

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const Page = lazy(() => import("./page"))
  const ModelServer = lazy(() => import("./model-server"))
  ctx.add(BuiltinProviderSetup, {
    id: "loginom-own-model-server",
    get title() {
      return ctx.t("modelServerTitle")
    },
    matchesProvider: (id) => id.startsWith(providerPrefix),
    render: bindPlugin((props: ProviderSetupProps) => (
      <Suspense>
        <ModelServer {...props} />
      </Suspense>
    )),
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
