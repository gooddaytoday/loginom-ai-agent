import { BuiltinSlot, ComposerFileType, type ComposerSlotInput } from "@opencode/plugin/gui/builtin"
import type { Plugin } from "@opencode/plugin/gui"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { createSignal, For, Show, type Accessor, type Setter } from "solid-js"
import type definition from "./index"

const packageFile = {
  mime: "application/vnd.loginom.package",
  matches: (filename: string) => filename.toLowerCase().endsWith(".lgp"),
} satisfies ComposerFileType

type LoginomPackage = { readonly name: string; readonly path: string }

type PackagePicker = () => Promise<LoginomPackage | undefined>

export const registerComposer: Plugin.Setup<typeof definition> = (ctx) => {
  const ui = ctx.ui
  const selections = new WeakMap<object, [Accessor<LoginomPackage | undefined>, Setter<LoginomPackage | undefined>]>()

  const selection = (input: ComposerSlotInput) => {
    const existing = selections.get(input.draft)

    if (existing) return existing

    const next = createSignal<LoginomPackage>()
    selections.set(input.draft, next)

    return next
  }

  const pick: PackagePicker = async () => {
    await ctx.dialogs.alert({ title: ctx.t("composerLoginom"), description: ctx.t("composerPickerUnavailable") })

    return undefined
  }

  const catalog = (input: ComposerSlotInput) => input.openPage("loginom-gui", "catalog")

  const packageActions = ["composerDocument", "composerCheck", "composerImprove", "composerCompare"] as const

  function PackageCard(props: {
    input: ComposerSlotInput
    name: string
    path: string
    source: "file" | "loginom"
    remove(): void
  }) {
    return (
      <div class="flex min-w-0 flex-col gap-2 text-v2-text-text-base">
        <div class="flex min-w-0 items-center gap-2 rounded-lg border border-v2-border-border-base px-2 py-1">
          <Icon name="file-document" class="shrink-0" />
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-semibold" title={props.name}>
              {props.name}
            </div>
            <div class="text-xs text-v2-text-text-muted">
              {ctx.t(props.source === "file" ? "composerFile" : "title")}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost-muted"
            size="small"
            onClick={() =>
              props.input.openPage(
                "loginom-gui",
                "packages",
                new URLSearchParams({ source: props.source, path: props.path }),
              )
            }
          >
            {ctx.t("composerScheme")}
          </Button>
          <IconButton
            type="button"
            variant="ghost-muted"
            icon={<Icon name="close" />}
            aria-label={ctx.t("composerRemove", { name: props.name })}
            onClick={props.remove}
          />
        </div>
        <div role="group" aria-label={ctx.t("composerActions")} class="flex flex-wrap items-center gap-1">
          <span class="text-xs text-v2-text-text-muted">{ctx.t("composerActions")}:</span>
          <For each={packageActions}>
            {(action) => (
              <Button
                type="button"
                variant="ghost-muted"
                size="small"
                title={ctx.t("composerAddAction")}
                onClick={() => catalog(props.input)}
              >
                <Icon name="plus" size="small" />
                {ctx.t(action)}
              </Button>
            )}
          </For>
          <Button type="button" variant="ghost-muted" size="small" onClick={() => catalog(props.input)}>
            {ctx.t("composerMore")}
          </Button>
        </div>
      </div>
    )
  }

  ctx.add(ComposerFileType, packageFile)
  ctx.add(BuiltinSlot, {
    at: "composer.add-menu",
    render: (input) => (
      <>
        <ui.MenuItem
          label={ctx.t("composerLoginom")}
          icon="folder"
          onSelect={() => {
            const [, setSelected] = selection(input)
            void pick().then((selected) => {
              if (selected) setSelected(selected)
            })
          }}
        />
        <ui.MenuItem
          label={ctx.t("composerFile")}
          icon="file-document"
          keys={ctx.keybinds.keybind("file.attach")}
          onSelect={input.attach}
        />
        <ui.MenuItem label={ctx.t("composerCatalog")} onSelect={() => catalog(input)} />
      </>
    ),
  })
  ctx.add(BuiltinSlot, {
    at: "composer.above",
    render: (input) => (
      <>
        <Show when={selection(input)[0]()}>
          {(item) => (
            <PackageCard
              input={input}
              name={item().name}
              path={item().path}
              source="loginom"
              remove={() => selection(input)[1](undefined)}
            />
          )}
        </Show>
        <For each={input.files.filter((file) => file.mime === packageFile.mime)}>
          {(file) => (
            <PackageCard
              input={input}
              name={file.filename}
              path={file.path}
              source="file"
              remove={() => input.removeFile(file.id)}
            />
          )}
        </For>
      </>
    ),
  })
}
