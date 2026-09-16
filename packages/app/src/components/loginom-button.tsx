import { Show } from "solid-js"
import { Button } from "@loginom-ai-agent/ui/button"
import { Dialog } from "@loginom-ai-agent/ui/dialog"
import { useDialog } from "@loginom-ai-agent/ui/context/dialog"
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
