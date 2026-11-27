import { usePlugin, type MountedSession } from "@opencode/plugin/gui"
import { createMemo, For, Show } from "solid-js"
import { FactsTable } from "./facts-table"
import type definition from "./index"
import type { Request } from "./machine"
import { createPackageChangeActions, PackageChangeActions } from "./package-change-actions"
import { comparisonRows, nodeRows, type ChangesWithSchema, type PackageChanges } from "./package-changes-data"
import { diagramSchemas } from "./package-changes-facts"

export function PackageChangesCard(props: {
  changes: PackageChanges
  target: Request
  openSchema: (session: MountedSession, changes: ChangesWithSchema) => void
}) {
  const ctx = usePlugin<typeof definition>()
  const card = () => props.changes

  const session = () => {
    const current = ctx.sessions.current()

    if (
      current?.id === props.target.sessionID &&
      current.server.id === props.target.serverID &&
      current.directory === props.target.directory &&
      !current.pending
    )
      return current
  }

  const actions = createPackageChangeActions(props.changes, props.target, session)
  const rows = createMemo(() => nodeRows(card(), ctx.t))

  if (!rows().length) return null

  const comparison = createMemo(() => comparisonRows(card().comparison))

  const schema = () => {
    if (!diagramSchemas(card().schemas)) return { url: card().schemaUrl }

    return {
      open: () => {
        const current = session()
        const schemaDiff = diagramSchemas(card().schemas)

        if (current && schemaDiff) props.openSchema(current, { ...card(), schemaDiff })
      },
    }
  }

  return (
    <section
      aria-label={ctx.t("changes.title")}
      aria-busy={actions.state().kind === "working"}
      class="grid min-w-0 gap-3 rounded-lg border border-border-weak-base bg-surface-base p-4 text-13-regular"
    >
      <header class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <strong class="min-w-0 break-all text-text-strong">{actions.saved()?.name ?? card().packageName}</strong>
        <Show when={actions.outcome().kind === "draft"}>
          <span class="rounded-md bg-surface-raised-base px-2 py-0.5 text-12-regular text-text-weak">
            {ctx.t("changes.copy")}
          </span>
        </Show>
        <Show when={actions.outcome().kind !== "discarded"}>
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
        {actions.status()}
      </p>
      <Show when={actions.outcome().kind !== "discarded"}>
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
      <PackageChangeActions actions={actions} schema={schema()} />
      <Show when={actions.outcome().kind !== "discarded"}>
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
