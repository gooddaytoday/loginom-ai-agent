import {
  Address,
  type Candidate,
  type CheckResult,
  type Issue,
  type Status,
  type StatusResult,
  type Validation,
} from "@loginom-ai-agent/loginom-host/settings-rpc"
import { Schema } from "effect"

type Draft = { url: string; username: string; password: string; noPassword: boolean }
type Form = { status: Status; draft: Draft }
type State = { attempt: number } & (
  | { type: "unavailable" | "loading" | "disposed" }
  | (Form & { type: "editing"; issue?: Issue })
  | (Form & { type: "checking"; submit: "check" | "save" })
  | (Form & { type: "verified"; validation: Validation })
  | (Form & { type: "saving" })
  | (Form & { type: "refreshing"; issue?: Issue; edited: boolean })
  | (Form & { type: "applying"; until: number; edited: boolean })
)

type Event =
  | { type: "target"; available: boolean }
  | { type: "disposed" }
  | { type: "refresh" }
  | { type: "application"; revision: number; generation: number }
  | { type: "edit"; patch: Partial<Draft> }
  | { type: "submit"; submit: "check" | "save"; now: number }
  | { type: "status" | "saved"; attempt: number; result: StatusResult; now: number }
  | { type: "checked"; attempt: number; result: CheckResult }

type Effect =
  | { type: "cancel" }
  | { type: "status"; attempt: number; delay?: number; timeout?: number }
  | { type: "check"; attempt: number; input: Candidate }
  | { type: "save"; attempt: number; input: { revision: number; validationId: string } }

type Transition = { state: State; effects: Effect[] }

const applicationWait = 15_000

export const initial: State = { type: "unavailable", attempt: 0 }

function form(status: Status): Form {
  return {
    status,
    draft: { url: status.url, username: status.username, password: "", noPassword: !status.hasPassword },
  }
}

function preservesPassword({ status, draft }: Form) {
  return (
    status.hasPassword &&
    draft.username.trim() === status.username &&
    URL.canParse(draft.url.trim()) &&
    new URL(draft.url.trim()).href === status.url
  )
}

function waiting(status: Status) {
  return !status.failed && (status.state === "pending" || status.state === "starting")
}

function draftCandidate(current: Form): Candidate | { issue: Issue } {
  const { status, draft } = current
  const url = draft.url.trim()
  const username = draft.username.trim()
  if (!Schema.is(Address)(url)) return { issue: "invalidAddress" }
  if (!username) return { issue: "invalidUsername" }
  const identity = { revision: status.revision, url, username }
  if (draft.noPassword) return { ...identity, password: { operation: "empty" } }
  if (draft.password) return { ...identity, password: { operation: "replace", value: draft.password } }
  if (preservesPassword(current)) return { ...identity, password: { operation: "preserve" } }
  return { issue: "passwordRequired" }
}

export function transition(state: State, event: Event): Transition {
  const attempt = state.attempt + 1
  const keep = { state, effects: [] }
  if (state.type === "disposed") return keep

  function save(current: Form, validationId: string) {
    return {
      state: { type: "saving", attempt, status: current.status, draft: current.draft },
      effects: [{ type: "save", attempt, input: { revision: current.status.revision, validationId } }],
    } satisfies Transition
  }

  switch (event.type) {
    case "disposed":
      return { state: { type: "disposed", attempt }, effects: [{ type: "cancel" }] }
    case "target":
      return event.available
        ? { state: { type: "loading", attempt }, effects: [{ type: "cancel" }, { type: "status", attempt }] }
        : { state: { type: "unavailable", attempt }, effects: [{ type: "cancel" }] }
    case "refresh":
      if (state.type === "unavailable") return transition(state, { type: "target", available: true })
      if (state.type !== "editing") return keep
      return refresh(state, attempt)
    case "application":
      if (state.type !== "applying" && state.type !== "editing") return keep

      if (!waiting(state.status) || event.revision < state.status.revision || event.generation < state.status.generation)
        return keep

      if (state.type === "editing") return refresh(state, attempt)

      return {
        state: { ...state, attempt },
        effects: [{ type: "cancel" }, { type: "status", attempt }],
      }
    case "edit": {
      if (!("draft" in state) || state.type === "saving") return keep
      const draft = { ...state.draft, ...event.patch }
      if (draft.noPassword) draft.password = ""
      if (state.type === "applying") return { state: { ...state, draft, edited: true }, effects: [] }
      if (state.type === "refreshing") return { state: { ...state, draft, edited: true }, effects: [] }
      return {
        state: { type: "editing", attempt, draft, status: state.status },
        effects: state.type === "checking" ? [{ type: "cancel" }] : [],
      }
    }
    case "submit": {
      if (state.type !== "editing" && state.type !== "verified") return keep
      if (event.submit === "save" && state.type === "verified" && event.now < state.validation.expiresAt)
        return save(state, state.validation.validationId)
      const candidate = draftCandidate(state)
      if ("issue" in candidate) return failed(state, candidate.issue)
      return {
        state: { type: "checking", attempt, draft: state.draft, status: state.status, submit: event.submit },
        effects: [{ type: "check", attempt, input: candidate }],
      }
    }
    case "checked":
      if (state.type !== "checking" || event.attempt !== state.attempt) return keep
      if (event.result.ok) {
        const validation = event.result.value
        if (state.submit === "save") return save(state, validation.validationId)
        return {
          state: { type: "verified", attempt, draft: state.draft, status: state.status, validation },
          effects: [],
        }
      }
      return failed(state, event.result.issue)
    case "saved":
    case "status": {
      if (event.attempt !== state.attempt) return keep
      if (event.type === "saved" && state.type !== "saving") return keep
      if (
        event.type === "status" &&
        state.type !== "loading" &&
        state.type !== "applying" &&
        state.type !== "refreshing"
      )
        return keep
      if (!event.result.ok) {
        if (state.type === "saving" && event.result.issue === "saveFailed") return refresh(state, attempt, "saveFailed")
        if (state.type === "loading") return { state: { type: "unavailable", attempt }, effects: [] }
        if (state.type === "applying" && event.now >= state.until)
          return { state: { type: "editing", attempt, status: state.status, draft: state.draft }, effects: [] }
        if ("draft" in state)
          return failed(state, state.type === "refreshing" ? (state.issue ?? event.result.issue) : event.result.issue)
        return keep
      }
      const status = event.result.value
      const recovered =
        state.type === "refreshing" && state.issue === "saveFailed" && state.status.revision !== status.revision
      const edited =
        (state.type === "applying" && state.edited) || (state.type === "refreshing" && (state.edited || !recovered))
      const draft = "draft" in state && edited ? state.draft : form(status).draft
      if (waiting(status)) {
        const pendingDraft =
          state.type === "saving" || (recovered && !edited) ? { ...state.draft, password: "" } : draft

        // Drains can last as long as the tasks. Bound the wait for startup once the tasks finish.
        const until =
          state.type === "applying" && !waitingTasks(state.status) && !waitingTasks(status)
            ? state.until
            : event.now + applicationWait
        const remaining = until - event.now
        if (remaining > 1000) {
          return {
            state: { type: "applying", attempt, status, draft: pendingDraft, until, edited },
            effects: [{ type: "status", attempt, delay: 1000, timeout: remaining - 1000 }],
          }
        }
        return { state: { type: "editing", attempt, status, draft: pendingDraft }, effects: [] }
      }
      const issue = state.type === "refreshing" && !recovered ? state.issue : undefined
      return { state: { type: "editing", attempt, status, draft, issue }, effects: [] }
    }
  }
}

function waitingTasks(status: Status) {
  return status.application?.state === "pending" ? status.application.tasks : 0
}

function refresh(state: Form, attempt: number, issue?: Issue): Transition {
  return {
    state: { type: "refreshing", attempt, status: state.status, draft: state.draft, issue, edited: false },
    effects: [{ type: "status", attempt }],
  }
}

function failed(state: Form & { attempt: number }, issue: Issue): Transition {
  return {
    state: { type: "editing", attempt: state.attempt, draft: state.draft, status: state.status, issue },
    effects: [],
  }
}

function message(state: State) {
  if (state.type === "disposed") return
  if (state.type === "loading" || state.type === "refreshing") return "loading"
  if (state.type === "unavailable") return "serviceUnavailable"
  if (state.type === "verified") return "verified"
  if (!("status" in state)) return
  if (state.status.failed) return "activationFailed"

  if (state.status.state === "ready" && state.status.application?.state === "applied") return "applied"

  if (state.type === "applying")
    return state.status.state === "pending" && !state.status.application ? "pending" : "starting"

  if (waiting(state.status)) return "applicationPaused"
  if (state.status.state !== "ready") return "disconnected"
}

export function view(state: State) {
  const form = "draft" in state ? state : undefined
  const issue = state.type === "editing" ? state.issue : undefined
  return {
    draft: form?.draft,
    connected: form?.status.state === "ready" && !form.status.failed ? form.status : undefined,
    message: message(state),
    waitingTasks: form && !form.status.failed ? waitingTasks(form.status) : 0,
    fieldErrors: {
      url: issue === "invalidAddress" || issue === "loginUnavailable" ? issue : undefined,
      username: issue === "invalidUsername" ? issue : undefined,
      password: issue === "passwordRequired" || issue === "credentialsRejected" ? issue : undefined,
    },
    issue:
      issue === "unavailable" ||
      issue === "changed" ||
      issue === "expired" ||
      issue === "saveFailed" ||
      issue === "knowledgeAuthFailed" ||
      issue === "checkFailed" ||
      issue === "logoutUnconfirmed"
        ? issue
        : undefined,
    passwordSaved: form && preservesPassword(form),
    readOnly: state.type === "saving",
    busy:
      state.type === "checking" || state.type === "saving" || state.type === "applying" || state.type === "refreshing",
    checking: state.type === "checking",
    saving: state.type === "saving",
    retry:
      state.type === "unavailable" ||
      (state.type === "editing" &&
        (waiting(state.status) || issue === "unavailable" || issue === "changed" || issue === "saveFailed")),
  }
}
