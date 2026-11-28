import { usePlugin, type SessionRef } from "@opencode/plugin/gui"
import { Button } from "@opencode/ui/button"
import { Match, Show, Switch } from "solid-js"
import type definition from "./index"
import type { Request } from "./schema-machine"
import { initial, transition, type Action, type Outcome } from "./package-changes-machine"
import { packageChangesTool, type PackageChanges } from "./package-changes-data"
import {
  decodeEmpty,
  decodeReplaced,
  decodeRestored,
  decodeSaved,
  packageCopy,
  rpcFailure,
} from "./package-changes-rpc"

export function createPackageChangeActions(
  card: PackageChanges,
  target: Request,
  session: () => SessionRef | undefined,
) {
  const ctx = usePlugin<typeof definition>()

  const [memory, update] = ctx.storage.memory(
    `package-changes:${JSON.stringify([target.serverID, target.sessionID, target.directory, card.turnID])}`,
    { initial: { state: initial() } },
  )

  const state = () => memory.state

  const send = (event: Parameters<typeof transition>[1]) =>
    update((draft) => {
      draft.state = transition(draft.state, event)
    })

  const outcome = () => state().outcome

  const saved = () => {
    const value = outcome()

    if (value.kind === "saved") return value
  }

  const failure = () => {
    const value = state()

    if (value.kind === "ready") return value.failure
  }

  const available = () => !!session()

  const disabled = () =>
    !available() || state().kind === "working" || failure() === "stale" || failure() === "unconfirmed"

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
          description: ctx.t("changes.confirmDetail", { name: card.packageName }),
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

      if (session()?.server.client !== client || session()?.location?.directory !== target.directory) {
        send({ kind: "cancel" })

        return
      }

      if (
        last?.type !== "assistant" ||
        last.id !== card.turnID ||
        last.time.completed === undefined ||
        !last.content.some(
          (part) => part.type === "tool" && part.name === packageChangesTool && part.state.status === "completed",
        )
      ) {
        send({ kind: "failure", failure: "stale" })

        return
      }

      const rpc = client.rpc(packageCopy)
      const options = { location: { directory: target.directory } }

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
        return card.copyPath
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

    if (value.kind === "replaced" || value.kind === "restored") return { path: value.path, url: card.originalUrl }

    return { path: card.copyPath, url: card.copyUrl }
  }

  return { state, available, outcome, saved, failure, disabled, act, status, openPackage, viewedPackage }
}

export function PackageChangeActions(props: {
  actions: ReturnType<typeof createPackageChangeActions>
  schema?: { open: () => void; url?: never } | { open?: never; url?: string }
}) {
  const ctx = usePlugin<typeof definition>()

  return (
    <>
      <Show when={props.actions.failure()}>
        {(issue) => (
          <p role="alert" class="text-text-danger-base">
            {ctx.t(`changes.error.${issue()}`)}
          </p>
        )}
      </Show>
      <Show when={props.actions.outcome().kind !== "discarded"}>
        <div class="flex flex-wrap items-center gap-2">
          <Switch>
            <Match when={props.actions.outcome().kind === "draft"}>
              <Button
                size="small"
                variant="contrast"
                disabled={props.actions.disabled()}
                onClick={() => void props.actions.act("save")}
              >
                {ctx.t("changes.save")}
              </Button>
            </Match>
            <Match when={props.actions.outcome().kind === "saved"}>
              <Button
                size="small"
                disabled={!props.actions.available()}
                onClick={() => props.actions.openPackage(props.actions.viewedPackage().path)}
              >
                {ctx.t("changes.open")}
              </Button>
            </Match>
          </Switch>
          <Show when={props.schema?.open || webUrl(props.schema?.url)}>
            <Button
              size="small"
              onClick={() => {
                if (props.schema?.open) return props.schema.open()
                const url = webUrl(props.schema?.url)

                if (url) ctx.system.openExternal(url)
              }}
            >
              {ctx.t("changes.schema")}
            </Button>
          </Show>
          <Show when={webUrl(props.actions.viewedPackage().url) || webUrl(props.actions.viewedPackage().path)}>
            <Button
              size="small"
              onClick={() =>
                props.actions.openPackage(props.actions.viewedPackage().path, props.actions.viewedPackage().url)
              }
            >
              {ctx.t("changes.loginom")}
            </Button>
          </Show>
          <Show when={props.actions.outcome().kind === "draft" || props.actions.outcome().kind === "saved"}>
            <Button
              size="small"
              variant="ghost"
              disabled={props.actions.disabled()}
              onClick={() => void props.actions.act("replace")}
            >
              {ctx.t("changes.replace")}
            </Button>
          </Show>
          <Switch>
            <Match when={props.actions.outcome().kind === "draft"}>
              <Button
                size="small"
                variant="ghost"
                disabled={props.actions.disabled()}
                onClick={() => void props.actions.act("discard")}
              >
                {ctx.t("changes.discard")}
              </Button>
            </Match>
            <Match when={props.actions.outcome().kind === "saved"}>
              <Button
                size="small"
                variant="ghost"
                disabled={props.actions.disabled()}
                onClick={() => void props.actions.act("undo")}
              >
                {ctx.t("changes.undo")}
              </Button>
            </Match>
            <Match when={props.actions.outcome().kind === "replaced"}>
              <Button
                size="small"
                variant="ghost"
                disabled={props.actions.disabled()}
                onClick={() => void props.actions.act("restore")}
              >
                {ctx.t("changes.restore")}
              </Button>
            </Match>
          </Switch>
        </div>
      </Show>
    </>
  )
}

function webUrl(value: string | undefined) {
  if (!value) return
  const url = URL.parse(value)

  if (url && (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password) return url.href
}
