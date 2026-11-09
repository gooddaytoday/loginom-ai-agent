import { type ContextItem, type Prompt, type usePrompt } from "@/context/prompt"

type PromptTarget = ReturnType<ReturnType<typeof usePrompt>["capture"]>

export function createPromptSubmissionState(input: {
  target: PromptTarget
  prompt: Prompt
  context: (ContextItem & { key: string })[]
}) {
  let target = input.target
  let submittedPrompt = input.prompt
  let submittedDashboard = input.context.find((item) => item.type === "dashboard")
  const dashboard = (draft: PromptTarget) => draft.context.items().find((item) => item.type === "dashboard")
  let superseded = false
  let cleared: Prompt | undefined
  let clearedContext: ReturnType<PromptTarget["context"]["items"]> | undefined

  return {
    prompt: input.prompt,
    context: input.context,
    target: () => target,
    clear(consumeDashboard = true) {
      const selected = dashboard(target)
      const samePrompt = target.current() === submittedPrompt
      superseded = !samePrompt || (consumeDashboard && selected !== submittedDashboard)
      if (consumeDashboard && selected && selected === submittedDashboard) target.context.remove(selected.key)
      if (samePrompt) target.reset()
      cleared = target.current()
      clearedContext = target.context.items()
    },
    retarget(next: PromptTarget) {
      if (next === target) return
      target.context.items().forEach(next.context.add)
      if (submittedDashboard && dashboard(target) === submittedDashboard) {
        target.context.remove(submittedDashboard.key)
        submittedDashboard = dashboard(next)
      }
      if (target.current() === submittedPrompt) {
        target.reset()
        submittedPrompt = next.current()
      } else {
        next.set(target.current(), target.cursor())
      }
      target = next
    },
    current: (value: PromptTarget) => target === value,
    restore() {
      if (superseded) return
      if (cleared !== undefined && (target.current() !== cleared || target.context.items() !== clearedContext)) return
      return { target, prompt: input.prompt, context: input.context }
    },
  }
}
