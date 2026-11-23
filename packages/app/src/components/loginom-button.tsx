import { Show, onCleanup, onMount } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { usePlatform } from "@/context/platform"
import { useLanguage } from "@/context/language"
import { SettingsLoginom } from "./settings-loginom"
import { createLoginomConnectionStatus } from "./settings-loginom-state"

export function LoginomButton() {
  const dialog = useDialog()
  const platform = usePlatform()
  const language = useLanguage()
  const connection = createLoginomConnectionStatus(platform.loginom)
  onMount(() => {
    if (!platform.loginom) return
    void connection.refresh()
    const timer = setInterval(() => void connection.refresh(), 1000)
    onCleanup(() => clearInterval(timer))
  })
  return (
    <Show when={platform.loginom}>
      <Button
        variant={connection.required() ? "secondary" : "ghost"}
        class="h-auto flex-col max-w-full px-1"
        data-tid="loginom-connection"
        data-connection-required={connection.required()}
        aria-label={connection.required() ? language.t("loginom.connectionRequired") : "Loginom"}
        title={connection.required() ? language.t("loginom.connectionRequired") : "Loginom"}
        onClick={() =>
          void dialog.show(() => (
            <Dialog fit class="loginom-dialog">
              <SettingsLoginom />
            </Dialog>
          ))
        }
      >
        Loginom
        <Show when={connection.required()}>
          <span role="status" class="text-10-regular text-icon-warning-base">
            {language.t("loginom.configure")}
          </span>
        </Show>
      </Button>
    </Show>
  )
}
