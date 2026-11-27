import { createSignal } from "solid-js"
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

  const [pins, setPins] = createSignal<string[]>([])

  render(
    () => (
      <ConversationSidebar
        text={(key) => key}
        projects={[
          { directory: "/reports", title: "Отчёты", conversations: items },
          { directory: "/other", title: "Другой проект", conversations: [] },
        ]}
        conversations={[{ id: "loose", title: "Разговор без проекта", active: false, activity: "idle" }]}
        onCreate={async () => false}
        pins={pins()}
        onPin={(id) =>
          setPins((current) => (current.includes(id) ? current.filter((pin) => pin !== id) : [...current, id]))
        }
        canManageProject={() => true}
        onProjectSettings={(directory) => {
          host.dataset.settings = directory
        }}
        onRename={async (id, title) => {
          host.dataset.renamed = `${id}:${title}`
          return true
        }}
        onMove={async (id, target) => {
          const name = target ? ("name" in target ? target.name : target.directory) : "/loose"
          host.dataset.moved = `${id}:${name}`
          return "directory" in (target ?? {}) ? name : "/other"
        }}
        onCountFiles={async (id) => (id === "loose" ? 2 : undefined)}
        onDeleteConversation={async (id, files) => {
          host.dataset.deleted = `${id}:${files}`
          return true
        }}
        onDeleteProject={async (directory) => {
          host.dataset.deletedProject = directory
          return true
        }}
        onNewInProject={() => {}}
        onOpenConversation={(id) => {
          host.dataset.opened = id
        }}
      />
    ),
    host,
  )
}
