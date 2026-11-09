import { describe, expect, test } from "bun:test"
import { createPromptState } from "@/context/prompt"
import { createPromptSubmissionState } from "@/components/prompt-input/submission-state"

describe("prompt submission state", () => {
  test("keeps failed submission restoration with the prompt where it started", () => {
    const target = createPromptState()
    const submission = createPromptSubmissionState({
      target,
      prompt: [{ type: "text", content: "prompt-A", start: 0, end: 8 }],
      context: [{ key: "file:src/index.ts:undefined:undefined", type: "file", path: "src/index.ts" }],
    })

    expect(submission.restore()).toEqual({
      target,
      prompt: [{ type: "text", content: "prompt-A", start: 0, end: 8 }],
      context: [{ key: "file:src/index.ts:undefined:undefined", type: "file", path: "src/index.ts" }],
    })
  })

  test("moves first-submit restoration and context to the promoted session", () => {
    const draft = createPromptState({ prompt: "first prompt" })
    draft.context.add({ type: "file", path: "src/index.ts" })
    const session = createPromptState()
    const submission = createPromptSubmissionState({
      target: draft,
      prompt: draft.current(),
      context: draft.context.items().slice(),
    })

    submission.retarget(session)

    expect(submission.restore()).toEqual({
      target: session,
      prompt: [{ type: "text", content: "first prompt", start: 0, end: 12 }],
      context: [{ key: "file:src/index.ts:undefined:undefined", type: "file", path: "src/index.ts" }],
    })
    expect(session.context.items()).toHaveLength(1)
    expect(session.context.items()[0]).toMatchObject({ type: "file", path: "src/index.ts" })
  })

  test("clears the original first-submit prompt after retargeting", () => {
    const workspace = createPromptState()
    const session = createPromptState()
    workspace.set([{ type: "text", content: "first prompt", start: 0, end: 12 }])
    const submission = createPromptSubmissionState({
      target: workspace,
      prompt: workspace.current(),
      context: [],
    })

    submission.retarget(session)
    submission.clear()

    expect(workspace.current()[0]).toMatchObject({ type: "text", content: "" })
    expect(session.current()[0]).toMatchObject({ type: "text", content: "" })
  })

  test("does not restore over a prompt edited after submission", () => {
    const target = createPromptState()
    target.set([{ type: "text", content: "submitted", start: 0, end: 9 }])
    const submission = createPromptSubmissionState({
      target,
      prompt: target.current(),
      context: [],
    })

    submission.clear()
    target.set([{ type: "text", content: "new draft", start: 0, end: 9 }])

    expect(submission.restore()).toBeUndefined()
    expect(target.current()[0]).toMatchObject({ type: "text", content: "new draft" })
  })
})

test("switching dashboard targets preserves the draft and the already selected target of a message", () => {
  const target = createPromptState({ prompt: "Change the heading" })
  target.context.add({ type: "file", path: "notes.txt" })
  target.context.add({ type: "dashboard", id: "A", action: "edit", nodeName: "First" })
  const submission = createPromptSubmissionState({
    target,
    prompt: target.current(),
    context: target.context.items().slice(),
  })

  target.context.add({ type: "dashboard", id: "B", action: "create", nodeName: "Second" })

  expect(target.context.items().map((item) => (item.type === "dashboard" ? item.id : item.path))).toEqual([
    "notes.txt",
    "B",
  ])
  expect(target.current()[0]).toMatchObject({ content: "Change the heading" })
  expect(submission.context[1]).toMatchObject({ type: "dashboard", id: "A" })
})

test("a dashboard is consumed with the submitted draft and can be restored after a failed send", () => {
  const target = createPromptState({ prompt: "Edit A" })
  target.context.add({ type: "dashboard", id: "A", action: "edit", nodeName: "First" })
  const submission = createPromptSubmissionState({
    target,
    prompt: target.current(),
    context: target.context.items().slice(),
  })
  submission.clear()
  expect(target.context.items()).toHaveLength(0)
  expect(submission.restore()?.context[0]).toMatchObject({ type: "dashboard", id: "A" })
  target.context.add({ type: "dashboard", id: "B", action: "edit", nodeName: "Second" })
  expect(submission.restore()).toBeUndefined()
  expect(target.context.items()[0]).toMatchObject({ type: "dashboard", id: "B" })
})

test("edits made while creating the session remain in its next draft", () => {
  const draft = createPromptState({ prompt: "Edit A" })
  draft.context.add({ type: "dashboard", id: "A", action: "edit", nodeName: "First" })
  const submission = createPromptSubmissionState({
    target: draft,
    prompt: draft.current(),
    context: draft.context.items().slice(),
  })
  draft.context.add({ type: "dashboard", id: "B", action: "edit", nodeName: "Second" })
  draft.set([{ type: "text", content: "Edit B", start: 0, end: 6 }], 4)
  const session = createPromptState()
  submission.retarget(session)
  submission.clear()

  expect(session.current()[0]).toMatchObject({ content: "Edit B" })
  expect(session.context.items()[0]).toMatchObject({ type: "dashboard", id: "B" })
  expect(submission.context[0]).toMatchObject({ type: "dashboard", id: "A" })
  expect(submission.restore()).toBeUndefined()
})
