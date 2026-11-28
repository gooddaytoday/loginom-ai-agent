import { expect, test } from "bun:test"
import { connectionSettings } from "../src/connection-settings"
import { diagnostics } from "../src/diagnostics"

test("cancelling a diagnostics RPC cancels its saved Loginom check", async () => {
  const controller = new AbortController()
  const checking = Promise.withResolvers<AbortSignal | undefined>()
  const connection = connectionSettings(async (method, _input, _timeout, signal) => {
    if (method === "connection.status")
      return {
        revision: 3,
        generation: 2,
        url: "https://loginom.example/app/",
        username: "analyst",
        folder: "/analyst",
        hasPassword: true,
        state: "ready",
      }
    if (method !== "connection.settings.check") throw new Error("Unexpected Host request")

    checking.resolve(signal)
    if (!signal) throw new Error("Expected a cancellation signal")
    signal.throwIfAborted()
    return new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true })
    })
  })
  const rpc = await diagnostics(
    {
      transform: async () => ({ dispose: async () => {} }),
      list: async () => {
        throw new Error("No fixture model")
      },
    },
    connection,
  )
  const result = rpc.status(
    { check: true },
    {
      signal: controller.signal,
      error: () => {
        throw new Error("Unexpected RPC error")
      },
    },
  )
  const forwarded = await checking.promise
  controller.abort()
  expect(forwarded).toBe(controller.signal)
  expect(await result).toMatchObject({ loginom: "failed" })
})
