import { Dialog } from "@loginom-ai-agent/ui/dialog"
import { useDialog } from "@loginom-ai-agent/ui/context/dialog"
import { ServerConnection, SettingsLoginom, useServer, useSettings, useTabs } from "@loginom-ai-agent/app"
import { onMount } from "solid-js"

export function DesktopFirstLaunchOnboarding(props: { initialUrl: string; onLoaded: () => void }) {
  const dialog = useDialog()
  const server = useServer()
  const settings = useSettings()
  const tabs = useTabs()

  onMount(() => {
    void runFirstLaunchOnboarding().finally(() => {
      props.onLoaded()
      void window.api.loginom.read().then((connection) => {
        if (connection.hasApiKey) return
        void dialog.show(() => (
          <Dialog fit class="loginom-dialog">
            <SettingsLoginom wizard onSaved={() => dialog.close()} onLater={() => dialog.close()} />
          </Dialog>
        ))
      })
    })
  })

  async function runFirstLaunchOnboarding() {
    try {
      await Promise.all(
        [server.ready.promise, tabs.ready.promise, tabs.recentReady.promise].map((p) => p ?? Promise.resolve()),
      )
      const existingInstall = await window.api.isOldLayoutEligible()
      settings.general.setOldLayoutEligible(existingInstall)
      settings.general.initializeAgentVisibility(existingInstall)
      if (!server.isLocal()) return

      const pending = await window.api.isFirstLaunchOnboardingPending()
      if (!pending) return

      const shouldTrigger =
        !existingInstall &&
        props.initialUrl === "/" &&
        tabs.store.length === 0 &&
        server.list.every(ServerConnection.builtin)

      console.info("[desktop-onboarding] first launch onboarding evaluated", {
        pending,
        shouldTrigger,
        existingInstall,
        initialUrl: props.initialUrl,
        tabs: tabs.store.length,
        servers: server.list.map(ServerConnection.key),
      })

      const directory = await window.api.finishFirstLaunchOnboarding(shouldTrigger)
      if (!shouldTrigger || !directory) return

      console.info("[desktop-onboarding] starting first launch draft", { directory })
      server.projects.open(directory)
      server.projects.touch(directory)
      tabs.select(await tabs.newDraft({ server: server.key, directory }))
    } catch (error) {
      console.error("[desktop-onboarding] first launch onboarding failed", error)
    }
  }

  return null
}
