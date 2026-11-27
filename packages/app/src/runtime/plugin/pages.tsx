import { For, Show, createMemo } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { Page } from "@opencode/plugin/gui"
import { usePluginHost } from "./host"
import { Contribution } from "./render"

/** Renders the plugin page named by the route, inside its plugin's contribution boundary. */
export function PluginPageRoute() {
  const params = useParams<{ plugin: string; page: string }>()
  const host = usePluginHost()

  const item = createMemo(() =>
    host.items(Page).find((entry) => entry.plugin === params.plugin && entry.value.id === params.page),
  )

  return (
    <Show when={item()} keyed>
      {(entry) => <Contribution plugin={entry.plugin}>{() => entry.value.render()}</Contribution>}
    </Show>
  )
}

/** Navigation entries for plugin pages that ask for nav, by `order`. */
export function PluginPageNav(props: { horizontal?: boolean; onNavigate?: () => void }) {
  const host = usePluginHost()
  const navigate = useNavigate()

  const items = createMemo(() =>
    host
      .items(Page)
      .filter((entry) => entry.value.nav)
      .toSorted((a, b) => (a.value.nav?.order ?? 0) - (b.value.nav?.order ?? 0)),
  )

  return (
    <Show when={items().length > 0}>
      <nav
        data-slot="sidebar-plugin-pages"
        class="flex shrink-0 gap-[3px]"
        classList={{ "w-full flex-col": !props.horizontal }}
      >
        <For each={items()}>
          {(entry) => (
            <button
              type="button"
              class="h-7 rounded-[6px] px-2 text-start text-[13px] leading-4 text-v2-text-text-base hover:bg-v2-background-bg-layer-02 focus-visible:bg-v2-background-bg-layer-02"
              onClick={() => {
                navigate(`/page/${entry.plugin}/${entry.value.id}`)
                props.onNavigate?.()
              }}
            >
              {entry.value.title}
            </button>
          )}
        </For>
      </nav>
    </Show>
  )
}
