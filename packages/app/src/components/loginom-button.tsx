import { Show } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { usePlatform } from "@/context/platform"
import { SettingsLoginom } from "./settings-loginom"

export function LoginomButton() {
  const dialog = useDialog()
  const platform = usePlatform()
  return (
    <Show when={platform.loginom}>
      <Button
        variant="ghost"
        aria-label="Loginom"
        onClick={() =>
          void dialog.show(() => (
            <Dialog fit class="loginom-dialog">
              <SettingsLoginom />
            </Dialog>
          ))
        }
      >
        Loginom
      </Button>
    </Show>
  )
}
