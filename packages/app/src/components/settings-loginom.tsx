import "./settings-loginom.css"
import { Show, createSignal, onCleanup, onMount } from "solid-js"
import { Button } from "@loginom-ai-agent/ui/button"
import { TextField } from "@loginom-ai-agent/ui/text-field"
import type { Loginom } from "@loginom-ai-agent/schema/loginom"
import { usePlatform } from "@/context/platform"
import { useLanguage } from "@/context/language"

export function SettingsLoginom(props: { onSaved?: () => void; onLater?: () => void; wizard?: boolean }) {
  const platform = usePlatform()
  const language = useLanguage()
  const [view, setView] = createSignal<Loginom.View>()
  const [revision, setRevision] = createSignal(0)
  const [url, setUrl] = createSignal("http://logi-test-plan.bg.local/app/")
  const [username, setUsername] = createSignal("user")
  const [apiKey, setApiKey] = createSignal("")
  const [password, setPassword] = createSignal("")
  const [passwordMode, setPasswordMode] = createSignal<"preserve" | "replace" | "empty">("empty")
  const [editing, setEditing] = createSignal(false)
  const [busy, setBusy] = createSignal(false)
  const [message, setMessage] = createSignal("")
  const [failed, setFailed] = createSignal(false)
  const pending = () => view()?.state === "pending" || view()?.state === "starting"

  function clearSecrets() {
    setApiKey("")
    setPassword("")
  }
  function error(value: unknown) {
    setFailed(true)
    const code = value instanceof Error ? value.message.match(/LOGINOM_[A-Z_]+/)?.[0] : undefined
    setMessage(
      language.t(
        code === "LOGINOM_REVISION_CONFLICT"
          ? "loginom.conflict"
          : code === "LOGINOM_KNOWLEDGE_AUTH_FAILED"
            ? "loginom.invalidKey"
            : code === "LOGINOM_KNOWLEDGE_UNAVAILABLE"
              ? "loginom.serverUnavailable"
              : code === "LOGINOM_LOGIN_REJECTED"
                ? "loginom.invalidPassword"
                : code === "LOGINOM_ACCOUNT_MISMATCH"
                  ? "loginom.accountMismatch"
                  : code === "LOGINOM_LOGIN_UNAVAILABLE"
                    ? "loginom.webUnavailable"
                    : code === "LOGINOM_BROWSER_START_FAILED"
                      ? "loginom.browserFailed"
                      : "loginom.failed",
      ),
    )
  }
  async function load() {
    if (!platform.loginom) return
    const current = await platform.loginom.read()
    setView(current)
    setRevision(current.revision)
    setUrl(current.url)
    setUsername(current.username)
    setPasswordMode(current.hasPassword ? "preserve" : "empty")
    clearSecrets()
    setEditing(false)
  }
  onMount(() => {
    void load().catch(error)
    const timer = setInterval(() => {
      if (!platform.loginom || busy()) return
      void platform.loginom
        .status()
        .then(async (current) => {
          const previous = view()
          setView(current)
          if (current.failure) {
            await load()
            error(new Error(current.failure))
            return
          }
          if (
            current.state === "ready" &&
            !editing() &&
            (previous?.state !== "ready" || previous.revision !== current.revision)
          ) {
            await load()
            props.onSaved?.()
          }
        })
        .catch(error)
    }, 1000)
    onCleanup(() => clearInterval(timer))
  })
  onCleanup(clearSecrets)

  async function submit(save: boolean) {
    if (!platform.loginom || busy() || view()?.state === "starting") return
    setBusy(true)
    setFailed(false)
    setMessage("")
    try {
      const candidate: Loginom.Candidate = {
        revision: revision(),
        url: url(),
        username: username(),
        apiKey: apiKey() ? { operation: "replace", value: apiKey() } : { operation: "preserve" },
        password:
          passwordMode() === "replace"
            ? { operation: "replace", value: password() }
            : { operation: passwordMode() === "preserve" ? "preserve" : "empty" },
      }
      const validation = await platform.loginom.check(candidate)
      if (!save) {
        setMessage(language.t("loginom.checked"))
        return
      }
      setView(await platform.loginom.save({ validationId: validation.validationId, revision: revision() }))
      setRevision(view()!.revision)
      setEditing(false)
      clearSecrets()
      if (view()?.state === "ready" && !view()?.failure) {
        await load()
        props.onSaved?.()
      }
    } catch (value) {
      error(value)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section class="flex flex-col gap-5 p-6 max-w-2xl mx-auto w-full" data-component="settings-loginom">
      <h2 class="text-18-medium">{props.wizard ? language.t("loginom.welcome") : "Loginom"}</h2>
      <p class="text-14-regular text-text-weak">{language.t("loginom.description")}</p>
      <Show when={platform.loginom} fallback={<p role="status">{language.t("loginom.desktopOnly")}</p>}>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit(true)
          }}
          class="flex flex-col gap-4"
        >
          <fieldset disabled={busy() || view()?.state === "starting"} class="flex flex-col gap-4">
            <TextField
              label={language.t("loginom.apiKey")}
              type="password"
              required={!view()?.hasApiKey}
              value={apiKey()}
              onChange={(value) => {
                setApiKey(value)
                setEditing(true)
              }}
              autocomplete="off"
            />
            <Show when={view()?.hasApiKey}>
              <p class="text-12-regular text-text-weak">{language.t("loginom.keySaved")}</p>
            </Show>
            <TextField
              label={language.t("loginom.url")}
              type="url"
              value={url()}
              onChange={(value) => {
                setUrl(value)
                setEditing(true)
              }}
              required
            />
            <TextField
              label={language.t("loginom.username")}
              value={username()}
              onChange={(value) => {
                setUsername(value)
                setEditing(true)
              }}
              required
              autocomplete="username"
            />
            <TextField
              label={language.t("loginom.password")}
              type="password"
              value={password()}
              autocomplete="new-password"
              onChange={(value) => {
                setEditing(true)
                setPassword(value)
                setPasswordMode(value ? "replace" : view()?.hasPassword ? "preserve" : "empty")
              }}
            />
            <Show when={view()?.hasPassword}>
              <p class="text-12-regular text-text-weak">{language.t("loginom.passwordSaved")}</p>
            </Show>
            <label class="text-12-regular flex gap-2 items-center">
              <input
                type="checkbox"
                checked={passwordMode() === "empty"}
                onChange={(event) => {
                  setEditing(true)
                  setPassword("")
                  setPasswordMode(event.currentTarget.checked ? "empty" : "preserve")
                }}
              />
              {language.t("loginom.emptyPassword")}
            </label>
            <p class="text-12-regular text-text-weak">
              {language.t("loginom.folder")}: <code>{`/${username()}`}</code>
            </p>
          </fieldset>
          <Show when={pending()}>
            <p role="status">{language.t("loginom.pending")}</p>
          </Show>
          <Show when={view()?.state === "recoverable-error" && !view()?.recoveries?.length}>
            <p role="alert">{language.t("loginom.runtimeFailed")}</p>
          </Show>
          <Show when={view()?.recoveries?.length}>
            <p role="alert">{language.t("loginom.recoveryRequired")}</p>
            <Button
              type="button"
              variant="secondary"
              disabled={busy()}
              onClick={async () => {
                if (!platform.loginom || busy()) return
                setBusy(true)
                try {
                  await platform.loginom.acknowledgeRecovery({ revision: view()!.revision, ids: view()!.recoveries! })
                  await load()
                } catch (value) {
                  error(value)
                } finally {
                  setBusy(false)
                }
              }}
            >
              {language.t("loginom.acknowledgeRecovery")}
            </Button>
          </Show>
          <Show when={message()}>
            <p role={failed() ? "alert" : "status"}>{message()}</p>
          </Show>
          <div class="loginom-actions flex flex-wrap gap-3">
            <Button type="submit" variant="primary" disabled={busy() || view()?.state === "starting"}>
              {busy() ? language.t("loginom.checking") : language.t(props.wizard ? "loginom.continue" : "loginom.save")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy() || view()?.state === "starting"}
              onClick={() => void submit(false)}
            >
              {language.t("loginom.check")}
            </Button>
            <Show when={view()?.state === "pending"}>
              <Button
                type="button"
                onClick={() =>
                  void platform.loginom!.cancelPending({ revision: view()!.revision }).then(load).catch(error)
                }
              >
                {language.t("loginom.cancel")}
              </Button>
            </Show>
            <Button
              type="button"
              variant="ghost"
              disabled={busy() || view()?.state === "starting"}
              onClick={() => void load().catch(error)}
            >
              {language.t("loginom.reload")}
            </Button>
            <Show when={props.onLater}>
              <Button type="button" variant="ghost" disabled={busy()} onClick={props.onLater}>
                {language.t("loginom.later")}
              </Button>
            </Show>
          </div>
        </form>
      </Show>
    </section>
  )
}
