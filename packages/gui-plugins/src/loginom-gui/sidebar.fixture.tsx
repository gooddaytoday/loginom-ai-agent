import { render } from "solid-js/web"
import { createSignal, onCleanup } from "solid-js"
import { ConversationSidebar, type SidebarConversation } from "./sidebar"

export function mountSidebar(mode: "retry" | "timeout" = "retry") {
  const host = document.createElement("div")
  host.className = "p-3 bg-v2-background-bg-deep text-v2-text-text-base"
  host.style.width = "min(280px, 100vw)"
  document.body.replaceChildren(host)

  const items = Array.from(
    { length: 8 },
    (_, index): SidebarConversation => ({
      id: `report-${index}`,
      title: `Отчёт ${index + 1}`,
      created: index,
      active: false,
      activity: index === 7 ? "input" : "idle",
    }),
  )

  render(() => {
    const [refresh, setRefresh] = createSignal(false)
    const [loaded, setLoaded] = createSignal(items.slice(-1))
    const refreshRows = () => setRefresh(true)
    document.addEventListener("sidebar-refresh", refreshRows)
    onCleanup(() => document.removeEventListener("sidebar-refresh", refreshRows))

    return (
      <ConversationSidebar
        text={(key) => key}
        projects={[
          {
            id: "reports",
            directory: "/reports",
            title: "Отчёты",
            conversations: refresh() ? loaded().map((item) => ({ ...item })) : loaded(),
          },
          { id: "other", directory: "/other", title: "Другой проект", conversations: [] },
        ]}
        conversations={[{ id: "loose", title: "Разговор без проекта", created: 0, active: false, activity: "running" }]}
        onLoadProjectSessions={async (id, limit) => {
          if (id !== "reports") return false

          const page = items.slice(-limit)
          setLoaded(page)

          return page.length < items.length
        }}
        onCreate={async (name) => {
          if (mode === "timeout") return new Promise<void>(() => {})

          if (!host.dataset.attempted) {
            host.dataset.attempted = "true"
            throw new Error("Couldn't create project")
          }

          host.dataset.created = name
        }}
        onOpenProject={() => {}}
        onNewInProject={() => {}}
        onOpenConversation={(id) => {
          host.dataset.opened = id
        }}
      />
    )
  }, host)
}
