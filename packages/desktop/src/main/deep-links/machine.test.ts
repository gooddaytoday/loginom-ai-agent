import { describe, expect, test } from "bun:test"
import {
  createDeepLinkState,
  transitionDeepLinks,
  type DeepLinkCommand,
  type DeepLinkEvent,
  type DeepLinkState,
} from "./machine"

const dashboard = "loginom-ai-agent://dashboard?id=5302e8b4-0430-407d-b7b4-90311c82c851&action=create"

const otherDashboard = "loginom-ai-agent://dashboard?id=50bf4355-acb7-4bf4-89bf-f0b41d72405c&action=edit"

// Folds events through the machine and keeps the commands of each step.
function replay(events: readonly DeepLinkEvent[], from = createDeepLinkState()) {
  return events.reduce<{ state: DeepLinkState; commands: (readonly DeepLinkCommand[])[] }>(
    (result, event) => {
      const next = transitionDeepLinks(result.state, event)

      return { state: next.state, commands: [...result.commands, next.commands] }
    },
    { state: from, commands: [] },
  )
}

const ready = (windowID: string, clientID: number): DeepLinkEvent[] => [
  { type: "window.opened", windowID },
  { type: "window.ready", windowID, clientID },
]

describe("deep link delivery", () => {
  test("delivers an opaque payload that arrives before the window is ready", () => {
    const payload = { channel: "example", data: { outcome: "ready" } }
    const result = replay([{ type: "links.received", urls: [payload] }, ...ready("a", 1)])

    expect(result.commands.at(-1)).toEqual([
      { type: "links.deliver", windowID: "a", clientID: 1, attempt: 1, urls: [payload] },
    ])
  })

  test("never hands an acknowledged link to a reloaded or new window", () => {
    const live = replay([
      ...ready("a", 1),
      { type: "window.focused", windowID: "a" },
      { type: "links.received", urls: [dashboard] },
    ])

    expect(live.commands.at(-1)).toEqual([
      { type: "links.deliver", windowID: "a", clientID: 1, attempt: 1, urls: [dashboard] },
      { type: "window.focus", windowID: "a" },
    ])

    // View > Reload, then a new window: on dev both booted renderers drained the shared queue again.
    const after = replay(
      [
        { type: "delivery.acknowledged", clientID: 1, attempt: 1 },
        { type: "client.disconnected", clientID: 1 },
        { type: "window.ready", windowID: "a", clientID: 2 },
        ...ready("b", 3),
      ],
      live.state,
    )

    expect(after.commands.flat()).toEqual([])
    expect(after.state.links).toEqual([])
  })

  test("queues a link until the first window is ready", () => {
    const result = replay([
      { type: "links.received", urls: [dashboard] },
      { type: "window.opened", windowID: "a" },
    ])

    expect(result.commands.flat()).toEqual([])

    expect(transitionDeepLinks(result.state, { type: "window.ready", windowID: "a", clientID: 1 }).commands).toEqual([
      { type: "links.deliver", windowID: "a", clientID: 1, attempt: 1, urls: [dashboard] },
    ])
  })

  test("delivers a batch in arrival order to the focused window", () => {
    const result = replay([
      ...ready("b", 2),
      ...ready("c", 3),
      { type: "window.focused", windowID: "c" },
      { type: "links.received", urls: [dashboard, otherDashboard] },
    ])

    expect(result.commands.at(-1)).toEqual([
      { type: "links.deliver", windowID: "c", clientID: 3, attempt: 1, urls: [dashboard, otherDashboard] },
      { type: "window.focus", windowID: "c" },
    ])
  })

  test("delivers an unacknowledged link again to the next renderer and ignores stale replies", () => {
    const delivered = replay([...ready("a", 1), { type: "links.received", urls: [dashboard] }])

    const reloaded = replay(
      [
        { type: "client.disconnected", clientID: 1 },
        { type: "window.ready", windowID: "a", clientID: 2 },
      ],
      delivered.state,
    )

    expect(reloaded.commands).toEqual([
      [],
      [{ type: "links.deliver", windowID: "a", clientID: 2, attempt: 2, urls: [dashboard] }],
    ])

    const stale: DeepLinkEvent[] = [
      { type: "delivery.acknowledged", clientID: 1, attempt: 1 },
      { type: "delivery.acknowledged", clientID: 2, attempt: 1 },
      { type: "delivery.acknowledged", clientID: 1, attempt: 2 },
      { type: "client.disconnected", clientID: 1 },
      { type: "window.ready", windowID: "a", clientID: 2 },
    ]

    stale.forEach((event) => {
      const next = transitionDeepLinks(reloaded.state, event)
      expect(next.state).toBe(reloaded.state)
      expect(next.commands).toEqual([])
    })
  })

  test("delivers queued links to the next window when the focused window closes", () => {
    const result = replay([
      { type: "window.opened", windowID: "a" },
      ...ready("b", 2),
      { type: "window.focused", windowID: "a" },
      { type: "links.received", urls: [dashboard] },
      { type: "window.closed", windowID: "a" },
    ])

    expect(result.commands.at(-1)).toEqual([
      { type: "links.deliver", windowID: "b", clientID: 2, attempt: 1, urls: [dashboard] },
    ])
  })

  test("follows focus to a ready window while the focused one loads", () => {
    const result = replay([
      { type: "window.opened", windowID: "a" },
      { type: "window.focused", windowID: "a" },
      ...ready("b", 2),
      { type: "links.received", urls: [dashboard] },
      { type: "window.focused", windowID: "b" },
    ])

    expect(result.commands.at(-2)).toEqual([{ type: "window.focus", windowID: "a" }])
    expect(result.commands.at(-1)).toEqual([
      { type: "links.deliver", windowID: "b", clientID: 2, attempt: 1, urls: [dashboard] },
    ])
  })

  test("adopts a window whose renderer reports ready before it registers", () => {
    const result = replay([
      { type: "window.ready", windowID: "a", clientID: 1 },
      { type: "window.opened", windowID: "a" },
    ])

    expect(result.state.windows).toEqual({ a: { status: "ready", clientID: 1 } })
  })
})
