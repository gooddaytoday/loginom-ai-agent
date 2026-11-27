import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { Menu } from "@opencode/ui/menu"
import { createSignal, For, Show, type JSX } from "solid-js"
import type { SidebarConversation, SidebarProject, SidebarText } from "./sidebar"

export type SidebarActions = {
  pins: readonly string[]
  onPin(id: string): void
  canManageProject(directory: string): boolean
  onProjectSettings(directory: string): void
  onRename(id: string, title: string): Promise<boolean>
  onMove(id: string, target?: { directory: string } | { name: string }): Promise<string | undefined>
  onCountFiles(id: string): Promise<number | undefined>
  onDeleteConversation(id: string, files: boolean): Promise<boolean>
  onDeleteProject(directory: string): Promise<boolean>
}

export const projectPin = (directory: string) => `project:${directory}`
export const sessionPin = (id: string) => `session:${id}`

type Prompt =
  | { kind: "rename" | "new" | "deleteConversation"; id: string; title: string }
  | { kind: "deleteProject"; directory: string; title: string }

export function createSidebarActions(
  props: SidebarActions & {
    projects: readonly SidebarProject[]
    text: SidebarText
  },
  openProject: (directory: string) => void,
) {
  const [prompt, setPrompt] = createSignal<Prompt>()
  const [busy, setBusy] = createSignal(false)
  const [count, setCount] = createSignal<number>()
  let dialog: HTMLDialogElement | undefined

  function ask(next: Prompt) {
    setCount(undefined)
    setPrompt(next)
    dialog?.showModal()
    if (next.kind === "deleteConversation")
      void props.onCountFiles(next.id).then((value) => {
        if (prompt() === next) setCount(value)
      })
  }

  async function move(id: string, target?: Parameters<SidebarActions["onMove"]>[1]) {
    const directory = await props.onMove(id, target)
    if (target && directory) openProject(directory)
    return directory !== undefined
  }

  async function submit(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
    event.preventDefault()
    const value = prompt()
    if (!value || busy()) return
    const data = new FormData(event.currentTarget)
    const title = String(data.get("title") ?? "").trim()
    if ((value.kind === "rename" || value.kind === "new") && !title) return
    setBusy(true)
    try {
      let ok: boolean
      switch (value.kind) {
        case "rename":
          ok = await props.onRename(value.id, title)
          break
        case "new":
          ok = await move(value.id, { name: title })
          break
        case "deleteProject":
          ok = await props.onDeleteProject(value.directory)
          break
        case "deleteConversation":
          ok = await props.onDeleteConversation(value.id, data.has("files"))
          break
      }
      if (ok) dialog?.close()
    } finally {
      setBusy(false)
    }
  }

  function ActionsMenu(menu: { title: string; children: JSX.Element; onClose?: () => void }) {
    return (
      <Menu
        placement="bottom-end"
        onOpenChange={(open) => {
          if (!open) menu.onClose?.()
        }}
      >
        <Menu.Trigger
          class="grid size-7 shrink-0 place-items-center rounded-md hover:bg-v2-overlay-simple-overlay-hover [@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 data-[expanded]:opacity-100"
          aria-label={`${props.text("actions")} — ${menu.title}`}
        >
          <Icon name="outline-dots" size="small" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content class="min-w-44 max-h-[60dvh] max-w-60 overflow-y-auto">{menu.children}</Menu.Content>
        </Menu.Portal>
      </Menu>
    )
  }

  const pin = (id: string) => (
    <Menu.Item onSelect={() => props.onPin(id)}>
      <Icon name={props.pins.includes(id) ? "check-small" : "plus"} size="small" />
      {props.text(props.pins.includes(id) ? "unpin" : "pin")}
    </Menu.Item>
  )

  function ConversationMenu(row: { item: SidebarConversation; project?: SidebarProject }) {
    const [choosing, setChoosing] = createSignal(false)
    let back: HTMLElement | undefined
    let choose: HTMLElement | undefined

    const showTargets = (open: boolean) => {
      setChoosing(open)
      queueMicrotask(() => (open ? back : choose)?.focus())
    }
    return (
      <ActionsMenu title={row.item.title} onClose={() => setChoosing(false)}>
        <Show
          when={!choosing()}
          fallback={
            <>
              <Menu.Item
                ref={(element: HTMLElement) => (back = element)}
                closeOnSelect={false}
                onSelect={() => showTargets(false)}
              >
                <Icon name="chevron-left" size="small" />
                {props.text("back")}
              </Menu.Item>
              <For
                each={props.projects.filter(
                  (project) =>
                    project.directory !== row.project?.directory && props.canManageProject(project.directory),
                )}
              >
                {(project) => (
                  <Menu.Item onSelect={() => void move(row.item.id, { directory: project.directory })}>
                    <Icon name="folder" size="small" />
                    <span class="truncate">{project.title}</span>
                  </Menu.Item>
                )}
              </For>
              <Menu.Item onSelect={() => ask({ kind: "new", id: row.item.id, title: row.item.title })}>
                <Icon name="folder-add-left" size="small" />
                {props.text("moveNew")}
              </Menu.Item>
            </>
          }
        >
          <Menu.Item onSelect={() => ask({ kind: "rename", id: row.item.id, title: row.item.title })}>
            <Icon name="edit" size="small" />
            {props.text("rename")}
          </Menu.Item>
          {pin(sessionPin(row.item.id))}
          <Menu.Item
            closeOnSelect={false}
            disabled={row.item.activity !== "idle"}
            ref={(element: HTMLElement) => (choose = element)}
            onSelect={() => showTargets(true)}
          >
            <Icon name="folder" size="small" />
            {props.text("move")}
          </Menu.Item>
          <Show when={row.project}>
            <Menu.Item disabled={row.item.activity !== "idle"} onSelect={() => void move(row.item.id)}>
              <Icon name="close" size="small" />
              {props.text("detach")}
            </Menu.Item>
          </Show>
          <Menu.Item
            class="!text-v2-state-fg-danger"
            onSelect={() => ask({ kind: "deleteConversation", id: row.item.id, title: row.item.title })}
          >
            <Icon name="trash" size="small" />
            {props.text("deleteConversation")}
          </Menu.Item>
        </Show>
      </ActionsMenu>
    )
  }

  function ProjectMenu(row: { project: SidebarProject }) {
    return (
      <ActionsMenu title={row.project.title}>
        {pin(projectPin(row.project.directory))}
        <Menu.Item onSelect={() => props.onProjectSettings(row.project.directory)}>
          <Icon name="settings-gear" size="small" />
          {props.text("projectSettings")}
        </Menu.Item>
        <Show when={props.canManageProject(row.project.directory)}>
          <Menu.Item
            class="!text-v2-state-fg-danger"
            onSelect={() => ask({ kind: "deleteProject", directory: row.project.directory, title: row.project.title })}
          >
            <Icon name="trash" size="small" />
            {props.text("deleteProject")}
          </Menu.Item>
        </Show>
      </ActionsMenu>
    )
  }

  function ActionDialog() {
    const title = () => {
      const kind = prompt()?.kind
      return props.text(kind === "new" ? "moveNew" : (kind ?? "actions"))
    }
    return (
      <dialog
        ref={dialog}
        aria-label={title()}
        class="m-auto w-[min(26rem,calc(100%-2rem))] rounded-lg bg-v2-background-bg-base p-4 text-v2-text-text-base shadow-lg backdrop:bg-black/40"
        onClose={() => setPrompt(undefined)}
        onCancel={(event) => {
          if (busy()) event.preventDefault()
        }}
      >
        <Show when={prompt()} keyed>
          {(value) => {
            const deleting = value.kind === "deleteConversation" || value.kind === "deleteProject"
            const title = props.text(value.kind === "new" ? "moveNew" : value.kind)
            return (
              <form onSubmit={submit} class="flex flex-col gap-3">
                <h2 class="font-medium">{title}</h2>
                <Show
                  when={deleting}
                  fallback={
                    <input
                      name="title"
                      required
                      autofocus
                      maxLength={120}
                      disabled={busy()}
                      value={value.kind === "rename" ? value.title : ""}
                      aria-label={value.kind === "rename" ? title : props.text("projectName")}
                      class="rounded border border-v2-border-border-muted bg-transparent px-2 py-1"
                    />
                  }
                >
                  <p>
                    {props
                      .text(value.kind === "deleteProject" ? "confirmProject" : "confirmConversation")
                      .replace("{{name}}", () => value.title)}
                  </p>
                  <Show when={count() !== undefined}>
                    <label class="flex items-center gap-2">
                      <input type="checkbox" name="files" disabled={busy()} />
                      {props.text("deleteFiles").replace("{{count}}", String(count()))}
                    </label>
                  </Show>
                </Show>
                <div class="flex justify-end gap-2">
                  <Button type="button" variant="ghost" disabled={busy()} onClick={() => dialog?.close()}>
                    {props.text("cancelProject")}
                  </Button>
                  <Button type="submit" variant={deleting ? "danger" : "contrast"} disabled={busy()}>
                    {deleting ? title : props.text(value.kind === "new" ? "createProject" : "save")}
                  </Button>
                </div>
              </form>
            )
          }}
        </Show>
      </dialog>
    )
  }

  return { ConversationMenu, ProjectMenu, ActionDialog }
}
