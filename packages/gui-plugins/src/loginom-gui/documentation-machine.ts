import type { Format } from "@loginom-ai-agent/loginom-host/runner-rpc"
import type { Content, historyResult, Outcome, Run } from "./documentation-run"

type Form = {
  path: string
  formats: readonly Format[]
  content: Content
  description: string
  model: string
}

type Evidence = ReturnType<typeof historyResult>

type Activity = { attempt: string; run: Run; evidence?: Evidence }

type Result = { outcome: Outcome; run?: Run; evidence?: Evidence; openError?: true }

export type State = { form: Form } & (
  | { kind: "parameters"; picker?: "pending" | "failed" }
  | { kind: "access" }
  | { kind: "preparing"; attempt: string; intent: "start" | "stop" }
  | ({ kind: "running" | "stopping" | "checking" } & Activity)
  | ({ kind: "result"; attempt: string } & Result)
  | { kind: "disposed" }
)

type Event =
  | { type: "edit"; form: Partial<Form> }
  | { type: "pick" }
  | { type: "picked"; path?: string; error?: true }
  | { type: "next" | "back" | "stop" | "again" | "dispose" }
  | { type: "start" | "check"; attempt: string }
  | { type: "admitted"; attempt: string; run: Run }
  | { type: "progress"; attempt: string; evidence: Evidence }
  | { type: "finish"; attempt: string; result: Result }
  | { type: "open"; attempt: string; error?: true }

export const initial: State = {
  kind: "parameters",
  form: { path: "", formats: ["pdf"], content: "brief", description: "", model: "" },
}

export function valid(form: Form) {
  return (
    /\.lgp$/i.test(form.path.trim()) &&
    form.formats.length > 0 &&
    (form.content !== "custom" || !!form.description.trim())
  )
}

export function transition(state: State, event: Event): State {
  if (state.kind === "disposed") return state

  if (event.type === "dispose") return { kind: "disposed", form: state.form }

  switch (state.kind) {
    case "parameters":
      if (event.type === "edit") return { ...state, form: { ...state.form, ...event.form } }

      if (event.type === "next" && valid(state.form)) return { kind: "access", form: state.form }

      if (event.type === "pick" && state.picker !== "pending") return { ...state, picker: "pending" }

      if (event.type !== "picked" || state.picker !== "pending") return state

      if (event.error) return { ...state, picker: "failed" }

      return {
        kind: "parameters",
        form: event.path ? { ...state.form, path: event.path } : state.form,
      }
    case "access":
      if (event.type === "edit") return { ...state, form: { ...state.form, ...event.form } }

      if (event.type === "back") return { kind: "parameters", form: state.form }

      if (event.type === "start") {
        return { kind: "preparing", form: state.form, intent: "start", attempt: event.attempt }
      }

      return state
    case "preparing":
      if (event.type === "stop" && state.intent === "start") return { ...state, intent: "stop" }

      if (event.type === "admitted" && event.attempt === state.attempt) {
        return {
          kind: state.intent === "stop" ? "stopping" : "running",
          form: state.form,
          attempt: state.attempt,
          run: event.run,
        }
      }

      break
    case "running":
      if (event.type === "stop") return { ...state, kind: "stopping" }
      break
    case "result":
      if (event.type === "again" && state.outcome !== "unknown") return { kind: "parameters", form: state.form }

      if (event.type === "check" && state.outcome === "unknown" && state.run) {
        return { kind: "checking", form: state.form, run: state.run, attempt: event.attempt, evidence: state.evidence }
      }

      if (event.type === "open" && event.attempt === state.attempt) return { ...state, openError: event.error }

      return state
  }

  if (!("attempt" in event) || event.attempt !== state.attempt) return state

  if (event.type === "progress" && (state.kind === "running" || state.kind === "stopping")) {
    return { ...state, evidence: event.evidence }
  }

  if (event.type !== "finish") return state

  return {
    kind: "result",
    form: state.form,
    attempt: state.attempt,
    evidence: "evidence" in state ? state.evidence : undefined,
    ...event.result,
  }
}

export function view(state: State) {
  const evidence = "evidence" in state ? state.evidence : undefined
  const run = "run" in state ? state.run : undefined
  const step = { parameters: 0, access: 1, preparing: 2, running: 2, stopping: 2, result: 3, checking: 3, disposed: 2 }
  const result = state.kind === "result" ? state.outcome : undefined

  return {
    form: state.form,
    step: step[state.kind],
    canContinue: valid(state.form),
    pickFailed: state.kind === "parameters" && state.picker === "failed",
    openFailed: state.kind === "result" && state.openError,
    stopping: state.kind === "stopping" || (state.kind === "preparing" && state.intent === "stop"),
    checking: state.kind === "checking",
    outcome: state.kind === "checking" ? "unknown" : result,
    stage: run ? (evidence?.stage ?? 1) : 0,
    files: Array.from(evidence?.files ?? []),
    run,
  }
}
