import { instructionsBytes, instructionsMaxBytes } from "@loginom-ai-agent/loginom-host/settings-rpc"

type Form = { saved: string; text: string }
export type State = { attempt: number } & (
  | { type: "loading" | "load-failed" | "disposed" }
  | ({ type: "ready" | "save-failed" | "saving" } & Form)
)

export type Request = { type: "load"; attempt: number } | { type: "save"; attempt: number; text: string }
export type Event =
  | { type: "retry" | "submit" | "disposed" }
  | { type: "edit"; text: string }
  | { type: "loaded" | "saved"; attempt: number; text: string | undefined }

export const initialInstructions = { type: "loading", attempt: 1 } as const satisfies State

export function instructionsView(state: State) {
  const form = "saved" in state ? state : undefined
  const bytes = instructionsBytes(form?.text ?? "")
  const dirty = !!form && form.text !== form.saved
  const tooLong = bytes > instructionsMaxBytes
  const saving = state.type === "saving"
  return {
    loading: state.type === "loading",
    loadFailed: state.type === "load-failed",
    saveFailed: state.type === "save-failed",
    saving,
    form,
    bytes,
    dirty,
    tooLong,
    canSave: dirty && !saving && !tooLong,
  }
}

export function transitionInstructions(state: State, event: Event): { state: State; request?: Request } {
  if (event.type === "disposed") return { state: { type: "disposed", attempt: state.attempt } }
  if (event.type === "retry" && state.type === "load-failed") {
    const attempt = state.attempt + 1
    return { state: { type: "loading", attempt }, request: { type: "load", attempt } }
  }
  if (event.type === "loaded" && state.type === "loading" && state.attempt === event.attempt) {
    const { attempt, text } = event
    if (text === undefined) return { state: { type: "load-failed", attempt } }
    return { state: { type: "ready", attempt, saved: text, text } }
  }
  if (event.type === "saved" && state.type === "saving" && state.attempt === event.attempt) {
    const { text } = event
    if (text === undefined) return { state: { ...state, type: "save-failed" } }
    return { state: { ...state, type: "ready", saved: text, text } }
  }
  if (state.type === "ready" || state.type === "save-failed") {
    if (event.type === "edit") return { state: { ...state, text: event.text } }
    if (event.type === "submit" && instructionsView(state).canSave) {
      const attempt = state.attempt + 1
      return { state: { ...state, type: "saving", attempt }, request: { type: "save", attempt, text: state.text } }
    }
  }
  return { state }
}
