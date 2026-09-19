import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { cliCredentials } from "../src/connection/cli-credentials"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

if (process.platform !== "win32") throw Error("WINDOWS_ONLY_TEST")
const executable = process.env.LOGINOM_AI_AGENT_TEST_DESKTOP_EXECUTABLE
const resources = process.env.LOGINOM_AI_AGENT_TEST_RESOURCES
const credentialProfile = process.env.LOGINOM_AI_AGENT_TEST_CREDENTIAL_PROFILE
if (!executable || !resources || !credentialProfile) throw Error("INSTALLED_DESKTOP_INPUTS_REQUIRED")
const xiaomi = Boolean(process.env.XIAOMI_API_KEY)
const record = await Bun.file(join(credentialProfile, "loginom/connection/connection.json")).json()
const secret = await cliCredentials("win32").decode(record.secrets)
if (secret.password !== "") throw Error("TEST_PASSWORD_UNAVAILABLE")
const directory = await mkdtemp(join(tmpdir(), "loginom-installed-oauth-"))
const requests: Array<{ pathname: string; authorized: boolean }> = []
const protocol = new Server({ name: "windows-oauth-acceptance", version: "1.0.0" }, { capabilities: { tools: {} } })
protocol.setRequestHandler(ListToolsRequestSchema, () => Promise.resolve({ tools: [] }))
const transport = new WebStandardStreamableHTTPServerTransport({
  sessionIdGenerator: () => crypto.randomUUID(),
  enableJsonResponse: true,
})
await protocol.connect(transport)
const http = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const url = new URL(request.url)
    requests.push({ pathname: url.pathname, authorized: request.headers.get("authorization") === "Bearer acceptance-access" })
    if (url.pathname === "/mcp") {
      if (request.headers.get("authorization") === "Bearer acceptance-access") return transport.handleRequest(request)
      return new Response("Unauthorized", {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer resource_metadata="${url.origin}/.well-known/oauth-protected-resource/mcp", scope="mcp"`,
        },
      })
    }
    if (url.pathname === "/.well-known/oauth-protected-resource/mcp")
      return Response.json({ resource: `${url.origin}/mcp`, authorization_servers: [url.origin], scopes_supported: ["mcp"] })
    if (url.pathname === "/.well-known/oauth-authorization-server")
      return Response.json({
        issuer: url.origin,
        authorization_endpoint: `${url.origin}/authorize`,
        token_endpoint: `${url.origin}/token`,
        registration_endpoint: `${url.origin}/register`,
        scopes_supported: ["mcp"],
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code"],
        token_endpoint_auth_methods_supported: ["none"],
        code_challenge_methods_supported: ["S256"],
      })
    if (url.pathname === "/register") {
      const metadata = await request.json()
      if (!metadata || typeof metadata !== "object") return new Response("Invalid metadata", { status: 400 })
      return Response.json({ ...metadata, client_id: "windows-acceptance-client" }, { status: 201 })
    }
    if (url.pathname === "/authorize") {
      const redirect = new URL(url.searchParams.get("redirect_uri") ?? "")
      redirect.searchParams.set("code", "windows-acceptance-code")
      const state = url.searchParams.get("state")
      if (state) redirect.searchParams.set("state", state)
      return Response.redirect(redirect.href, 302)
    }
    if (url.pathname === "/token")
      return Response.json({ access_token: "acceptance-access", token_type: "Bearer", scope: "mcp" })
    return new Response("Not found", { status: 404 })
  },
})
console.log(`Installed OAuth evidence: ${directory}`)
try {
  const child = Bun.spawn([join(resources, "bin/node.exe"), join(import.meta.dir, "../../desktop/test/loginom/desktop-oauth.mjs")], {
    stdin: new Blob([
      JSON.stringify({
        executable,
        directory,
        connection: { apiKey: secret.apiKey, password: "", username: record.username, url: record.url },
        config: { mcp: { "windows-oauth": { type: "remote", url: new URL("/mcp", http.url.href).toString() } } },
        xiaomi,
      }),
    ]),
    stdout: "pipe",
    stderr: "pipe",
  })
  const output = new Response(child.stdout).text()
  const errors = new Response(child.stderr).text()
  const timer = setTimeout(() => child.kill(), 240_000)
  const code = await child.exited
  clearTimeout(timer)
  const stdout = await output
  const stderr = await errors
  const sensitiveValues = [secret.apiKey, process.env.XIAOMI_API_KEY].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  )
  if (sensitiveValues.some((value) => stdout.includes(value) || stderr.includes(value)))
    throw Error("SECRET_IN_OAUTH_OUTPUT")
  await Bun.write(join(directory, "stdout.txt"), stdout)
  await Bun.write(join(directory, "stderr.txt"), stderr)
  const proof = stdout
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return undefined
      }
    })
    .find((value) => value?.status === "PASS")
  if (code !== 0 || !proof) throw Error(`INSTALLED_OAUTH_DESKTOP_FAILED_${code}`)
  const result = {
    status: "PASS",
    desktop: true,
    dynamicRegistration: requests.some((request) => request.pathname === "/register"),
    tokenExchange: requests.some((request) => request.pathname === "/token"),
    authorizedMcp: requests.some((request) => request.pathname === "/mcp" && request.authorized),
    xiaomiTool: xiaomi ? proof.xiaomiTool === true : null,
  }
  if (!result.dynamicRegistration || !result.tokenExchange || !result.authorizedMcp || (xiaomi && !result.xiaomiTool))
    throw Error("INSTALLED_OAUTH_INCOMPLETE")
  await Bun.write(join(directory, "summary.json"), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
} finally {
  await http.stop(true)
  await protocol.close()
}
