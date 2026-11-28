import { For, Show, createMemo, createSignal } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { Page } from "@opencode/plugin/gui/builtin"
import { Button } from "@opencode/ui/button"
import { Loader } from "@opencode/ui/loader"
import { useLanguage } from "@/runtime/i18n/language"
import { useCurrentRoute } from "../../shell/state/layout"
import { usePluginHost } from "./host"
import { Contribution } from "./render"

export function usePluginPageNavigation() {
  const host = usePluginHost()
  const navigate = useNavigate()

  return {
    hasPage: (plugin: string, page: string) =>
      host.items(Page).some((entry) => entry.plugin === plugin && entry.value.id === page),
    openPage(plugin: string, page: string, query?: URLSearchParams) {
      const path = `/page/${encodeURIComponent(plugin)}/${encodeURIComponent(page)}`
      navigate(query?.size ? `${path}?${query}` : path)
    },
  }
}

export function useActivePluginPage() {
  const route = useCurrentRoute()
  const host = usePluginHost()

  return createMemo(() => {
    const target = route()

    if (target.type !== "page") return

    return host.items(Page).find((entry) => entry.plugin === target.plugin && entry.value.id === target.page)
  })
}

/** Renders the plugin page named by the route, inside its plugin's contribution boundary. */
export function PluginPageRoute() {
  const item = useActivePluginPage()

  return (
    <Show when={item()} keyed fallback={<PagePending />}>
      {(entry) => {
        const [failed, setFailed] = createSignal(false)

        return (
          <Show when={!failed()} fallback={<PageUnavailable />}>
            <Contribution plugin={entry.plugin} failed={() => setFailed(true)}>
              {() => entry.value.render()}
            </Contribution>
          </Show>
        )
      }}
    </Show>
  )
}

function PagePending() {
  const route = useCurrentRoute()
  const host = usePluginHost()
  const language = useLanguage()
  const loading = () => {
    const target = route()

    if (target.type !== "page") return false

    const status = host.status(target.plugin)

    return (
      status === "loading" ||
      (status === undefined && host.definitions().some((definition) => definition.id === target.plugin))
    )
  }

  return (
    <Show when={loading()} fallback={<PageUnavailable />}>
      <div class="flex min-h-0 flex-1 items-center justify-center">
        <Loader role="img" aria-hidden="false" aria-label={language.t("common.loading")} />
      </div>
    </Show>
  )
}

function PageUnavailable() {
  const language = useLanguage()
  const navigate = useNavigate()

  return (
    <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-4 text-v2-text-text-base">
      <h1 class="text-16-medium">{language.t("plugin.page.unavailable")}</h1>
      <Button type="button" variant="neutral" size="normal" onClick={() => navigate("/")}>
        {language.t("plugin.page.backHome")}
      </Button>
    </div>
  )
}

/** Navigation entries for plugin pages that ask for nav, by `order`. */
export function PluginPageNav(props: { horizontal?: boolean; onNavigate?: () => void }) {
  const host = usePluginHost()
  const { openPage } = usePluginPageNavigation()
  const language = useLanguage()
  const active = useActivePluginPage()

  const items = createMemo(() =>
    host
      .items(Page)
      .filter((entry) => entry.value.nav)
      .toSorted((a, b) => (a.value.nav?.order ?? 0) - (b.value.nav?.order ?? 0)),
  )

  return (
    <Show when={items().length > 0}>
      <nav
        aria-label={language.t("plugin.page.navigation")}
        class="flex shrink-0 gap-[3px]"
        classList={{ "w-full flex-col": !props.horizontal }}
      >
        <For each={items()}>
          {(entry) => (
            <button
              type="button"
              class="h-7 rounded-[6px] px-2 text-start text-[13px] leading-4 text-v2-text-text-base hover:bg-v2-background-bg-layer-02 focus-visible:bg-v2-background-bg-layer-02 aria-[current=page]:bg-v2-background-bg-layer-02"
              aria-current={active() === entry ? "page" : undefined}
              onClick={() => {
                openPage(entry.plugin, entry.value.id)
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
