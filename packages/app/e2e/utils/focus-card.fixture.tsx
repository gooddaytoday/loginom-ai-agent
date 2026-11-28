import { AttachmentCard } from "@opencode/session-ui/attachment-card"
import { createResource, onCleanup } from "solid-js"
import { ToolRegistry } from "../../../session-ui/src/tools/tool-renderer"
import { fileStreamUrl } from "../../src/runtime/server/api"

export function registerFocusCard(server: string) {
  const url = fileStreamUrl({ url: server }, { path: "result.csv", directory: "C:/OpenCode/TimelineStability" })

  if (!url) throw new Error("Missing fixture file URL")

  ToolRegistry.register({
    name: "fixture_focus_card",
    render: () => {
      const [status, { refetch }] = createResource(async () => {
        const response = await fetch(url)

        if (!response.ok) throw new Error(`Fixture file check failed: ${response.status}`)

        return response.text()
      })

      const onFocus = () => void refetch()
      window.addEventListener("focus", onFocus)
      onCleanup(() => window.removeEventListener("focus", onFocus))

      return (
        <AttachmentCard title="result.csv">
          {status.state === "pending" ? "Checking file…" : status.latest}
        </AttachmentCard>
      )
    },
  })
}
