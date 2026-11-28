import { createKeyed, type Context } from "@opencode/plugin/gui"
import type { ToolRendererProps } from "@opencode/plugin/gui/builtin"
import { Option, Schema } from "effect"
import { createMemo, For, Show } from "solid-js"
import type { SchemaNavigation } from "./schema-view"

const noticeClass =
  "mb-1.5 min-w-0 rounded border-s-[3px] border-v2-state-border-info bg-v2-state-bg-info px-2.5 py-2 text-v2-text-text-base wrap-anywhere"

const Node = Schema.Struct({ guid: Schema.NonEmptyString, label: Schema.String })

const Position = Schema.Struct({ x: Schema.Finite, y: Schema.Finite })

const Edit = Schema.Union([
  Schema.Struct({ kind: Schema.Literals(["node_added", "node_removed"]), node: Node }),
  Schema.Struct({
    kind: Schema.Literal("node_renamed"),
    guid: Node.fields.guid,
    from: Schema.String,
    to: Schema.String,
  }),
  Schema.Struct({ kind: Schema.Literal("node_moved"), ...Node.fields, from: Position, to: Position }),
  Schema.Struct({
    kind: Schema.Literals(["link_added", "link_removed"]),
    link: Schema.Struct({
      source: Schema.NonEmptyString,
      output: Schema.NonEmptyString,
      target: Schema.NonEmptyString,
      input: Schema.NonEmptyString,
    }),
    sourceLabel: Schema.String,
    targetLabel: Schema.String,
  }),
])

const renameFields = {
  kind: Schema.Literal("node_renamed"),
  before: Schema.String,
  saved: Schema.String,
  repair: Schema.optional(Schema.Struct({ prompt: Schema.NonEmptyString })),
}

const decodeRename = Schema.decodeUnknownOption(
  Schema.Struct({ ...renameFields, nodeId: Schema.NonEmptyString, observedBeforeSave: Schema.String }),
)

const decodeLegacyRename = Schema.decodeUnknownOption(
  Schema.Struct({ ...renameFields, node_id: Schema.NonEmptyString, observed_before_save: Schema.String }),
)

const comparedGraph = {
  status: Schema.Literal("compared"),
  changes: Schema.Array(Schema.Unknown),
}

const attribution = Schema.Literals(["observed_during_save", "unconfirmed"])

const decodeSavedGraph = Schema.decodeUnknownOption(Schema.Struct({ ...comparedGraph, renameAttribution: attribution }))

const decodeLegacySavedGraph = Schema.decodeUnknownOption(
  Schema.Struct({ ...comparedGraph, rename_attribution: attribution }),
)

const decodeEdits = Schema.decodeUnknownOption(Schema.Array(Edit))

const readGraphFields = Schema.decodeUnknownOption(
  Schema.Struct({
    v: Schema.optional(Schema.Number),
    operationId: Schema.optional(Schema.NonEmptyString),
    manualEdits: Schema.optional(Schema.Unknown),
    savedPackageGraph: Schema.optional(Schema.Unknown),
    saved_package_graph: Schema.optional(Schema.Unknown),
  }),
)

export function GraphNotices(props: {
  ctx: Context
  metadata: ToolRendererProps["metadata"]
  detailed: boolean
  navigation: SchemaNavigation
}) {
  const t = props.ctx.t
  const fields = createMemo(() => Option.getOrUndefined(readGraphFields(props.metadata.loginom)))

  const edits = createMemo(() => Option.getOrElse(decodeEdits(fields()?.manualEdits), () => []))

  const renames = createMemo(() => {
    const facts = fields()
    const current = facts?.v === 1 ? Option.getOrUndefined(decodeSavedGraph(facts.savedPackageGraph)) : undefined

    // Older histories received the save report directly from the runtime.
    const legacy =
      facts?.savedPackageGraph === undefined
        ? Option.getOrUndefined(decodeLegacySavedGraph(facts?.saved_package_graph))
        : undefined

    const changes = current?.changes ?? legacy?.changes ?? []
    const duringSave = (current?.renameAttribution ?? legacy?.rename_attribution) === "observed_during_save"

    return changes.flatMap((change) => {
      const rename = current
        ? Option.getOrUndefined(decodeRename(change))
        : Option.getOrUndefined(decodeLegacyRename(change))

      if (!rename) return []

      const observed = "observedBeforeSave" in rename ? rename.observedBeforeSave : rename.observed_before_save

      return { ...rename, byLoginom: duringSave && rename.before === observed }
    })
  })

  createKeyed(
    () => {
      if (!props.detailed || !edits().length) return

      const session = props.ctx.sessions.current()
      const operationId = fields()?.operationId

      if (session && operationId) return { session, operationId }
    },
    ({ session, operationId }) => props.navigation.inspect(session, operationId),
    { equals: (a, b) => a.session === b.session && a.operationId === b.operationId },
  )

  const name = (label: string) => label.trim() || t("graph.node.unnamed")

  const summary = () => {
    const phrases = edits()
      .slice(0, 3)
      .map((edit) => editPhrase(t, edit))

    const remaining = edits().length - phrases.length

    if (remaining) phrases.push(props.ctx.plural("graph.edits.more", remaining))
    const list = new Intl.ListFormat(props.ctx.locale.locale()).format(phrases)

    return t("graph.edits.summary", { edits: list })
  }

  function NodeName(node: { guid: string; label: string }) {
    return (
      <Show when={props.navigation.nodeAction(node.guid)} fallback={name(node.label)}>
        {(action) => (
          <button
            type="button"
            class="cursor-pointer text-left text-v2-text-text-accent underline underline-offset-2"
            onClick={() => action()()}
          >
            {name(node.label)}
          </button>
        )}
      </Show>
    )
  }

  function EditSubject(props: { edit: typeof Edit.Type }) {
    const edit = props.edit

    switch (edit.kind) {
      case "node_added":
        return <NodeName guid={edit.node.guid} label={edit.node.label} />
      case "node_removed":
        return name(edit.node.label)
      case "node_moved":
        return <NodeName guid={edit.guid} label={edit.label} />
      case "node_renamed":
        return <NodeName guid={edit.guid} label={edit.to} />
      case "link_added":
      case "link_removed":
        return (
          <>
            <NodeName guid={edit.link.source} label={edit.sourceLabel} /> {t("graph.detail.endpoints")}{" "}
            <NodeName guid={edit.link.target} label={edit.targetLabel} />
          </>
        )
    }
  }

  return (
    <>
      <Show when={edits().length > 0}>
        <div class={noticeClass}>
          <Show when={props.detailed} fallback={<p>{summary()}</p>}>
            <p>{t("graph.edits")}</p>
            <ul class="my-1 list-disc space-y-1 ps-5">
              <For each={edits()}>
                {(edit) => (
                  <li>
                    <EditSubject edit={edit} />
                    <div>{editPhrase(t, edit, true)}</div>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
      </Show>
      <For each={renames()}>
        {(rename) => (
          <div class={noticeClass}>
            <p>
              {t(rename.byLoginom ? "graph.saved.renamed" : "graph.saved.different", {
                before: name(rename.before),
                after: name(rename.saved),
              })}
            </p>
            <Show when={props.ctx.screen.current() && rename.repair?.prompt}>
              {(prompt) => (
                <button
                  type="button"
                  class="mt-1 cursor-pointer text-v2-text-text-accent underline underline-offset-2"
                  onClick={() => {
                    const composer = props.ctx.screen.current()?.composer

                    if (!composer) return

                    composer.insert(composer.text() ? "\n\n" + prompt() + "\n\n" : prompt())
                    composer.focus()
                  }}
                >
                  {t("graph.saved.repair")}
                </button>
              )}
            </Show>
          </div>
        )}
      </For>
    </>
  )
}

function editPhrase(t: Context["t"], edit: typeof Edit.Type, detailed = false) {
  const key = detailed ? `graph.detail.${edit.kind}` : `graph.edit.${edit.kind}`
  const name = (label: string) => label.trim() || t("graph.node.unnamed")

  switch (edit.kind) {
    case "node_added":
    case "node_removed":
      return t(key, { node: name(edit.node.label) })
    case "node_renamed":
      return t(key, { before: name(edit.from), node: name(edit.to) })
    case "node_moved":
      return t(key, { node: name(edit.label), fromX: edit.from.x, fromY: edit.from.y, toX: edit.to.x, toY: edit.to.y })
    case "link_added":
    case "link_removed":
      return t(key, {
        source: name(edit.sourceLabel),
        target: name(edit.targetLabel),
        output: edit.link.output,
        input: edit.link.input,
      })
  }
}
