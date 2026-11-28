import { PermissionConversation } from "@loginom-ai-agent/loginom-host/permission-rpc"
import { usePlugin } from "@opencode/plugin/gui"
import type { PermissionDockInput } from "@opencode/plugin/gui/builtin"
import { Permission } from "@opencode/schema/permission"
import { Button } from "@opencode/ui/button"
import { DockPrompt } from "@opencode/session-ui/dock-prompt"
import { Option, Schema } from "effect"
import { createSignal, For, Show } from "solid-js"
import type definition from "./index"
import { initialPermission, permissionTransition } from "./machine"
import { conversationScope, packageLocation, permissionDescription } from "./permission-model"

const decodeDetails = Schema.decodeUnknownOption(
  Schema.Struct({ path: Schema.optional(Schema.String), operation: Schema.optional(Schema.String) }),
  { onExcessProperty: "ignore" },
)

const decodeInput = Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.Unknown))

const isString = Schema.is(Schema.String)

const isNotice = Schema.is(Schema.String.check(Schema.isMaxCodePoints(Permission.NoticeMaxLength)))

const traces = { once: "traceOnce", reject: "traceDeny", conversation: "traceConversation" } as const

export default function PermissionPrompt(props: PermissionDockInput) {
  const ctx = usePlugin<typeof definition>()
  const request = props.request
  const scope = conversationScope(request)
  const [feedback, setFeedback] = createSignal("")
  const [state, setState] = createSignal(initialPermission)
  const pending = () => state().type === "pending"
  const text = () => feedback().trim()
  const feedbackNotice = (message: string) => ctx.t("traceInstead", { message })
  const feedbackTooLong = () => !isNotice(feedbackNotice(text()))

  const details = Option.getOrUndefined(decodeDetails(request.metadata?.loginom))
  const path = details?.path
  const { name, folder } = packageLocation(path)
  const save = scope === "scopeSave" && request.action !== "dashboard_publish"
  const operation = props.description ?? ctx.t(permissionDescription(request) ?? "permissionAction")
  const description = name ? `${operation} «${name}»` : operation
  const input = Option.getOrElse(Option.map(decodeInput(request.metadata?.input), Object.entries), () => [])
  const resources = request.resources.filter((resource) => !save || resource !== "*")
  const decodeFailure = Schema.is(Schema.Struct({ type: Schema.Literal("not_grantable") }))

  async function answer(decision: "once" | "conversation" | "reject", message?: string) {
    const next = permissionTransition(state(), "submit")
    const notice = message ? feedbackNotice(message) : ctx.t(traces[decision], { action: description })

    if (next === state() || (message && !isNotice(notice))) return

    setState(next)

    const target = {
      sessionID: request.sessionID,
      requestID: request.id,
      notice: isNotice(notice) ? notice : ctx.t(traces[decision], { action: ctx.t("permissionAction") }),
    }

    const options = { signal: ctx.signal }

    try {
      if (decision === "conversation")
        await props.client
          .rpc(PermissionConversation)
          .conversation(target, { ...options, location: { directory: props.directory } })
      else await props.client.permission.reply({ ...target, decision, message }, options)
    } catch (error) {
      if (!ctx.signal.aborted)
        setState((current) => permissionTransition(current, decodeFailure(error) ? "not_grantable" : "failed"))

      return
    }

    if (ctx.signal.aborted) return

    props.confirm()
  }

  return (
    <DockPrompt
      kind="permission"
      header={<strong class="block px-3 py-2 text-sm">{ctx.t("permissionTitle", { action: description })}</strong>}
      footer={
        <div data-slot="permission-footer-actions" class="flex flex-wrap gap-2 px-3 py-2">
          <Button variant="submit" size="normal" disabled={pending()} onClick={() => void answer("once")}>
            {ctx.t("permissionOnce")}
          </Button>
          <Show when={!state().locked && scope}>
            {(key) => (
              <Button variant="neutral" size="normal" disabled={pending()} onClick={() => void answer("conversation")}>
                {ctx.t("permissionConversation")}
                <span class="sr-only"> · {ctx.t(key())}</span>
              </Button>
            )}
          </Show>
          <Button variant="ghost" size="normal" disabled={pending()} onClick={() => void answer("reject")}>
            {ctx.t("permissionDeny")}
          </Button>
        </div>
      }
    >
      <div class="max-h-[36vh] overflow-auto px-3 text-sm" data-scrollable>
        <Show when={save || path}>
          <table class="w-full table-fixed text-start break-words">
            <tbody>
              <tr>
                <th scope="row" class="w-1/3 text-start">
                  {ctx.t("permissionPackage")}
                </th>
                <td>{name ?? "—"}</td>
              </tr>
              <tr>
                <th scope="row" class="text-start">
                  {ctx.t("permissionFolder")}
                </th>
                <td>{folder ?? "—"}</td>
              </tr>
              <tr>
                <th scope="row" class="text-start">
                  {ctx.t("permissionChange")}
                </th>
                <td>{details?.operation === "package.save_as" ? ctx.t("permissionSaveAs") : operation}</td>
              </tr>
            </tbody>
          </table>
        </Show>
        <Show when={request.message}>
          <p>{request.message}</p>
        </Show>
        <Show when={resources.length}>
          <ul class="m-0 list-none p-0 break-all" data-slot="permission-patterns">
            <For each={resources}>
              {(value) => (
                <li>
                  <code>{value}</code>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <Show when={input.length}>
          <ul
            class="m-0 list-none p-0 max-h-[16vh] overflow-auto break-all"
            data-slot="permission-input"
            data-scrollable
          >
            <For each={input}>
              {([key, value]) => (
                <li>
                  <code>
                    {key}: {isString(value) ? value : JSON.stringify(value)}
                  </code>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <Show when={!state().locked && scope}>
          {(key) => <p class="m-0 py-2 text-text-weak">{ctx.t("permissionScope", { scope: ctx.t(key()) })}</p>}
        </Show>
        <form
          class="flex flex-wrap gap-2 py-2"
          onSubmit={(event) => {
            event.preventDefault()
            const message = text()

            if (message) void answer("reject", message)
          }}
        >
          <label class="flex min-w-0 flex-1 flex-col gap-1">
            <span>{ctx.t("permissionInstead")}</span>
            <input
              class="min-w-0 rounded-md border border-border-base bg-background-base px-2 py-1"
              value={feedback()}
              onInput={(event) => setFeedback(event.currentTarget.value)}
              disabled={pending()}
              aria-invalid={feedbackTooLong()}
              aria-describedby={feedbackTooLong() ? "permission-feedback-limit" : undefined}
            />
            <Show when={feedbackTooLong()}>
              <span id="permission-feedback-limit" role="alert">
                {ctx.t("permissionFeedbackTooLong", { max: Permission.NoticeMaxLength })}
              </span>
            </Show>
          </label>
          <Button
            class="self-end"
            type="submit"
            variant="neutral"
            size="normal"
            disabled={pending() || !text() || feedbackTooLong()}
          >
            {ctx.t("permissionSend")}
          </Button>
        </form>
        <Show when={state().locked}>
          <p role="alert">{ctx.t("permissionNotGrantable")}</p>
        </Show>
        <Show when={state().type === "failed"}>
          <p role="alert">{ctx.t("permissionFailed")}</p>
        </Show>
      </div>
    </DockPrompt>
  )
}
