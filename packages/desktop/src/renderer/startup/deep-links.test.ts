import { expect, test } from "bun:test"
import { subscribeBuiltinDeepLinks } from "@opencode/plugin/gui/builtin"
import type { ElectronAPI } from "../api-types"
import { startDeepLinks } from "./deep-links"

test("routes raw URLs to the window and keeps only the latest pending JSON per built-in channel", () => {
  const globals: { window?: Window } = globalThis
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window")
  const previousUrl = "opencode://previous"
  const url = "opencode://next"
  const renderer = Object.assign(new EventTarget(), { __OPENCODE__: { deepLinks: [previousUrl] } })
  const events: Event[] = []
  const acknowledgements: number[] = []
  const first: unknown[] = []
  const second: unknown[] = []
  let handler: Parameters<ElectronAPI["onDeepLink"]>[0] | undefined
  const stops: (() => void)[] = []

  Object.defineProperty(globalThis, "window", { configurable: true, value: renderer })
  renderer.addEventListener("opencode:deep-link", (event) => events.push(event))

  try {
    startDeepLinks({
      onDeepLink(receive) {
        handler = receive

        return () => undefined
      },
      readyDeepLinks() {
        handler?.({
          attempt: 4,
          urls: [
            { channel: "first", data: { id: "superseded" } },
            { channel: "second", data: null },
            url,
            { channel: "first", data: { id: "current" } },
          ],
        })
      },
      acknowledgeDeepLinks: (attempt) => void acknowledgements.push(attempt),
    })

    expect(renderer.__OPENCODE__.deepLinks).toEqual([previousUrl, url])
    expect(events).toEqual([expect.objectContaining({ detail: { urls: [url] } })])
    expect(acknowledgements).toEqual([4])

    stops.push(subscribeBuiltinDeepLinks("first", (data) => first.push(data)))
    stops.push(subscribeBuiltinDeepLinks("second", (data) => second.push(data)))
    expect(first).toEqual([{ id: "current" }])
    expect(second).toEqual([null])

    handler?.({ attempt: 5, urls: [{ channel: "first", data: "live" }, { channel: "first", data: false }] })

    expect(first).toEqual([{ id: "current" }, "live", false])
    expect(second).toEqual([null])
    expect(events).toHaveLength(1)
    expect(acknowledgements).toEqual([4, 5])
  } finally {
    stops.forEach((stop) => stop())

    if (descriptor) Object.defineProperty(globalThis, "window", descriptor)
    else delete globals.window
  }
})
