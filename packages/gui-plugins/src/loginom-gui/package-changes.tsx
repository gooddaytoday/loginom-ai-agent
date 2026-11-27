import { usePlugin } from "@opencode/plugin/gui"
import { Button } from "@opencode/ui/button"
import { For, Match, Show, Switch, createMemo } from "solid-js"
import type definition from "./index"
import { initial, transition, type Action, type Outcome } from "./package-changes-machine"
import { comparisonRows, nodeRows, packageChangesTool, type PackageChanges } from "./package-changes-data"
import type { FactRow } from "./package-changes-facts"
import {
  decodeEmpty,
  decodeReplaced,
  decodeRestored,
  decodeSaved,
  packageCopy,
  rpcFailure,
} from "./package-changes-rpc"

export function PackageChangesCard(props: { changes: PackageChanges }) {
  const ctx = usePlugin<typeof definition>()
  const card = () => props.changes
  const rows = createMemo(() => nodeRows(card(), ctx.t))

  if (!rows().length) return null

  const [memory, update] = ctx.storage.memory(`package-changes:${card().sessionID}:${card().turnID}`, {
    initial: { state: initial },
  })

  const state = () => memory.state

  const send = (event: Parameters<typeof transition>[1]) =>
    update((draft) => {
      draft.state = transition(draft.state, event)
    })

  const session = () => {
    const current = ctx.sessions.current()

    if (current?.id === card().sessionID && !current.pending) return current
  }

  const comparison = createMemo(() => comparisonRows(card().comparison))
  const outcome = () => state().outcome

  const saved = () => {
    const value = outcome()

    if (value.kind === "saved") return value
  }

  const failure = () => {
    const value = state()

    if (value.kind === "ready") return value.failure
  }

  const disabled = () =>
    !session() || state().kind === "working" || failure() === "stale" || failure() === "unconfirmed"

  function openPackage(path: string, url?: string) {
    const address = webUrl(url) ?? webUrl(path)

    if (address) return ctx.system.openExternal(address)
    const href = `loginom-package:${encodeURIComponent(path)}`

    if (ctx.links.open({ href, session: session() })) return
    void ctx.dialogs.alert({ title: ctx.t("changes.location"), description: path })
  }

  async function act(action: Action) {
    const current = session()

    if (!current || disabled()) return
    const before = state()
    const working = transition(before, { kind: "start", action })

    if (working.kind !== "working" || working === before) return
    send({ kind: "start", action })

    try {
      if (
        action === "replace" &&
        !(await ctx.dialogs.confirm({
          title: ctx.t("changes.confirmTitle"),
          description: ctx.t("changes.confirmDetail", { name: card().packageName }),
          confirm: ctx.t("changes.confirmReplace"),
          danger: true,
        }))
      ) {
        send({ kind: "cancel" })

        return
      }

      const client = current.server.client
      const sessionID = current.id
      const latest = await client.message.list({ sessionID, limit: 20, order: "desc" })
      const last = latest.data.find((message) => message.type === "user" || message.type === "assistant")

      if (
        session()?.visit !== current.visit ||
        current.server.client !== client ||
        last?.type !== "assistant" ||
        last.id !== card().turnID ||
        last.time.completed === undefined ||
        !last.content.some(
          (part) => part.type === "tool" && part.name === packageChangesTool && part.state.status === "completed",
        )
      ) {
        send({ kind: "failure", failure: "stale" })

        return
      }

      const rpc = client.rpc(packageCopy)
      const options = { location: { directory: current.directory } }

      const result = await (async (): Promise<Outcome> => {
        switch (action) {
          case "save":
            return { kind: "saved", ...decodeSaved(await rpc["save-version"]({ sessionID }, options)) }
          case "undo":
            if (working.outcome.kind !== "saved") return working.outcome
            decodeEmpty(await rpc["undo-save"]({ sessionID, path: working.outcome.path }, options))

            return { kind: "draft" }
          case "replace":
            return {
              kind: "replaced",
              ...decodeReplaced(await rpc["replace-original"]({ sessionID, confirmed: true }, options)),
            }
          case "restore":
            if (working.outcome.kind !== "replaced") return working.outcome

            return {
              kind: "restored",
              ...decodeRestored(
                await rpc["restore-previous"]({ sessionID, backupPath: working.outcome.backupPath }, options),
              ),
            }
          case "discard":
            decodeEmpty(await rpc.discard({ sessionID }, options))

            return { kind: "discarded" }
        }
      })()

      send({ kind: "success", outcome: result })
    } catch (error) {
      send({ kind: "failure", failure: rpcFailure(error) })
    }
  }

  const status = () => {
    const value = outcome()

    switch (value.kind) {
      case "draft":
        return card().copyPath
      case "saved":
        return ctx.t("changes.saved", { name: value.name })
      case "replaced":
        return ctx.t("changes.replaced", { path: value.backupPath })
      case "restored":
        return ctx.t("changes.restored")
      case "discarded":
        return ctx.t("changes.discarded")
    }
  }

  const viewedPackage = () => {
    const value = outcome()

    if (value.kind === "saved") return { path: value.path }

    if (value.kind === "replaced" || value.kind === "restored") return { path: value.path, url: card().originalUrl }

    return { path: card().copyPath, url: card().copyUrl }
  }

  return (
    <section
      aria-label={ctx.t("changes.title")}
      aria-busy={state().kind === "working"}
      class="grid min-w-0 gap-3 rounded-lg border border-border-weak-base bg-surface-base p-4 text-13-regular"
    >
      <header class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <strong class="min-w-0 break-all text-text-strong">{saved()?.name ?? card().packageName}</strong>
        <Show when={outcome().kind === "draft"}>
          <span class="rounded-md bg-surface-raised-base px-2 py-0.5 text-12-regular text-text-weak">
            {ctx.t("changes.copy")}
          </span>
        </Show>
        <Show when={outcome().kind !== "discarded"}>
          <ul aria-label={ctx.t("changes.counts")} class="flex flex-wrap gap-x-2 sm:ms-auto">
            <For
              each={[
                { kind: "added", sign: "+", color: "text-text-diff-add-base" },
                { kind: "changed", sign: "~", color: "text-text-strong" },
                { kind: "removed", sign: "−", color: "text-text-diff-delete-base" },
              ]}
            >
              {(counter) => (
                <li class={counter.color}>
                  {counter.sign}
                  {rows().filter((row) => row.kind === counter.kind).length} {ctx.t(`changes.${counter.kind}`)}
                </li>
              )}
            </For>
          </ul>
        </Show>
      </header>
      <p role="status" class="break-words text-text-weak">
        {status()}
      </p>
      <Show when={outcome().kind !== "discarded"}>
        <Show when={comparison()}>
          {(values) => (
            <p class="text-text-weak">
              {values().original === values().copy
                ? ctx.t("changes.sameRows", { rows: String(values().copy) })
                : ctx.t("changes.differentRows", { before: String(values().original), after: String(values().copy) })}
            </p>
          )}
        </Show>
      </Show>
      <Show when={failure()}>
        {(issue) => (
          <p role="alert" class="text-text-danger-base">
            {ctx.t(`changes.error.${issue()}`)}
          </p>
        )}
      </Show>
      <Show when={outcome().kind !== "discarded"}>
        <div class="flex flex-wrap items-center gap-2">
          <Switch>
            <Match when={outcome().kind === "draft"}>
              <Button size="small" variant="contrast" disabled={disabled()} onClick={() => void act("save")}>
                {ctx.t("changes.save")}
              </Button>
            </Match>
            <Match when={outcome().kind === "saved"}>
              <Button size="small" disabled={!session()} onClick={() => openPackage(viewedPackage().path)}>
                {ctx.t("changes.open")}
              </Button>
            </Match>
          </Switch>
          <Show when={webUrl(card().schemaUrl)}>
            {(url) => (
              <Button size="small" onClick={() => ctx.system.openExternal(url())}>
                {ctx.t("changes.schema")}
              </Button>
            )}
          </Show>
          <Show when={webUrl(viewedPackage().url) || webUrl(viewedPackage().path)}>
            <Button size="small" onClick={() => openPackage(viewedPackage().path, viewedPackage().url)}>
              {ctx.t("changes.loginom")}
            </Button>
          </Show>
          <Show when={outcome().kind === "draft" || outcome().kind === "saved"}>
            <Button size="small" variant="ghost" disabled={disabled()} onClick={() => void act("replace")}>
              {ctx.t("changes.replace")}
            </Button>
          </Show>
          <Switch>
            <Match when={outcome().kind === "draft"}>
              <Button size="small" variant="ghost" disabled={disabled()} onClick={() => void act("discard")}>
                {ctx.t("changes.discard")}
              </Button>
            </Match>
            <Match when={outcome().kind === "saved"}>
              <Button size="small" variant="ghost" disabled={disabled()} onClick={() => void act("undo")}>
                {ctx.t("changes.undo")}
              </Button>
            </Match>
            <Match when={outcome().kind === "replaced"}>
              <Button size="small" variant="ghost" disabled={disabled()} onClick={() => void act("restore")}>
                {ctx.t("changes.restore")}
              </Button>
            </Match>
          </Switch>
        </div>
      </Show>
      <Show when={outcome().kind !== "discarded"}>
        <details class="min-w-0 border-t border-border-weak-base pt-3">
          <summary class="w-fit cursor-pointer font-medium text-text-strong">{ctx.t("changes.nodes")}</summary>
          <ul aria-label={ctx.t("changes.nodes")} class="mt-2 grid gap-2">
            <For each={rows()}>
              {(row) => (
                <li class="flex min-w-0 gap-2 break-words">
                  <span class="w-3 shrink-0">
                    <span aria-hidden="true">{{ added: "+", changed: "~", removed: "−" }[row.kind]}</span>
                    <span class="sr-only">{ctx.t(`facts.status.${row.kind}`)}</span>
                  </span>
                  <div class="min-w-0 flex-1">
                    <span>
                      <strong class="font-medium">
                        <Show when={row.kind === "removed"} fallback={row.label}>
                          <del>{row.label}</del>
                        </Show>
                      </strong>
                      <Show when={row.reasons.length > 0}>
                        <span class="text-text-weak">
                          {" — "}
                          {row.reasons
                            .map((reason) =>
                              reason.kind === "renamed"
                                ? ctx.t("changes.renamed", { name: reason.from })
                                : ctx.t(`changes.${reason.kind}`),
                            )
                            .join("; ")}
                        </span>
                      </Show>
                    </span>
                    <details class="mt-1">
                      <summary class="w-fit cursor-pointer text-text-interactive-base">{ctx.t("facts.title")}</summary>
                      <FactsTable facts={row.facts} />
                    </details>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </details>
      </Show>
    </section>
  )
}

function FactsTable(props: { facts: FactRow[] }) {
  const { t } = usePlugin<typeof definition>()

  return (
    <table
      role="table"
      aria-label={t("facts.title")}
      class="mt-1 w-full table-fixed border-collapse text-left max-[560px]:block"
    >
      <thead class="max-[560px]:sr-only">
        <tr>
          <th scope="col" class="w-1/3 px-2 py-1 font-medium text-text-weak">
            {t("facts.settingOrPort")}
          </th>
          <th scope="col" class="px-2 py-1 font-medium text-text-weak">
            {t("facts.before")}
          </th>
          <th scope="col" class="px-2 py-1 font-medium text-text-weak">
            {t("facts.after")}
          </th>
        </tr>
      </thead>
      <tbody role="rowgroup" class="max-[560px]:block">
        <For each={props.facts}>
          {(fact) => (
            <tr
              role="row"
              class="border-t border-border-weak-base align-top [overflow-wrap:anywhere] max-[560px]:grid max-[560px]:grid-cols-2"
            >
              <th role="rowheader" scope="row" class="px-2 py-1 font-medium text-text-weak max-[560px]:col-span-2">
                {fact.label}
              </th>
              <Show
                when={fact.same}
                fallback={
                  <>
                    <td role="cell" class="px-2 py-1 text-text-diff-delete-base">
                      <span aria-hidden="true" class="hidden text-text-weak max-[560px]:inline">
                        {t("facts.beforeLabel")}{" "}
                      </span>
                      {fact.before ?? "—"}
                    </td>
                    <td role="cell" class="px-2 py-1 text-text-diff-add-base">
                      <span aria-hidden="true" class="hidden text-text-weak max-[560px]:inline">
                        {t("facts.afterLabel")}{" "}
                      </span>
                      {fact.after ?? "—"}
                    </td>
                  </>
                }
              >
                <td role="cell" colspan={2} class="px-2 py-1 max-[560px]:col-span-2">
                  {fact.before} <span class="text-text-weak">{t("facts.same")}</span>
                </td>
              </Show>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  )
}

function webUrl(value: string | undefined) {
  if (!value) return
  const url = URL.parse(value)

  if (url && (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password) return url.href
}
