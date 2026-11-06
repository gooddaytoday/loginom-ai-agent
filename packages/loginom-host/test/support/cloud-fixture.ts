import { request } from "node:http"
import { environmentProxy } from "../../../desktop/test/loginom/environment-proxy"
import { knowledgeServer } from "../../../loginom-runtime/client/test/support/knowledge-server.mjs"

// Shared loopback-only website/Dock fixture for the compiled Node, Desktop and CLI gates.
async function cloudFixture() {
  const cleanup: (() => void | Promise<void>)[] = []
  const primary = await knowledgeServer({ after: (close) => cleanup.push(close) }, { apiKey: "TASK13-PRIMARY-CANARY" })
  const reserve = await knowledgeServer({ after: (close) => cleanup.push(close) }, { apiKey: "TASK13-RESERVE-CANARY" })
  const state = { approved: false, starts: 0, tokens: 0, exchanges: 0, revokes: 0 }
  const route = await environmentProxy((req, res) => {
    if (req.url?.startsWith("/primary/") || req.url?.startsWith("/reserve/")) {
      const endpoint = new URL(req.url.startsWith("/primary/") ? primary.endpoint : reserve.endpoint)
      const upstream = request(endpoint, { method: req.method, headers: req.headers }, (response) => {
        res.writeHead(response.statusCode!, response.headers)
        response.pipe(res)
      })
      upstream.on("error", () => { res.writeHead(502); res.end(); })
      req.pipe(upstream)
      return
    }
    res.setHeader("content-type", "application/json")
    if (req.url === "/api/auth/device/code") {
      state.starts++
      state.approved = false
      res.end(JSON.stringify({ device_code: "TASK13-DEVICE-CANARY", user_code: "TASK13-CODE",
        verification_uri_complete: `${site}/device`, expires_in: 600, interval: 0.2 }))
      return
    }
    if (req.url === "/api/auth/device/token") {
      state.tokens++
      if (!state.approved) { res.writeHead(400); res.end(JSON.stringify({ error: "authorization_pending" })); return }
      res.end(JSON.stringify({ access_token: "TASK13-BOOTSTRAP-CANARY", token_type: "Bearer", expires_in: 600 }))
      return
    }
    if (req.url === "/api/agent/connections") {
      state.exchanges++
      res.end(JSON.stringify({ installationKey: "TASK13-INSTALLATION-CANARY", user: { email: "fixture@example.test" },
        dock: { primary: { apiKey: "TASK13-PRIMARY-CANARY" }, reserve: { apiKey: "TASK13-RESERVE-CANARY" } } }))
      return
    }
    if (req.url === "/api/agent/connections/current" && req.method === "DELETE") {
      state.revokes++; res.writeHead(204); res.end(); return
    }
    res.writeHead(404); res.end("{}")
  }, "127.0.0.2")
  const site = `https://127.0.0.2:${route.port(route.target)}`
  const endpoints = { site, primary: `${site}/primary/mcp`, reserve: `${site}/reserve/mcp` }
  const control = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(req) {
    const path = new URL(req.url).pathname
    if (path === "/approve") state.approved = true
    return Response.json({ ...state, direct: route.directTargetRequests, proxied: route.proxyRequests.length,
      requests: [...route.targetRequests], tunnels: [...route.tunnels], primaryCalls: primary.calls.length, reserveCalls: reserve.calls.length })
  } })
  return {
    endpoints,
    cert: route.cert,
    proxy: `http://127.0.0.1:${route.port(route.proxy)}`,
    control: control.url.origin,
    async close() { await Promise.all(cleanup.map((close) => close())); await route.close(); control.stop(true) },
  }
}

if (import.meta.main) {
  if (!process.argv[2]) throw Error("Provide a fixture configuration output path")
  const fixture = await cloudFixture()
  await Bun.write(process.argv[2], JSON.stringify(fixture))
  console.log("Local cloud fixture ready")
  await new Promise<void>((resolve) => {
    for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => resolve())
  })
  await fixture.close()
}
