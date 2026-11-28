import { usePlugin } from "@opencode/plugin/gui"
import { For, Match, Show, Switch } from "solid-js"
import type { PackageAction, PackageSelection } from "./contract"
import type definition from "./index"

export default function Packages(props: {
  selected?: PackageSelection
  actions: readonly PackageAction[]
  choose: () => void
  upload: (file?: File) => void
  run: (action: PackageAction, entry: Extract<PackageSelection, { kind: "loginom" }>) => void
}) {
  const ctx = usePlugin<typeof definition>()
  const ui = ctx.ui
  const local = () => props.selected?.kind === "file" ? props.selected.file : undefined
  const remote = () => props.selected?.kind === "loginom" ? props.selected : undefined

  return (
    <main class="h-full min-h-0 w-full overflow-auto">
      <div class="mx-auto flex w-full max-w-[960px] flex-col gap-5 px-4 py-6 sm:px-8">
        <header class="flex flex-wrap items-center justify-between gap-3">
          <h1 class="text-xl font-semibold">{ctx.t("packages.title")}</h1>
          <div class="flex flex-wrap gap-2">
            <ui.Button variant="contrast" onClick={props.choose}>
              {ctx.t("packages.fromLoginom")}
            </ui.Button>
            <ui.Button onClick={() => props.upload(local())}>{ctx.t("packages.fromComputer")}</ui.Button>
          </div>
        </header>
        <Switch fallback={<p class="text-text-weak">{ctx.t("packages.noSelection")}</p>}>
          <Match when={local()}>
            {(file) => (
              <div class="flex flex-wrap items-center gap-2 rounded-lg border border-border-weak-base p-3">
                <h2 class="min-w-0 break-all">{file().name}</h2>
                <ui.Button onClick={() => props.upload(file())}>{ctx.t("packages.copy")}</ui.Button>
              </div>
            )}
          </Match>
          <Match when={remote()}>
            {(entry) => (
              <section class="rounded-xl border border-border-weak-base p-4">
                <div class="flex items-start gap-3">
                  <ui.Icon name="file-document" />
                  <div class="min-w-0 break-all">
                    <h2 class="text-16-medium">{entry().package.name}</h2>
                    <p class="text-12-regular text-text-weak">{entry().package.path}</p>
                  </div>
                </div>
                <div class="mt-4 grid min-h-40 place-items-center rounded-lg border border-dashed border-border-weak-base p-3 text-text-weak">
                  {ctx.t("packages.diagram")}
                </div>
              </section>
            )}
          </Match>
        </Switch>
        <section class="flex flex-col gap-2">
          <h2 class="text-16-medium">{ctx.t("packages.actions")}</h2>
          <Show when={remote()}>
            {(entry) => (
              <div class="grid gap-2 sm:grid-cols-2">
                <For each={props.actions} fallback={<p class="text-text-weak">{ctx.t("packages.noActions")}</p>}>
                  {(action) => (
                    <button
                      type="button"
                      class="rounded-lg border border-border-weak-base p-3 text-start hover:bg-surface-base-hover"
                      onClick={() => props.run(action, entry())}
                    >
                      <span class="block text-13-medium">{action.title}</span>
                      <Show when={action.description}>
                        <span class="text-12-regular text-text-weak">{action.description}</span>
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            )}
          </Show>
        </section>
      </div>
    </main>
  )
}
