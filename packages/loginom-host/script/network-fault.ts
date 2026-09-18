import { networkInterfaces } from "node:os"
import { createConnection, createServer, Socket } from "node:net"

// Manual acceptance only: an isolated HTTP origin whose established connections
// can be severed without changing machine-wide routes or proxy settings.
export async function networkFault(address: string, bindAddress = "127.0.0.1") {
  if (
    !Object.values(networkInterfaces())
      .flat()
      .some((value) => value?.family === "IPv4" && value.address === bindAddress)
  )
    throw Error("FAULT_LOCAL_ADDRESS_REQUIRED")
  const target = new URL(address)
  if (target.protocol !== "http:" || target.username || target.password) throw Error("FAULT_HTTP_REQUIRED")
  const sockets = new Set<Socket>()
  const state = { disconnected: false, accepted: 0, rejected: 0, severedSockets: 0 }
  const server = createServer((client) => {
    if (state.disconnected || client.remoteAddress !== bindAddress) {
      state.rejected++
      client.destroy()
      return
    }
    state.accepted++
    const upstream = createConnection({ host: target.hostname, port: Number(target.port || 80) })
    for (const socket of [client, upstream]) {
      sockets.add(socket)
      socket.on("close", () => sockets.delete(socket))
      socket.on("error", () => {
        client.destroy()
        upstream.destroy()
      })
    }
    client.on("close", () => upstream.destroy())
    upstream.on("close", () => client.destroy())
    client.pipe(upstream).pipe(client)
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, bindAddress, resolve)
  })
  const local = server.address()
  if (!local || typeof local === "string") throw Error("FAULT_LISTENER_INVALID")
  const url = new URL(target)
  url.hostname = bindAddress
  url.port = String(local.port)
  return {
    url: url.href,
    state,
    disconnect() {
      state.severedSockets += sockets.size
      state.disconnected = true
      sockets.forEach((socket) => socket.destroy())
    },
    async close() {
      state.disconnected = true
      sockets.forEach((socket) => socket.destroy())
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    },
  }
}
