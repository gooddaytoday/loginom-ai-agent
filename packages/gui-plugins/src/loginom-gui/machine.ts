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
  | (Form & { type: "saving" | "applying" })
)

type Event =
  | { type: "target"; available: boolean }
  | { type: "disposed" }
  | { type: "edit"; patch: Partial<Draft> }
  | { type: "submit"; submit: "check" | "save"; now: number }
  | { type: "status" | "saved"; attempt: number; result: StatusResult; blank?: boolean }
  | { type: "checked"; attempt: number; result: CheckResult }

type Effect =
  | { type: "cancel" }
  | { type: "status"; attempt: number; delay?: number }
  | { type: "check"; attempt: number; input: Candidate }
  | { type: "save"; attempt: number; input: { revision: number; validationId: string } }

type Transition = { state: State; effects: Effect[] }

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
    URL.canParse(draft.url) &&
    new URL(draft.url).href === status.url
  )
}

function draftCandidate(current: Form): Candidate | { issue: Issue } {
  const { status, draft } = current
  const url = draft.url.trim()
  const username = draft.username.trim()
  if (!Schema.is(Address)(url)) return { issue: !url && status.deviceOnly ? "deviceAddress" : "invalidAddress" }
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
    case "edit": {
      if (state.type !== "editing" && state.type !== "verified" && state.type !== "checking") return keep
      const draft = { ...state.draft, ...event.patch }
      if (draft.noPassword) draft.password = ""
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
      if (event.type === "status" && state.type !== "loading" && state.type !== "applying") return keep
      if (!event.result.ok) {
        if (state.type === "saving") return failed(state, event.result.issue)
        return { state: { type: "unavailable", attempt }, effects: [] }
      }
      const status = event.result.value
      if (!status.failed && (status.state === "pending" || status.state === "starting")) {
        const draft = "draft" in state ? { ...state.draft, password: "" } : form(status).draft
        return {
          state: { type: "applying", attempt, status, draft },
          effects: [{ type: "status", attempt, delay: 1000 }],
        }
      }
      const current = form(status)
      if (event.blank && state.type === "loading")
        current.draft = { url: "", username: "", password: "", noPassword: false }
      return { state: { type: "editing", attempt, ...current }, effects: [] }
    }
  }
}

function failed(state: Form & { attempt: number }, issue: Issue): Transition {
  return {
    state:
      issue === "unavailable"
        ? { type: "unavailable", attempt: state.attempt }
        : { type: "editing", attempt: state.attempt, draft: state.draft, status: state.status, issue },
    effects: [],
  }
}

export function view(state: State) {
  const form = "draft" in state ? state : undefined
  const issue = state.type === "editing" ? state.issue : undefined
  return {
    draft: form?.draft,
    connected: form?.status.state === "ready" && !form.status.failed ? form.status : undefined,
    message:
      state.type === "disposed"
        ? undefined
        : state.type === "loading"
          ? "loading"
          : state.type === "unavailable"
            ? "serviceUnavailable"
            : state.type === "applying"
              ? state.status.state === "pending"
                ? "pending"
                : "starting"
              : state.type === "verified"
                ? "verified"
                : form?.status.failed
                  ? "activationFailed"
                  : form?.status.state === "ready"
                    ? undefined
                    : "disconnected",
    deviceOnly: form?.status.deviceOnly ?? false,
    fieldErrors: {
      url: issue === "invalidAddress" || issue === "loginUnavailable" || issue === "deviceAddress" ? issue : undefined,
      username: issue === "invalidUsername" ? issue : undefined,
      password: issue === "passwordRequired" || issue === "credentialsRejected" ? issue : undefined,
    },
    issue:
      issue === "changed" ||
      issue === "expired" ||
      issue === "saveFailed" ||
      issue === "checkFailed" ||
      issue === "logoutUnconfirmed"
        ? issue
        : undefined,
    passwordSaved: form && preservesPassword(form),
    readOnly: state.type === "saving" || state.type === "applying",
    busy: state.type === "checking" || state.type === "saving" || state.type === "applying",
    checking: state.type === "checking",
    saving: state.type === "saving",
    retry: state.type === "unavailable" || issue === "changed" || issue === "saveFailed",
  }
}
