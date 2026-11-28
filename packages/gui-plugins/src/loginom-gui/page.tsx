import type { Issue } from "@loginom-ai-agent/loginom-host/settings-rpc"
import { usePlugin } from "@opencode/plugin/gui"
import { Checkbox } from "@opencode/ui/checkbox"
import { TextField } from "@opencode/ui/text-field"
import { onCleanup, onMount, Show } from "solid-js"
import type definition from "./index"
import type { profileService } from "./target"

export default function Page(props: { service: ReturnType<typeof profileService>; onOpen(): void; onClose(): void }) {
  const ctx = usePlugin<typeof definition>()
  const ui = ctx.ui
  const { page, dispatch } = props.service
  const errorText = (issue: Issue | undefined) => (issue ? ctx.t(issue) : undefined)

  onMount(() => props.onOpen())
  onCleanup(() => props.onClose())

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
                    placeholder="https://loginom.example.org"
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
                  disabled={page().busy || page().status?.recoveryPending}
                  onClick={() => dispatch({ type: "submit", submit: "check", now: Date.now() })}
                >
                  {ctx.t(page().checking ? "checking" : "check")}
                </ui.Button>
                <ui.Button type="submit" variant="contrast" disabled={page().busy || page().status?.recoveryPending}>
                  {ctx.t(page().saving ? "saving" : "save")}
                </ui.Button>
              </Show>
              <Show when={page().retry}>
                <ui.Button onClick={() => dispatch({ type: "refresh" })}>{ctx.t("retry")}</ui.Button>
              </Show>
            </div>
          </Show>
        </form>
      </ui.SettingsSection>
    </ui.SettingsLayout>
  )
}
