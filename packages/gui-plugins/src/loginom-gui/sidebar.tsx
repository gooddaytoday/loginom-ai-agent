import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { For, Show, createSignal, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import en from "./i18n/en"
import { createSidebarActions, projectPin, sessionPin, type SidebarActions } from "./sidebar-actions"

export type SidebarActivity = "input" | "running" | "idle"
export type SidebarConversation = { id: string; title: string; active: boolean; activity: SidebarActivity }
export type SidebarProject = { directory: string; title: string; conversations: readonly SidebarConversation[] }
export type SidebarText = (key: keyof typeof en) => string

const pageSize = 6
const row =
  "flex min-w-0 min-h-7 w-full items-center gap-2 rounded-md px-2 text-start text-sm hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover"

export function folderActivity(items: readonly SidebarConversation[]): SidebarActivity {
  if (items.some((item) => item.activity === "input")) return "input"
  return items.some((item) => item.activity === "running") ? "running" : "idle"
}

function Activity(props: { value: SidebarActivity; text: SidebarText }) {
  return (
    <Show when={props.value !== "idle"}>
      <span
        role="img"
        aria-label={props.text(props.value === "input" ? "conversationWaiting" : "conversationRunning")}
        title={props.text(props.value === "input" ? "conversationWaiting" : "conversationRunning")}
        class="size-2 shrink-0 rounded-full"
        classList={{
          "bg-amber-500": props.value === "input",
          "bg-blue-500 motion-safe:animate-pulse": props.value === "running",
        }}
      />
    </Show>
  )
}

export function ConversationSidebar(
  props: {
    projects: readonly SidebarProject[]
    conversations: readonly SidebarConversation[]
    text: SidebarText
    onCreate(name: string): Promise<boolean>
    onNewInProject(directory: string): void
    onOpenConversation(id: string): void
  } & SidebarActions,
) {
  const [expanded, setExpanded] = createStore<Record<string, number | undefined>>({})
  const [form, setForm] = createSignal<"closed" | "editing" | "saving">("closed")
  const open = (directory: string) => setExpanded(directory, (limit) => limit || pageSize)

  const submit: JSX.EventHandler<HTMLFormElement, SubmitEvent> = async (event) => {
    event.preventDefault()
    const name = new FormData(event.currentTarget).get("name")
    if (form() !== "editing" || typeof name !== "string" || !name.trim()) return
    setForm("saving")
    setForm((await props.onCreate(name.trim())) ? "closed" : "editing")
  }

  const { ConversationMenu, ProjectMenu, ActionDialog } = createSidebarActions(props, open)
  const isPinned = (id: string) => props.pins.includes(id)
  const pinnedProjects = () => props.projects.filter((project) => isPinned(projectPin(project.directory)))
  const pinnedConversations = () =>
    [
      ...props.conversations.map((item) => ({ item, project: undefined })),
      ...props.projects.flatMap((project) => project.conversations.map((item) => ({ item, project }))),
    ].filter(({ item }) => isPinned(sessionPin(item.id)))

  const conversation = (item: SidebarConversation, project?: SidebarProject, pinned = false) => (
    <div class="group flex min-w-0 items-center">
      <button
        type="button"
        class={row}
        classList={{ "ps-7": !!project && !pinned, "bg-v2-overlay-simple-overlay-hover": item.active }}
        aria-current={item.active ? "page" : undefined}
        onClick={() => {
          if (project) open(project.directory)
          props.onOpenConversation(item.id)
        }}
      >
        <span class="min-w-0 flex-1" dir="auto">
          <span class="block truncate">{item.title}</span>
          <Show when={pinned && project}>
            <span class="block truncate text-xs text-v2-text-text-muted">{project?.title}</span>
          </Show>
        </span>
        <Activity value={item.activity} text={props.text} />
      </button>
      <ConversationMenu item={item} project={project} />
    </div>
  )

  const projectRow = (project: SidebarProject) => {
    const visible = () => project.conversations.filter((item) => !isPinned(sessionPin(item.id)))
    const limit = () => expanded[project.directory] ?? (visible().some((item) => item.active) ? pageSize : 0)
    return (
      <div>
        <div class="group flex items-center">
          <button
            type="button"
            class={row}
            aria-expanded={limit() > 0}
            onClick={() => setExpanded(project.directory, limit() ? 0 : pageSize)}
          >
            <Icon name="folder" size="small" class="shrink-0" />
            <span class="min-w-0 flex-1 truncate" dir="auto">
              {project.title}
            </span>
            <Show when={!limit()}>
              <Activity value={folderActivity(project.conversations)} text={props.text} />
            </Show>
          </button>
          <IconButton
            icon={<Icon name="edit" size="small" />}
            class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
            size="small"
            variant="ghost"
            aria-label={props.text("newInProject")}
            title={props.text("newInProject")}
            onClick={() => {
              open(project.directory)
              props.onNewInProject(project.directory)
            }}
          />
          <ProjectMenu project={project} />
        </div>
        <Show when={limit() > 0}>
          <For each={visible().slice(0, limit())}>{(item) => conversation(item, project)}</For>
          <Show when={visible().length > limit()}>
            <Button
              variant="ghost-muted"
              size="small"
              class="ms-5"
              onClick={() => setExpanded(project.directory, limit() + pageSize)}
            >
              {props.text("showMoreConversations")}
            </Button>
          </Show>
        </Show>
      </div>
    )
  }

  return (
    <nav
      aria-label={props.text("conversationNavigation")}
      class="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto pb-2"
    >
      <Show when={pinnedProjects().length || pinnedConversations().length}>
        <section aria-label={props.text("pinned")}>
          <h2 class="px-2 text-sm font-medium text-v2-text-text-muted">{props.text("pinned")}</h2>
          <For each={pinnedProjects()}>{projectRow}</For>
          <For each={pinnedConversations()}>{({ item, project }) => conversation(item, project, true)}</For>
        </section>
      </Show>
      <section aria-label={props.text("projects")}>
        <h2 class="px-2 text-sm font-medium text-v2-text-text-muted">{props.text("projects")}</h2>
        <button
          type="button"
          class={row}
          aria-expanded={form() !== "closed"}
          disabled={form() === "saving"}
          onClick={() => setForm("editing")}
        >
          <Icon name="folder-add-left" size="small" />
          {props.text("newProject")}
        </button>
        <Show when={form() !== "closed"}>
          <form class="flex flex-col gap-2 p-2" onSubmit={submit}>
            <input
              name="name"
              autofocus
              required
              maxLength={120}
              disabled={form() === "saving"}
              aria-label={props.text("projectName")}
              placeholder={props.text("projectName")}
              class="min-w-0 rounded border border-v2-border-border-muted bg-transparent px-2 py-1"
            />
            <div class="flex gap-2">
              <Button type="submit" size="small" disabled={form() === "saving"}>
                {props.text("createProject")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="small"
                disabled={form() === "saving"}
                onClick={() => setForm("closed")}
              >
                {props.text("cancelProject")}
              </Button>
            </div>
          </form>
        </Show>
        <For each={props.projects.filter((project) => !isPinned(projectPin(project.directory)))}>{projectRow}</For>
      </section>
      <section aria-label={props.text("conversations")}>
        <h2 class="px-2 text-sm font-medium text-v2-text-text-muted">{props.text("conversations")}</h2>
        <For each={props.conversations.filter((item) => !isPinned(sessionPin(item.id)))}>
          {(item) => conversation(item)}
        </For>
      </section>
      <ActionDialog />
    </nav>
  )
}
