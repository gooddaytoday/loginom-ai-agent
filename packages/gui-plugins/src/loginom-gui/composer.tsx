import { BuiltinSlot, ComposerAddItem, ComposerFileType, type ComposerSlotInput } from "@opencode/plugin/gui/builtin"
import type { Plugin } from "@opencode/plugin/gui"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Tooltip } from "@opencode/ui/tooltip"
import { For, Show } from "solid-js"
import type { PackageSelection } from "./contract"
import type definition from "./index"

const packageFile = {
  mime: "application/vnd.loginom.package",
  matches: (filename: string) => filename.toLowerCase().endsWith(".lgp"),
} satisfies ComposerFileType

export function registerComposer(
  ctx: Parameters<Plugin.Setup<typeof definition>>[0],
  packages: {
    pick(select: (selection: PackageSelection) => void, showPage: () => void): void
    showDiagram(selection: PackageSelection): void
  },
) {
  const selections = ctx.stores.composerPackages

  const catalog = (input: ComposerSlotInput) => input.openPage("loginom-gui", "catalog")

  const builtInActions = [
    { label: "composerDocument", skill: "package-docs", prompt: "composerDocumentPrompt" },
    { label: "composerCheck", skill: "package-linter", prompt: "composerCheckPrompt" },
  ] as const

  const catalogActions = ["composerImprove", "composerCompare"] as const

  function PackageCard(props: {
    input: ComposerSlotInput
    name: string
    source: "file" | "loginom"
    diagram?(): void
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
          <Show when={props.diagram && props.input.hasPage("loginom-gui", "packages")}>
            <Button
              type="button"
              variant="ghost-muted"
              size="small"
              onClick={props.diagram}
            >
              {ctx.t("packages.diagram")}
            </Button>
          </Show>
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
          <For each={builtInActions}>
            {(action) => {
              const available = () => props.input.hasSkill(action.skill)
              const hint = () => ctx.t("composerSkillUnavailable", { skill: action.skill })

              return (
                <Tooltip value={hint()} inactive={available()} triggerTabIndex={0}>
                  <Button
                    type="button"
                    variant="ghost-muted"
                    size="small"
                    disabled={!available()}
                    aria-description={available() ? undefined : hint()}
                    onClick={() => props.input.appendSkillPrompt(action.skill, ctx.t(action.prompt, { name: props.name }))}
                  >
                    {ctx.t(action.label)}
                  </Button>
                </Tooltip>
              )
            }}
          </For>
          <For each={catalogActions}>
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
  ctx.add(ComposerAddItem, {
    get title() {
      return ctx.t("composerLoginom")
    },
    icon: "folder",
    run(input) {
      packages.pick((selection) => {
        if (selection.kind === "file") return input.attach(selection.file)

        selections.update((draft) => {
          draft[input.draftKey] = selection
        })
      }, () => input.openPage("packages"))
    },
  })
  ctx.add(ComposerAddItem, {
    get title() {
      return ctx.t("composerFile")
    },
    icon: "file-document",
    get keys() {
      return ctx.keybinds.keybind("file.attach")
    },
    replacesAttachment: true,
    run: (input) => input.attach(),
  })
  ctx.add(ComposerAddItem, {
    get title() {
      return ctx.t("composerCatalog")
    },
    run: (input) => input.openPage("catalog"),
  })
  ctx.add(BuiltinSlot, {
    at: "composer.above",
    render: (input) => (
      <>
        <Show when={selections.value[input.draftKey]}>
          {(item) => (
            <PackageCard
              input={input}
              name={item().package.name}
              source="loginom"
              diagram={() => {
                packages.showDiagram(item())
                input.openPage("loginom-gui", "packages")
              }}
              remove={() =>
                selections.update((draft) => {
                  delete draft[input.draftKey]
                })
              }
            />
          )}
        </Show>
        <For each={input.files.filter((file) => file.mime === packageFile.mime)}>
          {(file) => (
            <PackageCard
              input={input}
              name={file.filename}
              source="file"
              remove={() => input.removeFile(file.id)}
            />
          )}
        </For>
      </>
    ),
  })
}
