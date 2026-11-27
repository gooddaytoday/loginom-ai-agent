import { Slot, type Plugin } from "@opencode/plugin/gui"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { For, Show, onCleanup } from "solid-js"
import type definition from "./index"
import { LoginomWordmark } from "./wordmark"

const exampleOrigin = "loginom-gui.example"
const examples = [
  {
    title: "startAbc",
    detail: "startAbcDetail",
    prompt: "startAbcPrompt",
    icon: "bullet-list",
    color: "--v2-avatar-bg-red",
  },
  {
    title: "startDocument",
    detail: "startDocumentDetail",
    prompt: "startDocumentPrompt",
    icon: "file-document",
    color: "--v2-avatar-bg-green",
  },
  {
    title: "startScenario",
    detail: "startScenarioDetail",
    prompt: "startScenarioPrompt",
    icon: "branch",
    color: "--v2-avatar-bg-blue",
  },
  {
    title: "startQuality",
    detail: "startQualityDetail",
    prompt: "startQualityPrompt",
    icon: "check",
    color: "--v2-avatar-bg-purple",
  },
] as const

export const registerStartScreen: Plugin.Setup<typeof definition> = (ctx) => {
  const ui = ctx.ui
  const progress = ctx.stores.startExamples
  const visible = () => !progress.value.dismissed && progress.value.ownSessions < 3

  ctx.add(Slot, {
    at: "session.new",
    render(input) {
      if (input.placement === "heading") {
        return (
          <div
            class="flex items-center justify-center gap-2.5 text-v2-text-text-base"
            role="img"
            aria-label="Loginom | AI Agent"
          >
            <LoginomWordmark />
            <span class="border-s border-v2-border-border-base ps-2.5 text-lg font-semibold text-v2-text-text-muted">
              AI Agent
            </span>
          </div>
        )
      }
      if (input.placement === "toolbar") {
        return (
          <Show when={input.project}>
            {(name) => (
              <button
                type="button"
                class="flex max-w-40 items-center gap-1 rounded-md px-2 py-1 text-xs text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover"
                title={ctx.t("startProject", { name: name() })}
                aria-label={ctx.t("startProject", { name: name() })}
                onClick={input.openProject}
              >
                <Icon name="folder" size="small" class="shrink-0" />
                <span class="truncate">{name()}</span>
                <Icon name="chevron-down" size="small" class="shrink-0" />
              </button>
            )}
          </Show>
        )
      }
      if (input.placement === "add-menu") {
        return (
          <Show when={!visible()}>
            <ui.MenuItem
              label={ctx.t("startExamples")}
              onSelect={() => progress.set({ dismissed: false, ownSessions: 0 })}
            />
          </Show>
        )
      }
      onCleanup(
        input.onStarted((origin) => {
          if (origin === exampleOrigin) return
          progress.update((draft) => {
            draft.ownSessions = Math.min(3, draft.ownSessions + 1)
          })
        }),
      )

      return (
        <Show when={visible()}>
          <section aria-label={ctx.t("startExamples")} class="mt-2">
            <div class="mb-2 flex items-center justify-between">
              <h2 class="text-sm! font-semibold! text-v2-text-text-muted!">{ctx.t("startExamples")}</h2>
              <IconButton
                icon={<Icon name="close" />}
                variant="ghost-muted"
                aria-label={ctx.t("startDismiss")}
                onClick={() =>
                  progress.update((draft) => {
                    draft.dismissed = true
                  })
                }
              />
            </div>
            <div class="grid grid-cols-1 gap-2 @min-xl:grid-cols-2">
              <For each={examples}>
                {(example) => (
                  <button
                    type="button"
                    class="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 rounded-[10px] border border-v2-border-border-base px-3 py-2.5 text-start hover:bg-v2-overlay-simple-overlay-hover"
                    onClick={() => input.insertPrompt(ctx.t(example.prompt), exampleOrigin)}
                  >
                    <span
                      class="row-span-2 grid size-8 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--example-accent)_13%,transparent)] text-[color:var(--example-accent)]"
                      style={{ "--example-accent": `var(${example.color})` }}
                    >
                      <Icon name={example.icon} />
                    </span>
                    <strong class="text-sm font-semibold text-v2-text-text-base">{ctx.t(example.title)}</strong>
                    <span class="text-xs text-v2-text-text-muted">{ctx.t(example.detail)}</span>
                  </button>
                )}
              </For>
            </div>
          </section>
        </Show>
      )
    },
  })
}
