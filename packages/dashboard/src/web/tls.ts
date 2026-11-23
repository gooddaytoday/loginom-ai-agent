import { connect, createServer } from "node:net"

export function tlsForwarder({ host, port }: { host: string; port: number }) {
  return createServer(client => {
    const upstream = connect({ host, port })
    const close = () => {
      client.destroy()
      upstream.destroy()
    }
    client.setTimeout(30_000, close)
    upstream.setTimeout(30_000, close)
    client.on("error", close).on("close", close)
    upstream.on("error", close).on("close", close)
    client.pipe(upstream).pipe(client)
  })
}
