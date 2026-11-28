import { Definition, type Issue } from "@loginom-ai-agent/loginom-host/settings-rpc"
import { createKeyed, usePlugin } from "@opencode/plugin/gui"
import { Checkbox } from "@opencode/ui/checkbox"
import { TextField } from "@opencode/ui/text-field"
import { createMemo, createSignal, onCleanup, Show, untrack } from "solid-js"
import type definition from "./index"
import { initial, transition, view } from "./machine"
import { loginomServer } from "./package-rpc"

export default function Page() {
  const ctx = usePlugin<typeof definition>()
  const ui = ctx.ui
  const [state, setState] = createSignal(initial)
  const page = createMemo(() => view(state()))

  const errorText = (issue: Issue | undefined) => (issue ? ctx.t(issue) : undefined)

  const client = createMemo(() => loginomServer(ctx)?.client)

  let controller: AbortController | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  const dispatch = (event: Parameters<typeof transition>[1]) => {
    const next = transition(untrack(state), event)
    setState(next.state)
    next.effects.forEach(run)
  }

  function run(effect: ReturnType<typeof transition>["effects"][number]) {
    if (effect.type === "cancel") {
      clearTimeout(timer)
      controller?.abort()

      return
    }

    const request = async () => {
      controller = new AbortController()

      const signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(effect.type === "check" ? 245_000 : 12_000),
      ])

      const rpc = untrack(client)?.rpc(Definition)

      switch (effect.type) {
        case "status": {
          const result = await rpc?.status({}, { signal }).catch(() => undefined)
          dispatch({ type: "status", attempt: effect.attempt, result: result ?? { ok: false, issue: "unavailable" } })
          break
        }

        case "check": {
          const result = await rpc?.check(effect.input, { signal }).catch(() => undefined)
          dispatch({ type: "checked", attempt: effect.attempt, result: result ?? { ok: false, issue: "unavailable" } })
          break
        }

        case "save": {
          const result = await rpc?.save(effect.input, { signal }).catch(() => undefined)
          dispatch({ type: "saved", attempt: effect.attempt, result: result ?? { ok: false, issue: "saveFailed" } })
          break
        }
      }
    }

    if (effect.type === "status" && effect.delay) {
      timer = setTimeout(() => void request(), effect.delay)

      return
    }

    void request()
  }

  const reload = () => dispatch({ type: "target", available: !!client() })
  createKeyed(client, reload, { otherwise: reload })
  onCleanup(() => dispatch({ type: "disposed" }))

  return (
    <ui.SettingsLayout title={ctx.t("title")} description={ctx.t("description")}>
      <ui.SettingsSection>
        <form
          class="flex flex-col gap-4 p-4"
          onSubmit={(event) => {
            event.preventDefault()
            dispatch({ type: "submit", submit: "save", now: Date.now() })
          }}
        >
          <Show when={page().draft}>
            {(draft) => (
              <>
                <div class="grid min-w-0 gap-4 sm:grid-cols-2">
                  <TextField
                    class="min-w-0"
                    label={ctx.t("url")}
                    value={draft().url}
                    inputMode="url"
                    placeholder={page().deviceOnly ? "http://127.0.0.1:8080" : "https://loginom.example.org"}
                    description={page().deviceOnly && !page().fieldErrors.url ? ctx.t("deviceAddress") : undefined}
                    disabled={page().readOnly}
                    validationState={page().fieldErrors.url ? "invalid" : "valid"}
                    error={errorText(page().fieldErrors.url)}
                    onChange={(url) => dispatch({ type: "edit", patch: { url } })}
                  />
                  <TextField
                    class="min-w-0"
                    label={ctx.t("username")}
                    autocomplete="username"
                    value={draft().username}
                    disabled={page().readOnly}
                    validationState={page().fieldErrors.username ? "invalid" : "valid"}
                    error={errorText(page().fieldErrors.username)}
                    onChange={(username) => dispatch({ type: "edit", patch: { username } })}
                  />
                  <TextField
                    class="min-w-0"
                    label={ctx.t("password")}
                    type="password"
                    autocomplete="current-password"
                    value={draft().password}
                    placeholder={!draft().noPassword && page().passwordSaved ? ctx.t("passwordStored") : undefined}
                    disabled={page().readOnly || draft().noPassword}
                    validationState={page().fieldErrors.password ? "invalid" : "valid"}
                    error={errorText(page().fieldErrors.password)}
                    onChange={(password) => dispatch({ type: "edit", patch: { password } })}
                  />
                </div>
                <Checkbox
                  appearance="compact"
                  disabled={page().readOnly}
                  checked={draft().noPassword}
                  onChange={(noPassword) => dispatch({ type: "edit", patch: { noPassword } })}
                >
                  {ctx.t("noPassword")}
                </Checkbox>
              </>
            )}
          </Show>
          <div role="status" class="flex flex-col gap-1 text-12-regular text-text-base">
            <Show when={page().connected}>
              {(connection) => (
                <span>{ctx.t("connected", { username: connection().username, folder: connection().folder })}</span>
              )}
            </Show>
            <Show when={page().message}>{(message) => <span>{ctx.t(message())}</span>}</Show>
          </div>
          <Show when={page().issue}>
            {(issue) => (
              <p role="alert" class="text-12-regular text-text-danger-base">
                {ctx.t(issue())}
              </p>
            )}
          </Show>
          <Show when={page().draft || page().retry}>
            <div class="flex flex-wrap gap-2">
              <Show when={page().draft}>
                <ui.Button
                  disabled={page().busy}
                  onClick={() => dispatch({ type: "submit", submit: "check", now: Date.now() })}
                >
                  {ctx.t(page().checking ? "checking" : "check")}
                </ui.Button>
                <ui.Button type="submit" variant="contrast" disabled={page().busy}>
                  {ctx.t(page().saving ? "saving" : "save")}
                </ui.Button>
              </Show>
              <Show when={page().retry}>
                <ui.Button onClick={reload}>{ctx.t("retry")}</ui.Button>
              </Show>
            </div>
          </Show>
        </form>
      </ui.SettingsSection>
    </ui.SettingsLayout>
  )
}
