import { expect, test } from "bun:test"
import { HttpsProxyAgent } from "https-proxy-agent"
import { websocketTransport } from "../../src/util/ws-transport"

test("node websocket transport uses an HTTP proxy agent and the shared NO_PROXY dialect", () => {
  const previous = snapshot(["HTTPS_PROXY", "https_proxy", "NO_PROXY", "no_proxy", "HTTP_PROXY", "http_proxy"])
  process.env.HTTPS_PROXY = "http://127.0.0.1:8080"
  process.env.https_proxy = "http://127.0.0.1:8080"
  process.env.NO_PROXY = "example.test,.example.test"
  process.env.no_proxy = "example.test,.example.test"
  delete process.env.HTTP_PROXY
  delete process.env.http_proxy
  try {
    const proxied = websocketTransport("wss://api.openai.com/v1/responses", "node")
    expect(proxied.agent).toBeInstanceOf(HttpsProxyAgent)
    expect("proxy" in proxied).toBe(false)
    expect(websocketTransport("wss://example.test/socket", "node").agent).toBeUndefined()
    expect(websocketTransport("wss://a.example.test/socket", "node").agent).toBeUndefined()
    expect(websocketTransport("wss://notexample.test/socket", "node").agent).toBeInstanceOf(HttpsProxyAgent)
    const bun = websocketTransport("wss://api.openai.com/v1/responses", "bun")
    expect(bun.proxy).toBe("http://127.0.0.1:8080")
    expect(bun.agent).toBeUndefined()
  } finally {
    restore(previous)
  }
})

function snapshot(keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]))
}

function restore(previous: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}
