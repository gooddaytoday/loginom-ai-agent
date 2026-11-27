import { expect, test } from "bun:test"
import { beside, sendPlacement } from "./browser-window"

const main = { x: 0, y: 0, width: 1600, height: 860 }
const right = { x: 1600, y: -120, width: 1200, height: 920 }
const below = { x: 0, y: 900, width: 1600, height: 860 }
const left = { x: -1280, y: 0, width: 1280, height: 800 }

test.each([
  [
    "free space on the same display",
    { x: 200, y: 0, width: 750, height: 700 },
    main,
    [right],
    { x: 950, y: 0, width: 650, height: 860 },
  ],
  [
    "adjacent right display with a negative Y origin",
    main,
    main,
    [below, left, right],
    { x: 1600, y: -120, width: 540, height: 920 },
  ],
  [
    "application straddles two displays",
    { x: 0, y: 0, width: 1760, height: 860 },
    main,
    [right],
    { x: 1760, y: -120, width: 540, height: 920 },
  ],
  ["maximized, no display to its right", main, main, [below, left], { x: 880, y: 0, width: 720, height: 860 }],
  ["display on the left of the primary", left, left, [], { x: -576, y: 0, width: 576, height: 800 }],
] as const)("positions Loginom: %s", (_case, app, matching, others, expected) => {
  expect(beside(app, matching, others)).toEqual(expected)
})

test("Desktop sends bounds and the chat ID to the authenticated sidecar RPC", async () => {
  const seen = Promise.withResolvers<unknown>()
  using server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      seen.resolve({
        path: new URL(request.url).pathname,
        method: request.method,
        body: await request.json(),
        authenticated: request.headers.has("authorization"),
      })
      return Response.json({ output: true })
    },
  })
  await sendPlacement({ url: server.url.origin, password: "fixture" }, "ses_chat", right)
  expect(await seen.promise).toEqual({
    path: "/api/rpc/loginom.window/place",
    method: "POST",
    authenticated: true,
    body: { input: { sessionID: "ses_chat", bounds: right } },
  })
})
