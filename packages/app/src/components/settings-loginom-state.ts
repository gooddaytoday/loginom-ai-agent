import { onCleanup } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import type { Loginom } from "@loginom-ai-agent/schema/loginom"

export function loginomError(value: unknown) {
  const code = value instanceof Error ? value.message.match(/LOGINOM_[A-Z_]+/)?.[0] : undefined
  switch (code) {
    case "LOGINOM_REVISION_CONFLICT":
      return "loginom.conflict"
    case "LOGINOM_KNOWLEDGE_AUTH_FAILED":
      return "loginom.invalidKey"
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

const delay = () => new Promise<void>((resolve) => setTimeout(resolve, 1000))

// This promise intentionally outlives the settings dialog. Only redacted views
// are retained, so a deferred activation failure remains visible after closing.
export async function watchLoginomApplication(
  api: Loginom.API,
  saved: Loginom.View,
  notify: (result: "ready" | "failed" | "unknown" | "superseded") => void,
  wait = delay,
) {
  try {
    for (;;) {
      await wait()
      const current = await api.status()
      if (current.revision !== saved.revision) return notify("superseded")
      if (current.failure || current.state === "recoverable-error") return notify("failed")
      if (current.state === "ready") return notify(current.generation > saved.generation ? "ready" : "failed")
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
    url: "http://logi-test-plan.bg.local/app/",
    username: "user",
    apiKey: "",
    password: "",
    passwordMode: "empty" as "preserve" | "replace" | "empty",
    phase: "idle" as "idle" | "checking" | "saving" | "applying",
    message: undefined as ReturnType<typeof loginomError> | "loginom.checked" | "loginom.checkedSaved" | undefined,
    failed: false,
    confirmClose: false,
  })
  let disposed = false
  onCleanup(() => {
    disposed = true
    setState({ apiKey: "", password: "" })
  })
  const busy = () => state.phase !== "idle"
  const pending = () => state.view?.state === "pending" || state.view?.state === "starting"
  const dirty = () =>
    !!state.baseline &&
    (state.url !== state.baseline.url ||
      state.username !== state.baseline.username ||
      !!state.apiKey ||
      !!state.password ||
      (state.passwordMode === "empty") !== !state.baseline.hasPassword)
  const disabled = () => !state.baseline || busy() || pending()
  const canSave = () => !disabled() && (dirty() || !!state.view?.failure || state.view?.state === "recoverable-error")

  function error(value: unknown) {
    if (!disposed) setState({ failed: true, message: loginomError(value) })
  }
  function apply(view: Loginom.View) {
    setState("view", reconcile({ ...view }))
    setState("baseline", reconcile({ ...view }))
    setState({
      url: view.url,
      username: view.username,
      passwordMode: view.hasPassword ? "preserve" : "empty",
      apiKey: "",
      password: "",
      message: undefined,
      failed: false,
      confirmClose: false,
    })
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
    if (!api || busy() || !state.baseline) return
    try {
      const current = await api.status()
      if (disposed || busy()) return
      const failureChanged = current.failure !== state.view?.failure
      if (
        !dirty() &&
        current.state === "ready" &&
        (current.revision !== state.baseline?.revision || current.generation !== state.baseline?.generation)
      )
        apply(current)
      setState("view", reconcile({ ...current }))
      if (current.failure && failureChanged) error(new Error(current.failure))
    } catch (value) {
      error(value)
    }
  }
  function edit(values: Partial<Pick<typeof state, "url" | "username" | "apiKey" | "password" | "passwordMode">>) {
    setState({ ...values, message: undefined, failed: false })
  }
  function requestClose() {
    if (busy()) return false
    if (!dirty()) return true
    setState("confirmClose", true)
    return false
  }
  async function submit(save: boolean) {
    if (!api || disabled() || (save && !canSave())) return
    setState({ phase: "checking", message: undefined, failed: false })
    try {
      const candidate: Loginom.Candidate = {
        revision: state.baseline!.revision,
        url: state.url,
        username: state.username,
        apiKey: state.apiKey ? { operation: "replace", value: state.apiKey } : { operation: "preserve" },
        password:
          state.passwordMode === "replace"
            ? { operation: "replace", value: state.password }
            : { operation: state.passwordMode },
      }
      const validation = await api.check(candidate)
      if (disposed) return
      if (!save) {
        setState("message", dirty() ? "loginom.checked" : "loginom.checkedSaved")
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
      if (current.failure || !["ready", "pending"].includes(current.state))
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
  async function recover() {
    if (!api || busy() || !state.view) return
    setState("phase", "applying")
    try {
      const current = await api.acknowledgeRecovery({ revision: state.view.revision, ids: state.view.recoveries ?? [] })
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
    load,
    refresh,
    edit,
    submit,
    requestClose,
    recover,
    cancelPending,
    continueEditing: () => setState("confirmClose", false),
    discard: () => {
      if (state.baseline) apply(state.baseline)
    },
  }
}
