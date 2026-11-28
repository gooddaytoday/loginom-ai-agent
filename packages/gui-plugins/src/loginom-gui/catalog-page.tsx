import { usePlugin } from "@opencode/plugin/gui"
import { Checkbox } from "@opencode/ui/checkbox"
import { Icon } from "@opencode/ui/icon"
import { createMemo, createSignal, For, Show } from "solid-js"
import type definition from "./index"
import { bundledItems, kinds, tabs, tiers, type Kind, type Tab, type Tier } from "./catalog"

const chip =
  "rounded-md border border-v2-border-border-muted px-2.5 py-1.5 text-sm hover:bg-v2-background-bg-layer-02 aria-pressed:bg-v2-background-bg-layer-02 aria-pressed:font-semibold"

type Copy = {
  title: string
  description: string
  can: string
  cannot: string
  compatibility: string
}

export function CatalogDetail(props: {
  tier: Tier
  kind: Kind
  author?: string
  copy: Copy
  close: () => void
  use: () => void
}) {
  const { t, ui } = usePlugin<typeof definition>()
  const [acknowledged, setAcknowledged] = createSignal(false)
  const mayUse = () => props.tier !== "community" || acknowledged()

  return (
    <ui.Dialog
      title={props.copy.title}
      description={props.copy.description}
      footer={
        <>
          <ui.Button onClick={props.close}>{t("catalog.close")}</ui.Button>
          <ui.Button variant="contrast" disabled={!mayUse()} onClick={() => mayUse() && props.use()}>
            {t(`catalog.use.${props.kind}`)}
          </ui.Button>
        </>
      }
    >
      <div class="flex flex-col gap-4 text-sm leading-5">
        <section>
          <h3 class="font-semibold">{t("catalog.how")}</h3>
          <p>{t(`catalog.explain.${props.kind}`)}</p>
        </section>
        <section>
          <h3 class="font-semibold">{t("catalog.who")}</h3>
          <p>{props.author ?? t(`catalog.tier.${props.tier}`)}</p>
          <p>{t(`catalog.trust.${props.tier}`)}</p>
        </section>
        <section>
          <h3 class="font-semibold">{t("catalog.permissions")}</h3>
          <dl class="grid gap-3 sm:grid-cols-2">
            <div>
              <dt class="font-medium">{t("catalog.can")}</dt>
              <dd>{props.copy.can}</dd>
            </div>
            <div>
              <dt class="font-medium">{t("catalog.cannot")}</dt>
              <dd>{props.copy.cannot}</dd>
            </div>
          </dl>
        </section>
        <section>
          <h3 class="font-semibold">{t("catalog.compatibility")}</h3>
          <p>{props.copy.compatibility}</p>
          <p class="text-v2-text-text-muted">{t("catalog.noEvidence")}</p>
        </section>
        <Show when={props.tier === "community"}>
          <Checkbox appearance="compact" checked={acknowledged()} onChange={setAcknowledged}>
            {t("catalog.acknowledge")}
          </Checkbox>
        </Show>
      </div>
    </ui.Dialog>
  )
}

export default function CatalogPage() {
  const ctx = usePlugin<typeof definition>()
  const { t, ui } = ctx
  const [tab, setTab] = createSignal<Tab>("catalog")
  const [tier, setTier] = createSignal<Tier>()
  const [kind, setKind] = createSignal<Kind>()
  const [query, setQuery] = createSignal("")

  const copy = (item: (typeof bundledItems)[number]) => ({
    title: t(`catalog.item.${item.id}.title`),
    description: t(`catalog.item.${item.id}.description`),
    can: t(`catalog.item.${item.id}.can`),
    cannot: t(`catalog.item.${item.id}.cannot`),
    compatibility: t(`catalog.item.${item.id}.compatibility`),
  })

  const source = createMemo(() =>
    tab() === "installed" ? bundledItems.filter((item) => item.installed) : bundledItems,
  )

  const items = createMemo(() => {
    const search = query().trim().toLocaleLowerCase()

    return source().filter((item) => {
      if (tier() && item.tier !== tier()) return false

      if (kind() && item.kind !== kind()) return false
      const text = copy(item)

      return [text.title, text.description, item.id].some((value) => value.toLocaleLowerCase().includes(search))
    })
  })

  const reset = () => {
    setTier(undefined)
    setKind(undefined)
    setQuery("")
  }

  const selectTab = (next: Tab) => {
    if (next === tab()) return
    setTab(next)
    reset()
  }

  const open = (item: (typeof bundledItems)[number]) => {
    ctx.dialogs.open((dialog) => (
      <CatalogDetail
        tier={item.tier}
        kind={item.kind}
        copy={copy(item)}
        close={dialog.close}
        use={() => {
          dialog.close()
          ctx.layout.draft({ prompt: t(`catalog.item.${item.id}.draft`) })
        }}
      />
    ))
  }

  return (
    <div class="min-h-0 flex-1 overflow-y-auto">
      <section class="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-8 sm:py-8">
        <header class="flex flex-wrap items-start justify-between gap-3">
          <div class="flex flex-col gap-2">
            <h1 class="text-20-medium flex items-center gap-2 text-v2-text-text-base">
              <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-v2-background-bg-layer-03">
                <Icon name="archive" />
              </span>
              {t("catalog.title")}
            </h1>
            <p class="text-sm text-v2-text-text-muted">{t("catalog.description")}</p>
          </div>
          <div>
            <ui.Button disabled icon="plus">
              {t("catalog.create")}
            </ui.Button>
            <p class="mt-1 text-xs text-v2-text-text-muted">{t("catalog.createUnavailable")}</p>
          </div>
        </header>

        <div
          role="group"
          aria-label={t("catalog.sections")}
          class="flex flex-wrap gap-2 border-b border-v2-border-border-muted pb-3"
        >
          <For each={tabs}>
            {(value) => (
              <button type="button" class={chip} aria-pressed={tab() === value} onClick={() => selectTab(value)}>
                {t(`catalog.tab.${value}`)}
              </button>
            )}
          </For>
        </div>

        <div class="flex flex-col gap-3">
          <input
            type="search"
            class="w-full rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-3 py-2 text-sm"
            aria-label={t("catalog.search")}
            placeholder={t("catalog.searchPlaceholder")}
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
          <div role="group" aria-label={t("catalog.who")} class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-semibold">{t("catalog.who")}</span>
            <button type="button" class={chip} aria-pressed={!tier()} onClick={() => setTier(undefined)}>
              {t("catalog.all")}
            </button>
            <For each={tiers}>
              {(value) => (
                <button type="button" class={chip} aria-pressed={tier() === value} onClick={() => setTier(value)}>
                  {t(`catalog.tier.${value}`)}
                </button>
              )}
            </For>
          </div>
          <div role="group" aria-label={t("catalog.type")} class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-semibold">{t("catalog.type")}</span>
            <button type="button" class={chip} aria-pressed={!kind()} onClick={() => setKind(undefined)}>
              {t("catalog.all")}
            </button>
            <For each={kinds}>
              {(value) => (
                <button type="button" class={chip} aria-pressed={kind() === value} onClick={() => setKind(value)}>
                  {t(`catalog.types.${value}`)}
                </button>
              )}
            </For>
          </div>
          <p class="text-xs leading-5 text-v2-text-text-muted">{t("catalog.legend")}</p>
          <Show when={kind()}>
            {(value) => <p class="text-sm text-v2-text-text-muted">{t(`catalog.explain.${value()}`)}</p>}
          </Show>
        </div>

        <Show
          when={items().length > 0}
          fallback={
            <div class="flex flex-col items-center gap-3 rounded-lg border border-v2-border-border-muted p-6 text-center">
              <p role="status">{t(source().length ? "catalog.noResults" : "catalog.empty")}</p>
              <Show when={source().length > 0}>
                <ui.Button onClick={reset}>{t("catalog.reset")}</ui.Button>
              </Show>
            </div>
          }
        >
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <For each={items()}>
              {(item) => (
                <article class="flex min-w-0 flex-col gap-3 rounded-lg border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-4">
                  <div class="flex items-center gap-2 text-xs text-v2-text-text-muted">
                    <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-v2-background-bg-layer-03">
                      <Icon name="file-document" />
                    </span>
                    {t(`catalog.kind.${item.kind}`)}
                  </div>
                  <h2 class="text-16-medium text-v2-text-text-base">{copy(item).title}</h2>
                  <p class="flex-1 text-sm leading-5 text-v2-text-text-muted">{copy(item).description}</p>
                  <p class="text-sm font-medium">{t(`catalog.tier.${item.tier}`)}</p>
                  <p class="text-xs leading-4 text-v2-text-text-muted">{t("catalog.noEvidence")}</p>
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <ui.Button onClick={() => open(item)}>{t(`catalog.use.${item.kind}`)}</ui.Button>
                    <span class="text-xs text-v2-text-text-muted">{t("catalog.included")}</span>
                  </div>
                </article>
              )}
            </For>
          </div>
        </Show>
      </section>
    </div>
  )
}
