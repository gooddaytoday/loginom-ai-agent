import "./settings-loginom.css"
import { Show, onCleanup, onMount } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { TextField } from "@opencode-ai/ui/text-field"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import type { Loginom } from "@opencode-ai/schema/loginom"
import { usePlatform } from "@/context/platform"
import { useLanguage } from "@/context/language"
import { dismissToast, showToast } from "@/utils/toast"
import { createLoginomSettings, loginomBrowserMessage, watchLoginomApplication } from "./settings-loginom-state"

export function SettingsLoginom(
  props: { wizard: true; onSaved: (view: Loginom.View, notify?: () => void) => void } | { wizard?: false },
) {
  const platform = usePlatform()
  const language = useLanguage()
  const dialog = useDialog()
  let wizardFinished = false
  const form = createLoginomSettings(platform.loginom, (view) => {
    if (props.wizard) {
      finishWizard(view, () => notifySaved(view))
      return
    }
    notifySaved(view)
    dialog.close()
  })

  function finishWizard(view = form.state.view, notify?: () => void) {
    if (!props.wizard || wizardFinished || form.busy() || !view?.generation || view.setupRequired) return
    wizardFinished = true
    props.onSaved(view, notify)
  }

  function notifySaved(view: Loginom.View) {
    const pending = view.state === "pending"
    const warning = view.browser?.state === "failed"
    const toast = showToast({
      title: language.t("loginom.saved"),
      description: language.t(
        pending ? "loginom.savedPending" : warning ? "loginom.savedBrowserWarning" : "loginom.helpReady",
      ),
      variant: pending || warning ? "default" : "success",
      persistent: pending || warning,
    })
    if (pending && platform.loginom) {
      const messages = {
        ready: language.t("loginom.helpReady"),
        failed: language.t("loginom.applyFailed"),
        unknown: language.t("loginom.statusUnavailable"),
      }
      void watchLoginomApplication(platform.loginom, view, (result, current) => {
        dismissToast(toast)
        if (result === "superseded") return
        showToast({
          description:
            result === "ready" && current?.browser?.state === "failed"
              ? language.t("loginom.savedBrowserWarning")
              : messages[result],
          variant: result === "ready" ? (current?.browser?.state === "failed" ? "default" : "success") : "error",
          persistent: result !== "ready" || current?.browser?.state === "failed",
        })
      })
    }
  }

  async function load() {
    await form.load()
    finishWizard()
  }

  onMount(() => {
    void load()
    const unguard = props.wizard ? undefined : dialog.guardClose(form.requestClose)
    const timer = setInterval(() => void form.refresh().then(() => finishWizard()), 1000)
    onCleanup(() => {
      wizardFinished = true
      unguard?.()
      clearInterval(timer)
    })
  })
  let element: HTMLFormElement | undefined
  return (
    <section class="flex flex-col gap-5 p-6 max-w-2xl mx-auto w-full" data-component="settings-loginom">
      <div class="loginom-heading">
        <h2 class="text-18-medium">{props.wizard ? language.t("loginom.welcome") : "Loginom"}</h2>
        <Show when={!props.wizard}>
          <IconButton
            type="button"
            icon="close"
            variant="ghost"
            aria-label={language.t("common.close")}
            disabled={form.busy()}
            onClick={dialog.close}
          />
        </Show>
      </div>
      <Show
        when={form.state.confirmClose}
        fallback={
          <>
            <p class="text-14-regular text-text-weak">{language.t("loginom.description")}</p>
            <Show when={platform.loginom} fallback={<p role="status">{language.t("loginom.desktopOnly")}</p>}>
              <form
                ref={element}
                onSubmit={(event) => {
                  event.preventDefault()
                  void form.submit(true)
                }}
                class="flex flex-col gap-4"
              >
                <fieldset disabled={form.disabled()} class="flex flex-col gap-4">
                  <TextField
                    label={language.t("loginom.url")}
                    type="url"
                    value={form.state.url}
                    onChange={(url) => form.edit({ url })}
                    required
                  />
                  <TextField
                    label={language.t("loginom.username")}
                    value={form.state.username}
                    onChange={(username) => form.edit({ username })}
                    required
                    autocomplete="username"
                  />
                  <TextField
                    label={language.t("loginom.password")}
                    type="password"
                    value={form.state.password}
                    autocomplete="new-password"
                    onChange={(password) =>
                      form.edit({
                        password,
                        passwordMode: password ? "replace" : form.state.baseline?.hasPassword ? "preserve" : "empty",
                      })
                    }
                  />
                  <Show when={form.state.baseline?.hasPassword}>
                    <p class="text-12-regular text-text-weak">{language.t("loginom.passwordSaved")}</p>
                  </Show>
                  <label class="text-12-regular flex gap-2 items-center">
                    <input
                      type="checkbox"
                      checked={form.state.passwordMode === "empty"}
                      onChange={(event) =>
                        form.edit({ password: "", passwordMode: event.currentTarget.checked ? "empty" : "preserve" })
                      }
                    />
                    {language.t("loginom.emptyPassword")}
                  </label>
                  <p class="text-12-regular text-text-weak">
                    {language.t("loginom.folder")}: <code>{`/${form.state.username}`}</code>
                  </p>
                </fieldset>
                <div role="status" class="loginom-feedback" data-component="loginom-connection-status">
                  <p>
                    {language.t(
                      form.state.checkedBrowser || form.state.view?.state === "ready"
                        ? "loginom.helpReady"
                        : "loginom.helpNotReady",
                    )}
                  </p>
                  <p data-browser-state={(form.state.checkedBrowser ?? form.state.view?.browser)?.state ?? "unknown"}>
                    {language.t(loginomBrowserMessage(form.state.checkedBrowser ?? form.state.view?.browser))}
                  </p>
                </div>
                <Show when={form.pending()}>
                  <p role="status" class="loginom-feedback">
                    {language.t(form.state.view?.state === "starting" ? "loginom.applying" : "loginom.savedPending")}
                  </p>
                </Show>
                <Show when={form.state.view?.state === "recoverable-error" && !form.state.view?.recoveries?.length}>
                  <p role="alert">
                    {language.t(props.wizard ? "loginom.wizardRuntimeFailed" : "loginom.runtimeFailed")}
                  </p>
                </Show>
                <Show when={form.state.message}>
                  {(message) => (
                    <div
                      class="loginom-feedback"
                      data-failed={form.state.failed ? "true" : "false"}
                      role={form.state.failed ? "alert" : "status"}
                    >
                      {language.t(form.state.baseline ? message() : "loginom.loadFailed")}
                      <Show when={!form.state.baseline || message() === "loginom.conflict"}>
                        <Button type="button" variant="secondary" disabled={form.busy()} onClick={() => void load()}>
                          {language.t("loginom.refresh")}
                        </Button>
                      </Show>
                    </div>
                  )}
                </Show>
                <div class="loginom-actions flex flex-wrap gap-3">
                  <Button type="submit" variant="primary" disabled={!form.canSave()}>
                    {language.t(
                      form.state.phase === "checking"
                        ? "loginom.checking"
                        : form.state.phase === "saving"
                          ? "loginom.saving"
                          : form.state.phase === "applying"
                            ? "loginom.applying"
                            : "loginom.saveClose",
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={form.disabled()}
                    onClick={() => {
                      if (element?.reportValidity()) void form.submit(false)
                    }}
                  >
                    {language.t("loginom.check")}
                  </Button>
                  <Show when={form.state.view?.state === "pending"}>
                    <Button type="button" disabled={form.busy()} onClick={() => void form.cancelPending()}>
                      {language.t("loginom.cancel")}
                    </Button>
                  </Show>
                  <Show when={!props.wizard}>
                    <Button type="button" variant="ghost" disabled={form.busy()} onClick={dialog.close}>
                      {language.t("common.close")}
                    </Button>
                  </Show>
                </div>
              </form>
            </Show>
          </>
        }
      >
        <div class="flex flex-col gap-4" role="alertdialog" aria-label={language.t("loginom.discardTitle")}>
          <p>{language.t("loginom.discardTitle")}</p>
          <p class="text-14-regular text-text-weak">{language.t("loginom.discardDescription")}</p>
          <div class="flex flex-wrap gap-3">
            <Button type="button" variant="primary" autofocus onClick={form.continueEditing}>
              {language.t("loginom.keepEditing")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                form.discard()
                dialog.close()
              }}
            >
              {language.t("loginom.discardClose")}
            </Button>
          </div>
        </div>
      </Show>
    </section>
  )
}
