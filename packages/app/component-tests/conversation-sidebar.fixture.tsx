import { render } from "solid-js/web"
import { ConversationSidebar, type SidebarConversation } from "@opencode/gui-plugins/conversation-sidebar"

export function mountSidebar() {
  const host = document.createElement("div")
  host.className = "p-3 bg-v2-background-bg-deep text-v2-text-text-base"
  host.style.width = "min(280px, 100vw)"
  document.body.replaceChildren(host)
  const items = Array.from(
    { length: 8 },
    (_, index): SidebarConversation => ({
      id: `report-${index}`,
      title: `Отчёт ${index + 1}`,
      active: false,
      activity: index === 7 ? "input" : index === 0 ? "running" : "idle",
    }),
  )

  render(
    () => (
      <ConversationSidebar
        text={(key) => key}
        projects={[
          { directory: "/reports", title: "Отчёты", conversations: items },
          { directory: "/other", title: "Другой проект", conversations: [] },
        ]}
        conversations={[{ id: "loose", title: "Разговор без проекта", active: false, activity: "running" }]}
        onCreate={async () => false}
        onOpenProject={() => {}}
        onNewInProject={() => {}}
        onOpenConversation={(id) => {
          host.dataset.opened = id
        }}
      />
    ),
    host,
  )
}
