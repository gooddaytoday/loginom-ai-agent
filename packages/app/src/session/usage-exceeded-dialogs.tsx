import { useWorkspaceLocation } from "@/workspaces/location"
import { Persist, persisted } from "@/runtime/persistence/storage"
import { onCleanup } from "solid-js"
import { Schema } from "effect"
import { Persistence } from "@/runtime/persistence/schema"
import { useSessionLayout } from "./session-layout"
import { useDialog } from "@opencode/ui/context"
import { limitResetAt } from "./free-limit-reset"

const CHATGPT_USAGE_LIMIT_WINDOW = 86_400_000 // 24 hrs

export function formatLimitReset(locale: string, created: number, retryAfterMs: number | undefined) {
  const at = limitResetAt(created, retryAfterMs)

  if (at === undefined) return undefined

  const now = Date.now()
  const sameDay = new Date(at).toDateString() === new Date(now).toDateString() && at - now < 86_400_000

  return new Intl.DateTimeFormat(
    locale,
    sameDay ? { timeStyle: "short" } : { dateStyle: "medium", timeStyle: "short" },
  ).format(at)
}

export function useUsageExceededDialogs() {
  const sdk = useWorkspaceLocation()
  const dialog = useDialog()
  const { params } = useSessionLayout()

  const [chatgptUsageLimit, setChatGPTUsageLimit] = persisted(
    Persist.global("chatgpt-usage-limit"),
    Persistence.struct({ lastSeenAt: Schema.NullOr(Schema.Finite) }),
    { lastSeenAt: null },
  )

  onCleanup(
    sdk().event.on("session.step.failed", (evt) => {
      if (evt.data.sessionID !== params.id || dialog.active) return
      if (evt.data.error.type !== "provider.chatgpt-limit") return

      if (chatgptUsageLimit.lastSeenAt && Date.now() - chatgptUsageLimit.lastSeenAt < CHATGPT_USAGE_LIMIT_WINDOW) return

      void import("@/providers/connect/chatgpt-usage-limit").then((usage) => {
        if (dialog.active) return
        setChatGPTUsageLimit("lastSeenAt", Date.now())
        dialog.show(() => <usage.DialogChatGPTUsageLimit />)
      })
    }),
  )
}
