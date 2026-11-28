import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Predicate } from "effect"
import { For, Show, createMemo, createSignal, onCleanup, type Accessor, type JSX } from "solid-js"
import en from "./i18n/en"
import { transitionProjectForm, type ProjectForm } from "./machine"

export type SidebarActivity = "input" | "running" | "idle"

export type SidebarConversation = {
  id: string
  title: string
  created: number
  active: boolean
  activity: SidebarActivity
}

export type SidebarProject = {
  id: string
  directory: string
  title: string
  conversations: readonly SidebarConversation[]
}

export type SidebarText = (key: keyof typeof en) => string

const pageSize = 6

const row =
  "flex min-w-0 min-h-7 w-full items-center gap-2 rounded-md px-2 text-start text-sm hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover"

const projectActions =
  "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"

function newest(items: readonly SidebarConversation[]) {
  return items.toSorted((left, right) => right.created - left.created || right.id.localeCompare(left.id))
}

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

export function ConversationSidebar(props: {
  projects: readonly SidebarProject[]
  conversations: readonly SidebarConversation[]
  text: SidebarText
  onCreate(name: string, signal: AbortSignal): Promise<void>
  onOpenProject(directory: string): void
  onNewInProject(directory: string): void
  onOpenConversation(id: string): void
}) {
  const [expanded, setExpanded] = createSignal(new Map<string, number>())
  const [form, setForm] = createSignal<ProjectForm>({ type: "closed" })
  let attempt: AbortController | undefined
  const expand = (id: string, limit: number) => setExpanded((current) => new Map(current).set(id, limit))
  const open = (id: string) => expand(id, expanded().get(id) || pageSize)

  const send = (event: Parameters<typeof transitionProjectForm>[1]) =>
    setForm((state) => transitionProjectForm(state, event))

  const loose = createMemo(() => newest(props.conversations))
  const projects = createMemo(() => new Map(props.projects.map((project) => [project.id, project])))

  const issue = () => {
    const state = form()

    return state.type === "editing" ? state.issue : undefined
  }

  const cancel = () => {
    const current = attempt
    attempt = undefined
    current?.abort()
  }

  onCleanup(cancel)

  const submit: JSX.EventHandler<HTMLFormElement, SubmitEvent> = async (event) => {
    event.preventDefault()

    const name = new FormData(event.currentTarget).get("name")

    if (form().type !== "editing" || !Predicate.isString(name)) return

    const next = send({ type: "submit", name })

    if (next.type !== "saving") return

    const controller = new AbortController()
    attempt = controller

    const timer = setTimeout(() => {
      cancel()
      send({ type: "timedOut" })
    }, 15_000)

    controller.signal.addEventListener("abort", () => clearTimeout(timer), { once: true })

    try {
      await props.onCreate(next.name, controller.signal)

      if (!controller.signal.aborted) send({ type: "created" })
    } catch {
      if (!controller.signal.aborted) send({ type: "failed" })
    } finally {
      clearTimeout(timer)

      if (attempt === controller) attempt = undefined
    }
  }

  const conversation = (item: Accessor<SidebarConversation>, project?: string) => (
    <button
      type="button"
      class={row}
      classList={{ "ps-7": !!project, "bg-v2-overlay-simple-overlay-hover": item().active }}
      aria-current={item().active ? "page" : undefined}
      onClick={() => {
        if (project) open(project)
        props.onOpenConversation(item().id)
      }}
    >
      <span class="min-w-0 flex-1 truncate" dir="auto">
        {item().title}
      </span>
      <Show when={!project}>
        <Activity value={item().activity} text={props.text} />
      </Show>
    </button>
  )

  const conversations = (items: Accessor<readonly SidebarConversation[]>, project?: string) => {
    const byID = createMemo(() => new Map(items().map((item) => [item.id, item])))

    return (
      <For each={[...byID().keys()]}>
        {(id) => <Show when={byID().get(id)}>{(item) => conversation(item, project)}</Show>}
      </For>
    )
  }

  return (
    <nav
      aria-label={props.text("conversationNavigation")}
      class="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto pb-2"
    >
      <section aria-label={props.text("projects")}>
        <h2 class="px-2 text-sm font-medium text-v2-text-text-muted">{props.text("projects")}</h2>
        <button
          type="button"
          class={row}
          aria-expanded={form().type !== "closed"}
          disabled={form().type === "saving"}
          onClick={() => send({ type: "open" })}
        >
          <Icon name="folder-add-left" size="small" />
          {props.text("newProject")}
        </button>
        <Show when={form().type !== "closed"}>
          <form class="flex flex-col gap-2 p-2" onSubmit={submit}>
            <input
              name="name"
              autofocus
              required
              maxLength={120}
              disabled={form().type === "saving"}
              aria-label={props.text("projectName")}
              placeholder={props.text("projectName")}
              class="min-w-0 rounded border border-v2-border-border-muted bg-transparent px-2 py-1"
            />
            <div class="flex gap-2">
              <Button type="submit" size="small" disabled={form().type === "saving"}>
                {props.text("createProject")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="small"
                onClick={() => {
                  cancel()
                  send({ type: "close" })
                }}
              >
                {props.text("cancelProject")}
              </Button>
            </div>
            <Show when={issue()}>
              {(reason) => (
                <p role="alert">
                  {props.text(reason() === "timedOut" ? "projectCreateTimedOut" : "projectCreateFailed")}
                </p>
              )}
            </Show>
          </form>
        </Show>
        <For each={[...projects().keys()]}>
          {(id) => (
            <Show when={projects().get(id)}>
              {(project) => {
                const limit = () =>
                  expanded().get(id) ?? (project().conversations.some((item) => item.active) ? pageSize : 0)

                const ordered = createMemo(() => newest(project().conversations).slice(0, limit()))

                return (
                  <div>
                    <div class="group flex items-center">
                      <button
                        type="button"
                        class={row}
                        aria-expanded={limit() > 0}
                        onClick={() => expand(id, limit() ? 0 : pageSize)}
                      >
                        <Icon name="folder" size="small" class="shrink-0" />
                        <span class="min-w-0 flex-1 truncate" dir="auto">
                          {project().title}
                        </span>
                        <Show when={!limit()}>
                          <Activity value={folderActivity(project().conversations)} text={props.text} />
                        </Show>
                      </button>
                      <IconButton
                        icon={<Icon name="plus" size="small" />}
                        size="small"
                        variant="ghost"
                        class={projectActions}
                        aria-label={props.text("newInProject")}
                        title={props.text("newInProject")}
                        onClick={() => {
                          open(id)
                          props.onNewInProject(project().directory)
                        }}
                      />
                      <IconButton
                        icon={<Icon name="edit" size="small" />}
                        size="small"
                        variant="ghost"
                        class={projectActions}
                        aria-label={props.text("openProject")}
                        title={props.text("openProject")}
                        onClick={() => {
                          open(id)
                          props.onOpenProject(project().directory)
                        }}
                      />
                    </div>
                    <Show when={limit() > 0}>
                      {conversations(ordered, id)}
                      <Show when={project().conversations.length > limit()}>
                        <Button
                          variant="ghost-muted"
                          size="small"
                          class="ms-5"
                          onClick={() => expand(id, limit() + pageSize)}
                        >
                          {props.text("showMoreConversations")}
                        </Button>
                      </Show>
                    </Show>
                  </div>
                )
              }}
            </Show>
          )}
        </For>
      </section>
      <section aria-label={props.text("conversations")}>
        <h2 class="px-2 text-sm font-medium text-v2-text-text-muted">{props.text("conversations")}</h2>
        {conversations(loose)}
      </section>
    </nav>
  )
}
