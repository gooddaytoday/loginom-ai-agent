import { expect, test } from "bun:test"
import type { NodeContext } from "../node-context"
import { initialNodeDraft, transitionNodeDraft } from "./machine"

const context: NodeContext = {
  source: { serverID: "server", sessionID: "ses_original", messageID: "msg_original" },
  node: { package: "sales.lgp", path: "/team/sales.lgp", guid: "{sales}", name: "Total" },
  intent: "ask",
}

const origin = "server\nses_original"

test("attaches only to the originating visit, even after an intermediate visit with the same ID on another server", () => {
  const request = transitionNodeDraft(initialNodeDraft, { type: "requested", context, tabs: [] })
  expect(request.effects).toEqual([{ type: "open", context }])

  const transferred = transitionNodeDraft(request.state, { type: "mounted", sessionKey: "other-server\nses_original" })
  expect(transferred.effects).toEqual([])

  const attached = transitionNodeDraft(transferred.state, { type: "mounted", sessionKey: origin })
  expect(attached.effects).toEqual([{ type: "attach", context }])
  expect(transitionNodeDraft(attached.state, { type: "mounted", sessionKey: origin }).effects).toEqual([])
})

test("closing the original tab cancels a pending attachment, even when it opened after the request", () => {
  const request = transitionNodeDraft(initialNodeDraft, { type: "requested", context, tabs: [] })
  const opening = transitionNodeDraft(request.state, { type: "tabs.changed", tabs: ["server\nses_other"] })
  const opened = transitionNodeDraft(opening.state, { type: "tabs.changed", tabs: [origin] })
  const closed = transitionNodeDraft(opened.state, { type: "tabs.changed", tabs: [] })
  const reopened = transitionNodeDraft(closed.state, { type: "mounted", sessionKey: origin })

  expect(reopened.effects).toEqual([])
  expect(transitionNodeDraft(opening.state, { type: "mounted", sessionKey: origin }).effects).toEqual([
    { type: "attach", context },
  ])
})

test("a new node action replaces the pending one even when the earlier origin mounts first", () => {
  const previous = transitionNodeDraft(initialNodeDraft, { type: "requested", context, tabs: [origin] })
  const next: NodeContext = { ...context, source: { ...context.source, sessionID: "ses_other" }, intent: "edit" }
  const replacement = transitionNodeDraft(previous.state, { type: "requested", context: next, tabs: [origin] })
  expect(replacement.effects).toEqual([{ type: "open", context: next }])

  const enteredPrevious = transitionNodeDraft(replacement.state, { type: "mounted", sessionKey: origin })
  expect(enteredPrevious.effects).toEqual([])
  expect(
    transitionNodeDraft(enteredPrevious.state, { type: "mounted", sessionKey: "server\nses_other" }).effects,
  ).toEqual([{ type: "attach", context: next }])
})
