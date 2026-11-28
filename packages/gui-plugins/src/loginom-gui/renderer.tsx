import { isModelServerID } from "@loginom-ai-agent/loginom-host/model-server-id"
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
    matchesProvider: isModelServerID,
    removal: {
      get title() {
        return ctx.t("modelServerRemove")
      },
      async run(client, provider, directory, signal) {
        const confirmed = await ctx.dialogs.confirm({
          title: ctx.t("modelServerRemove"),
          description: ctx.t("modelServerRemoveConfirm", { server: provider.name }),
          confirm: ctx.t("modelServerRemove"),
          danger: true,
        })

        if (!confirmed || signal.aborted) return false

        try {
          const { ModelServerRpc } = await import("@loginom-ai-agent/loginom-host/model-server-rpc")

          const result = await client
            .rpc(ModelServerRpc)
            .remove(
              { providerID: provider.id },
              {
                location: directory ? { directory } : undefined,
                signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
              },
            )

          if (result.ok) return true
        } catch {}

        if (!signal.aborted) ctx.toast.show({ variant: "error", title: ctx.t("modelServerRemoveFailed") })

        return false
      },
    },
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
