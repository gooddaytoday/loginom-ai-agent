import { expect, test } from "bun:test"
import { createServer } from "node:http"
import { connect } from "node:net"
import { modelServerFetch } from "../src/model-server-network"

test("the service proxy tunnels to the checked address unless NO_PROXY matches", async () => {
  const requests: string[] = []
  const target = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => {
      requests.push(`${request.headers.get("host")}: ${request.headers.get("authorization")}`)
      return new Response("local fixture")
    },
  })
  const tunnels: string[] = []
  const sockets = new Set<ReturnType<typeof connect>>()
  const proxy = createServer().on("connect", (request, downstream) => {
    tunnels.push(`${request.url}: ${request.headers.authorization}`)
    if (request.url !== target.url.host) return downstream.destroy()
    const upstream = connect(Number(target.url.port), "127.0.0.1", () => {
      downstream.write("HTTP/1.1 200 Connection Established\r\n\r\n")
      downstream.pipe(upstream).pipe(downstream)
    })
    sockets.add(upstream)
    upstream.on("close", () => sockets.delete(upstream))
    upstream.on("error", () => downstream.destroy())
    downstream.on("close", () => upstream.destroy())
  })
  const { http_proxy, no_proxy } = process.env
  try {
    await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve))
    const listener = proxy.address()
    if (!listener || typeof listener === "string") throw new Error("Missing fixture proxy port")
    process.env.http_proxy = `http://127.0.0.1:${listener.port}`
    process.env.no_proxy = `127.0.0.1:${target.port === 1 ? 2 : 1}`
    const get = () =>
      modelServerFetch(target.url, {
        headers: { Authorization: "Bearer fixture" },
        signal: AbortSignal.timeout(2000),
      }).then((response) => response.text())
    expect(await get()).toBe("local fixture")
    expect(tunnels).toEqual([`${target.url.host}: undefined`])
    process.env.no_proxy = target.url.host
    expect(await get()).toBe("local fixture")
    expect(tunnels).toHaveLength(1)
    expect(requests).toEqual(Array.from({ length: 2 }, () => `${target.url.host}: Bearer fixture`))
    await expect(modelServerFetch("http://169.254.169.254/", { signal: AbortSignal.timeout(2000) })).rejects.toThrow(
      "Model server address is not allowed",
    )
    expect(tunnels).toHaveLength(1)
  } finally {
    if (http_proxy === undefined) delete process.env.http_proxy
    else process.env.http_proxy = http_proxy
    if (no_proxy === undefined) delete process.env.no_proxy
    else process.env.no_proxy = no_proxy
    for (const socket of sockets) socket.destroy()
    proxy.close()
    await target.stop(true)
  }
})
