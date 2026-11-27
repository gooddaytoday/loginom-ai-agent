import { isSessionNotFoundError } from "@opencode/client/promise"
import {
  PackageActionReply,
  PackageCloseRecord,
  PackageSnapshot,
  packageStateRpc,
} from "@loginom-ai-agent/loginom-agent/package-state-contract"
import type { Plugin } from "@opencode/plugin/gui"
import { BeforeSessionClose, BuiltinSlot, type SessionCloseTarget } from "@opencode/plugin/gui/builtin"
import { Button } from "@opencode/ui/button"
import { useDialogLayer } from "@opencode/ui/context/dialog"
import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { Option, Schema } from "effect"
import { createSignal, onCleanup, Show } from "solid-js"
import type definition from "./index"

type Context = Parameters<Plugin.Setup<typeof definition>>[0]

type Decision = "save" | "discard"

const readSnapshot = Schema.decodeUnknownPromise(PackageSnapshot)

const readReply = Schema.decodeUnknownPromise(PackageActionReply)

const isMissingRpc = Schema.is(Schema.Struct({ type: Schema.Literal("rpc.method_not_found") }))

const readRecord = Schema.decodeUnknownOption(Schema.Struct({ lastClose: PackageCloseRecord }))

const packageName = (path: string) => path.split(/[/\\]/).pop() ?? path

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const closing = new Set<string>()
  const { signal } = ctx

  const check = async (target: SessionCloseTarget) => {
    const server = ctx.servers.get(target.server)

    if (!server) return true

    const session = await (server.data.session.get(target.sessionID) ??
      server.client.session.get({ sessionID: target.sessionID }, { signal }))

    if (signal.aborted) return false
    const options = { location: session.location, signal }
    const input = { sessionID: target.sessionID }

    const state = await server.client
      .rpc(packageStateRpc)
      .snapshot(input, options)
      .then(readSnapshot)
      .catch((error) => {
        if (isMissingRpc(error)) return
        throw error
      })

    if (signal.aborted) return false

    if (!state || state.open === false) return true

    if (state.open !== true || state.modified === null) return failure(ctx, "close.stateFailed")

    const close = (decision: Decision | "clean") =>
      server.client
        .rpc(packageStateRpc)
        .close({ ...input, path: state.path, decision }, options)
        .then(readReply)

    if (!state.modified) {
      const result = await close("clean").catch(() => undefined)

      return !signal.aborted && (result?.status === "closed" || failure(ctx, "close.failed"))
    }

    return ask(ctx, {
      name: state.path === null ? ctx.t("close.untitledPackage") : packageName(state.path),
      title: session.title?.trim() || ctx.t("close.untitledConversation"),
      path: state.path,
      close,
    })
  }

  ctx.add(BeforeSessionClose, {
    async check(target) {
      const key = `${target.server}\n${target.sessionID}`

      if (closing.has(key)) return false
      closing.add(key)

      try {
        return await check(target)
      } catch (error) {
        if (signal.aborted) return false

        if (isSessionNotFoundError(error)) return true

        return failure(ctx, "close.stateFailed")
      } finally {
        closing.delete(key)
      }
    },
  })

  ctx.add(BuiltinSlot, {
    at: "session.timeline.end",
    render: (input) => {
      const record = () => {
        const current = input.session
        const loginom = current.server.data.session.get(current.id)?.metadata?.loginom

        return Option.getOrUndefined(readRecord(loginom))?.lastClose
      }

      return (
        <Show when={record()}>
          {(value) => {
            const label = () => {
              const decision = value()

              return decision.decision === "save"
                ? ctx.t("close.savedNote", { package: packageName(decision.path) })
                : ctx.t("close.discardedNote")
            }

            return <p class="mx-auto w-full max-w-session px-4 py-2 text-center text-text-weak">{label()}</p>
          }}
        </Show>
      )
    },
  })
}

function failure(ctx: Context, message: "close.stateFailed" | "close.failed") {
  ctx.toast.show({ variant: "error", title: ctx.t(message), description: ctx.t("close.keptOpen") })

  return false
}

function ask(
  ctx: Context,
  input: {
    name: string
    path: string | null
    title: string
    close: (decision: Decision) => Promise<typeof PackageActionReply.Type>
  },
) {
  const answer = Promise.withResolvers<boolean>()
  const cancel = () => answer.resolve(false)
  ctx.signal.addEventListener("abort", cancel, { once: true })

  ctx.dialogs.open((dialog) => {
    const layer = useDialogLayer()
    const [busy, setBusy] = createSignal(false)
    let dismissed = false
    onCleanup(() => {
      dismissed = true
      cancel()
    })

    const choose = async (decision: Decision) => {
      if (busy()) return
      setBusy(true)
      const reply = await input.close(decision).catch(() => undefined)

      if (dismissed || layer?.closing() || ctx.signal.aborted) return

      const savedPath = reply?.lastSave?.path
      const saved = savedPath && (input.path === null ? savedPath.endsWith(".lgp") : savedPath === input.path)

      if (reply?.status === "closed" && (decision === "discard" || saved)) {
        answer.resolve(true)
        dialog.close()

        return
      }

      void ctx.dialogs.alert({
        title: ctx.t(decision === "save" ? "close.saveFailed" : "close.failed"),
        description: ctx.t("close.keptOpen"),
      })
      cancel()
      dialog.close()
    }

    return (
      <Dialog fit preventBackdropDismiss={busy()} containerClass="!max-w-[calc(100vw-32px)]">
        <DialogHeader hideClose>
          <DialogTitleGroup
            title={ctx.t("close.title")}
            description={ctx.t("close.message", { package: input.name, conversation: input.title })}
          />
        </DialogHeader>
        <DialogBody>
          <div class="flex flex-wrap items-center gap-2 px-4 pb-4">
            <Button variant="contrast" disabled={busy()} onClick={() => choose("save")}>
              {ctx.t("close.save")}
            </Button>
            <Button variant="neutral" disabled={busy()} onClick={() => choose("discard")}>
              {ctx.t("close.discard")}
            </Button>
            <Button variant="ghost" autofocus disabled={busy()} onClick={() => dialog.close()}>
              {ctx.t("close.cancel")}
            </Button>
            <Show when={busy()}>
              <span class="w-full text-text-weak" role="status">
                {ctx.t("close.pending")}
              </span>
            </Show>
          </div>
        </DialogBody>
      </Dialog>
    )
  })

  return answer.promise.finally(() => ctx.signal.removeEventListener("abort", cancel))
}

export default setup
