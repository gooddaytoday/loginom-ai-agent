import { expect, test } from "bun:test"
import { createConnection, createServer } from "node:net"
import { networkFault } from "../script/network-fault"

test("network fault severs established traffic and rejects reconnects without stopping upstream", async () => {
  const server = createServer((socket) => socket.pipe(socket))
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw Error("TEST_LISTENER_INVALID")
  const fault = await networkFault(`http://127.0.0.1:${address.port}/app/`)
  const local = new URL(fault.url)
  const client = createConnection({ host: local.hostname, port: Number(local.port) })
  try {
    const closed = new Promise<void>((resolve) => client.once("close", () => resolve()))
    const reply = new Promise<string>((resolve) => client.once("data", (data) => resolve(data.toString())))
    client.write("dispatched")
    expect(await reply).toBe("dispatched")
    fault.disconnect()
    expect(fault.state.severedSockets).toBe(2)
    await closed
    expect(fault.state.disconnected).toBe(true)
    const retry = createConnection({ host: local.hostname, port: Number(local.port) })
    retry.on("error", () => {})
    await new Promise<void>((resolve) => retry.once("close", () => resolve()))
    expect(fault.state.rejected).toBe(1)
    const direct = createConnection({ host: "127.0.0.1", port: address.port })
    const directReply = new Promise<string>((resolve) => direct.once("data", (data) => resolve(data.toString())))
    direct.write("unaffected")
    expect(await directReply).toBe("unaffected")
    direct.destroy()
  } finally {
    client.destroy()
    await fault.close()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}, 5_000)

test("network fault refuses a non-local listener address", async () => {
  await expect(networkFault("http://127.0.0.1/", "192.0.2.123")).rejects.toThrow("FAULT_LOCAL_ADDRESS_REQUIRED")
})
