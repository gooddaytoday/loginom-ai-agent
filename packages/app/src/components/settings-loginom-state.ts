import { onCleanup } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import type { Loginom } from "@opencode-ai/schema/loginom"
import { Product } from "@loginom-ai-agent/product"

export function loginomError(value: unknown) {
  const code = value instanceof Error ? value.message.match(/LOGINOM_[A-Z_]+/)?.[0] : undefined
  switch (code) {
    case "LOGINOM_REVISION_CONFLICT":
      return "loginom.conflict"
    case "LOGINOM_KNOWLEDGE_AUTH_FAILED":
      return "loginom.ai.invalidKey"
    case "LOGINOM_KNOWLEDGE_UNAVAILABLE":
      return "loginom.serverUnavailable"
    case "LOGINOM_LOGIN_REJECTED":
      return "loginom.invalidPassword"
    case "LOGINOM_ACCOUNT_MISMATCH":
      return "loginom.accountMismatch"
    case "LOGINOM_LOGIN_UNAVAILABLE":
      return "loginom.webUnavailable"
    case "LOGINOM_BROWSER_START_FAILED":
      return "loginom.browserFailed"
    default:
      return "loginom.failed"
  }
}

export function loginomBrowserMessage(browser?: Loginom.BrowserStatus) {
  if (browser?.state === "verified") return "loginom.browserVerified"
  if (browser?.state !== "failed") return "loginom.browserUnknown"
  if (browser.failure === "LOGINOM_ACCOUNT_MISMATCH") return "loginom.browserAccountMismatch"
  return loginomError(new Error(browser.failure))
}

const delay = () => new Promise<void>((resolve) => setTimeout(resolve, 1000))

// This promise intentionally outlives the settings dialog. Only redacted views
// are retained, so a deferred activation failure remains visible after closing.
export async function watchLoginomApplication(
  api: Loginom.API,
  saved: Loginom.View,
  notify: (
    result: "ready" | "failed" | "unknown" | "superseded" | "connection-required",
    current?: Loginom.View,
  ) => void,
  wait = delay,
) {
  try {
    for (;;) {
      await wait()
      const current = await api.status()
      if (current.revision !== saved.revision) return notify("superseded")
      if (current.failure || current.state === "recoverable-error") return notify("failed")
      if (current.state === "ready") return notify(current.generation > saved.generation ? "ready" : "failed", current)
      if (current.state === "connection-required") return notify("connection-required", current)
      if (current.state === "unconfigured") return notify("failed")
    }
  } catch {
    notify("unknown")
  }
}

export function createLoginomSettings(api: Loginom.API | undefined, saved: (view: Loginom.View) => void, wait = delay) {
  const [state, setState] = createStore({
    view: undefined as Loginom.View | undefined,
    baseline: undefined as Loginom.View | undefined,
    mode: "cloud" as Loginom.Mode,
    endpoint: "",
    apiKey: "",
    apiKeyMode: "empty" as "preserve" | "replace" | "empty",
    url: Product.connection.url as string,
    username: Product.connection.username as string,
    password: "",
    passwordMode: "empty" as "preserve" | "replace" | "empty",
    cloudBusy: false,
    phase: "idle" as "idle" | "checking" | "saving" | "applying",
    message: undefined as
      | ReturnType<typeof loginomError>
      | "loginom.checked"
      | "loginom.checkedSaved"
      | "loginom.helpChecked"
      | "loginom.helpCheckedSaved"
      | "loginom.ai.required"
      | undefined,
    checkedHelp: undefined as Loginom.View["help"] | undefined,
    checkedBrowser: undefined as Loginom.BrowserStatus | undefined,
    failed: false,
    confirmClose: false,
  })
  let disposed = false
  let management = 0
  let loginStarting = false
  let cancelling = false
  onCleanup(() => {
    disposed = true
    if (state.view?.cloud.pending || loginStarting) void cancelLogin()
    setState({ password: "", apiKey: "" })
  })
  const busy = () => state.phase !== "idle"
  const pending = () => state.view?.state === "pending" || state.view?.state === "starting"
  const dirty = () =>
    !!state.baseline &&
    (state.mode !== state.baseline.mode ||
      state.endpoint !== (state.baseline.endpoint ?? "") ||
      !!state.apiKey ||
      (state.apiKeyMode === "empty") !== !state.baseline.hasApiKey ||
      state.url !== state.baseline.url ||
      state.username !== state.baseline.username ||
      !!state.password ||
      (state.passwordMode === "empty") !== !state.baseline.hasPassword)
  const disabled = () => !state.baseline || busy() || state.cloudBusy || pending()
  const canSave = () => !disabled() && (dirty() || !!state.view?.failure || state.view?.state === "recoverable-error")
  const canPreserveApiKey = (endpoint = state.endpoint) =>
    !!state.baseline?.hasApiKey &&
    URL.canParse(endpoint) &&
    URL.canParse(state.baseline.endpoint ?? "") &&
    new URL(endpoint).origin === new URL(state.baseline.endpoint!).origin

  function error(value: unknown) {
    if (!disposed) setState({ failed: true, message: loginomError(value) })
  }
  function apply(view: Loginom.View) {
    setState("view", reconcile({ ...view }))
    setState("baseline", reconcile({ ...view }))
    setState({
      mode: view.mode,
      endpoint: view.endpoint ?? "",
      apiKey: "",
      apiKeyMode: view.hasApiKey ? "preserve" : "empty",
      url: view.url,
      username: view.username,
      passwordMode: view.hasPassword ? "preserve" : "empty",
      password: "",
      message: undefined,
      checkedHelp: undefined,
      checkedBrowser: undefined,
      failed: false,
      confirmClose: false,
    })
  }
  function updateView(view: Loginom.View) {
    if (view.help.state !== state.view?.help.state) setState("checkedHelp", undefined)
    setState("view", reconcile({ ...view }))
  }
  async function load() {
    if (!api || busy()) return
    try {
      const view = await api.read()
      if (!disposed) {
        apply(view)
        if (view.failure) error(new Error(view.failure))
      }
    } catch (value) {
      error(value)
    }
  }
  async function refresh() {
    if (!api || busy() || state.cloudBusy || !state.baseline) return
    const version = management
    try {
      const current = await api.status()
      if (disposed || busy() || state.cloudBusy || version !== management) return
      const failureChanged = current.failure !== state.view?.failure
      if (
        !dirty() &&
        pending() &&
        (current.state === "ready" || current.state === "connection-required") &&
        (current.revision !== state.baseline?.revision || current.generation !== state.baseline?.generation)
      )
        apply(current)
      updateView(current)
      if (current.failure && failureChanged) error(new Error(current.failure))
    } catch (value) {
      if (version === management) error(value)
    }
  }
  function edit(
    values: Partial<
      Pick<
        typeof state,
        "mode" | "endpoint" | "apiKey" | "apiKeyMode" | "url" | "username" | "password" | "passwordMode"
      >
    >,
  ) {
    const changedOrigin =
      values.endpoint !== undefined &&
      values.endpoint !== state.endpoint &&
      (!URL.canParse(values.endpoint) ||
        !URL.canParse(state.endpoint) ||
        new URL(values.endpoint).origin !== new URL(state.endpoint).origin)
    setState({
      ...(changedOrigin
        ? { apiKey: "", apiKeyMode: canPreserveApiKey(values.endpoint) ? ("preserve" as const) : ("empty" as const) }
        : {}),
      ...values,
      message: undefined,
      checkedHelp: undefined,
      checkedBrowser: undefined,
      failed: false,
    })
  }
  function requestClose() {
    if (busy()) return false
    if (!dirty()) {
      if (state.view?.cloud.pending || loginStarting) void cancelLogin()
      return true
    }
    setState("confirmClose", true)
    return false
  }
  async function submit(save: boolean) {
    if (!api || disabled() || (save && !canSave())) return
    setState({
      phase: "checking",
      message: undefined,
      checkedHelp: undefined,
      checkedBrowser: undefined,
      failed: false,
    })
    try {
      const candidate: Loginom.Check = {
        mode: state.mode,
        endpoint: state.endpoint,
        apiKey:
          state.apiKeyMode === "replace"
            ? { operation: "replace", value: state.apiKey }
            : { operation: state.apiKeyMode },
        verifyBrowser: !(save && state.mode === "cloud" && !state.view?.cloud.connected),
        revision: state.baseline!.revision,
        url: state.url,
        username: state.username,
        password:
          state.passwordMode === "replace"
            ? { operation: "replace", value: state.password }
            : { operation: state.passwordMode },
      }
      const validation = await api.check(candidate)
      if (disposed) return
      setState("checkedHelp", { ...validation.help })
      setState("checkedBrowser", validation.browser ? { ...validation.browser } : undefined)
      if (!save) {
        setState(
          "message",
          validation.help.state !== "ready"
            ? "loginom.ai.required"
            : validation.browser && validation.browser.state !== "verified"
              ? dirty()
                ? "loginom.helpChecked"
                : "loginom.helpCheckedSaved"
              : dirty()
                ? "loginom.checked"
                : "loginom.checkedSaved",
        )
        return
      }
      setState("phase", "saving")
      let current = await api.save({ validationId: validation.validationId, revision: candidate.revision })
      const revision = current.revision
      const deadline = Date.now() + 180_000
      while (current.state === "starting" && !current.failure) {
        if (Date.now() >= deadline) throw Error("LOGINOM_APPLICATION_PENDING")
        setState("phase", "applying")
        await wait()
        current = await api.status()
        if (current.revision !== revision) throw Error("LOGINOM_REVISION_CONFLICT")
      }
      if (disposed) return
      setState("view", reconcile({ ...current }))
      setState("baseline", { ...state.baseline!, revision: current.revision })
      // The settings are durable but activation awaits explicit recovery. The
      // form already shows that notice; this is not a failed connection check.
      if (current.recoveries?.length && !current.failure) return
      if (current.failure || !["ready", "pending", "connection-required"].includes(current.state))
        throw Error(current.failure ?? "LOGINOM_RUNTIME_START_FAILED")
      apply(current)
      setState("phase", "idle")
      saved(current)
    } catch (value) {
      error(value)
    } finally {
      if (!disposed) setState("phase", "idle")
    }
  }
  async function connect(openExternal: (url: string) => void | Promise<void>) {
    if (!api || busy() || state.cloudBusy || state.view?.cloud.connected || state.view?.cloud.pending) return
    const version = ++management
    loginStarting = true
    setState("cloudBusy", true)
    try {
      const current = await api.cloudStart()
      if (disposed || version !== management) return
      updateView(current)
      const pending = current.cloud.pending
      if (pending) void Promise.resolve().then(() => {
        if (!disposed && version === management) return openExternal(pending.verificationUrl)
      }).catch(() => {})
    } catch (value) {
      if (version === management) error(value)
    } finally {
      if (version === management) {
        loginStarting = false
        if (!disposed) setState("cloudBusy", false)
      }
    }
  }
  async function cancelLogin() {
    if (!api || cancelling) return
    cancelling = true
    loginStarting = false
    const version = ++management
    if (!disposed) setState("cloudBusy", true)
    try {
      const current = await api.cloudCancel()
      if (!disposed && version === management) updateView(current)
    } catch (value) {
      if (version === management) error(value)
    } finally {
      cancelling = false
      if (!disposed && version === management) setState("cloudBusy", false)
    }
  }
  async function disconnect() {
    if (!api || busy() || state.cloudBusy) return
    const version = ++management
    setState("cloudBusy", true)
    try {
      const current = await api.cloudDisconnect()
      if (!disposed && version === management) updateView(current)
    } catch (value) {
      if (version === management) error(value)
    } finally {
      if (!disposed && version === management) setState("cloudBusy", false)
    }
  }
  async function recover() {
    if (!api || busy() || !state.view) return
    setState("phase", "applying")
    try {
      // Solid store arrays are proxies; Electron cannot clone them across IPC.
      const current = await api.acknowledgeRecovery({
        revision: state.view.revision,
        ids: [...(state.view.recoveries ?? [])],
      })
      if (!disposed) apply(current)
    } catch (value) {
      error(value)
    } finally {
      if (!disposed) setState("phase", "idle")
    }
  }
  async function cancelPending() {
    if (!api || busy() || !state.view) return
    setState("phase", "saving")
    try {
      const current = await api.cancelPending({ revision: state.view.revision })
      if (!disposed) apply(current)
    } catch (value) {
      error(value)
    } finally {
      if (!disposed) setState("phase", "idle")
    }
  }
  return {
    state,
    busy,
    pending,
    dirty,
    disabled,
    canSave,
    canPreserveApiKey,
    load,
    refresh,
    edit,
    submit,
    requestClose,
    recover,
    connect,
    cancelLogin,
    disconnect,
    cancelPending,
    continueEditing: () => setState("confirmClose", false),
    discard: () => {
      const view = state.view
      if (state.baseline) apply(state.baseline)
      if (view) setState("view", reconcile({ ...view }))
    },
  }
}
