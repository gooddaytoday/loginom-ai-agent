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
  const request = transitionNodeDraft(initialNodeDraft, {
    type: "requested",
    attempt: "first",
    context,
    serverListed: true,
    tabs: [],
  })
  expect(request.effects).toEqual([{ type: "open", attempt: "first", context }])

  const transferred = transitionNodeDraft(request.state, { type: "mounted", sessionKey: "other-server\nses_original" })
  expect(transferred.effects).toEqual([])

  const attached = transitionNodeDraft(transferred.state, { type: "mounted", sessionKey: origin })
  expect(attached.effects).toEqual([{ type: "attach", context }])
  expect(transitionNodeDraft(attached.state, { type: "mounted", sessionKey: origin }).effects).toEqual([])
})

test("closing the original tab cancels a pending attachment, even when it opened after the request", () => {
  const request = transitionNodeDraft(initialNodeDraft, {
    type: "requested",
    attempt: "first",
    context,
    serverListed: true,
    tabs: [],
  })
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
  const previous = transitionNodeDraft(initialNodeDraft, {
    type: "requested",
    attempt: "first",
    context,
    serverListed: true,
    tabs: [origin],
  })
  const next: NodeContext = { ...context, source: { ...context.source, sessionID: "ses_other" }, intent: "edit" }
  const replacement = transitionNodeDraft(previous.state, {
    type: "requested",
    attempt: "next",
    context: next,
    serverListed: true,
    tabs: [origin],
  })
  expect(replacement.effects).toEqual([{ type: "open", attempt: "next", context: next }])

  const enteredPrevious = transitionNodeDraft(replacement.state, { type: "mounted", sessionKey: origin })
  expect(enteredPrevious.effects).toEqual([])
  expect(
    transitionNodeDraft(enteredPrevious.state, { type: "mounted", sessionKey: "server\nses_other" }).effects,
  ).toEqual([{ type: "attach", context: next }])
})

test("an unavailable source reports failure, replaces the old request, and never attaches on a later visit", () => {
  const earlier = transitionNodeDraft(initialNodeDraft, {
    type: "requested",
    attempt: "first",
    context,
    serverListed: true,
    tabs: [],
  })
  const unavailable = { ...context, source: { ...context.source, serverID: "unlisted" } }

  const request = transitionNodeDraft(earlier.state, {
    type: "requested",
    attempt: "unlisted",
    context: unavailable,
    serverListed: false,
    tabs: [],
  })

  expect(request.effects).toEqual([{ type: "unavailable" }])

  for (const key of [origin, "unlisted\nses_original"])
    expect(transitionNodeDraft(request.state, { type: "mounted", sessionKey: key }).effects).toEqual([])
})

test("terminal refusal clears only its own attachment request", () => {
  const first = transitionNodeDraft(initialNodeDraft, {
    type: "requested",
    attempt: "first",
    context,
    serverListed: true,
    tabs: [],
  })
  const next = transitionNodeDraft(first.state, {
    type: "requested",
    attempt: "next",
    context,
    serverListed: true,
    tabs: [],
  })
  const past = transitionNodeDraft(next.state, { type: "open.failed", attempt: "first" })
  expect(past.effects).toEqual([])
  expect(transitionNodeDraft(past.state, { type: "mounted", sessionKey: origin }).effects).toEqual([
    { type: "attach", context },
  ])

  const failed = transitionNodeDraft(past.state, { type: "open.failed", attempt: "next" })
  expect(failed.effects).toEqual([{ type: "unavailable" }])
  expect(transitionNodeDraft(failed.state, { type: "mounted", sessionKey: origin }).effects).toEqual([])
})
