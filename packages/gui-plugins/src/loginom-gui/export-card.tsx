import { createLatest, usePlugin } from "@opencode/plugin/gui"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { createSignal, onCleanup, Show } from "solid-js"
import type definition from "./index"
import type { ExportReceipt } from "./export-receipt"

export function ExportCard(props: { receipt: ExportReceipt; nodeLabel?: string; path?: string }) {
  const ctx = usePlugin<typeof definition>()
  const desktop = ctx.desktop
  const path = () => (desktop && ctx.sessions.current()?.server.local ? props.path : undefined)

  const size = () =>
    new Intl.NumberFormat(ctx.locale.locale(), { style: "unit", unit: "byte" }).format(props.receipt.bytes)

  const [focus, setFocus] = createSignal(0)
  const refresh = () => setFocus((count) => count + 1)
  window.addEventListener("focus", refresh)
  onCleanup(() => window.removeEventListener("focus", refresh))

  const availability = createLatest(
    () => {
      const current = path()

      return current ? { path: current, focus: focus() } : undefined
    },
    async (target) => ({
      path: target.path,
      exists: await desktop?.reveal(target.path, { checkOnly: true }).catch(() => false),
    }),
  )

  const available = () => availability.latest?.path === path() && availability.latest?.exists === true

  const reveal = async () => {
    const current = path()

    if (!desktop || !current || !available()) return

    if (await desktop.reveal(current).catch(() => false)) return

    refresh()
    ctx.toast.show({ title: ctx.t("export.unavailable"), variant: "error" })
  }

  return (
    <div
      role="group"
      aria-label={props.receipt.name}
      class="ms-7 mt-1 flex min-w-0 max-w-full items-start gap-2 rounded-md border border-v2-border-border-base p-2"
    >
      <Icon name="file-document" class="shrink-0 text-v2-icon-icon-muted" />
      <div class="min-w-0 break-words">
        <div class="font-medium text-v2-text-text-base">{props.receipt.name}</div>
        <div>{ctx.t("export.node", { name: props.nodeLabel || props.receipt.node.node_id })}</div>
        <div>{ctx.t("export.path", { path: props.receipt.destination })}</div>
        <div>{size()}</div>
        <Show when={path()}>
          <Button
            variant="ghost"
            size="small"
            class="mt-1"
            disabled={!available()}
            title={!available() && !availability.loading ? ctx.t("export.unavailable") : undefined}
            onClick={() => void reveal()}
          >
            {ctx.t("export.reveal")}
          </Button>
        </Show>
      </div>
    </div>
  )
}
