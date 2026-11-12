// Runs with the installed Node, using only its standard library. The scripted
// provider chooses a tool; the installed sidecar and Host execute it unchanged.
import assert from "node:assert/strict"
import { createServer } from "node:http"
import { readFile, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

async function main([port, resources, profile, output, seconds]) {
  const checks = []
  const result = { checks }
  const deadline = Date.now() + Number(seconds) * 1000
  const remaining = () => Math.max(1, deadline - Date.now())
  const timeout = setTimeout(() => { console.error("SIDECAR_SMOKE_TIMEOUT"); process.exit(1) }, remaining())
  let socket
  let session
  let call
  let sequence = 0
  const pending = new Map()
  let paused
  const requests = []
  let providerError
  const helpManifest = JSON.parse(await readFile(join(resources, "help/help-manifest.json"), "utf8"))
  const page = helpManifest.files.find(file => /^data\/.+\.md$/.test(file.path))
  assert.ok(page, "Bundled Help must contain a page")
  const uri = "viking://resources/loginom-dock/sources/loginom-help/" + page.path
  const source = (await readFile(join(resources, "help/loginom-help", page.path), "utf8")).trim()
  assert.ok(source, "Bundled Help page must not be empty")
  const provider = createServer(async (request, response) => {
    try {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks).toString())
      requests.push({ tools: body.tools?.map(tool => tool.function.name) ?? [] })
      assert.ok(requests.length <= 8, "Unexpected provider loop")
      const done = body.messages.some(message => message.role === "tool" && message.tool_call_id === "installed-help")
      const action = body.tools?.length && !done
      if (action) assert.ok(body.tools.some(tool => tool.function.name === "loginom_read"), "loginom_read must be advertised")
      const delta = action ? { tool_calls: [{ index: 0, id: "installed-help", type: "function",
        function: { name: "loginom_read", arguments: JSON.stringify({ uris: uri }) } }] }
        : { content: "Installed local Help smoke complete." }
      response.writeHead(200, { "content-type": "text/event-stream" })
      response.end([
        { choices: [{ index: 0, delta, finish_reason: null }] },
        { choices: [{ index: 0, delta: {}, finish_reason: action ? "tool_calls" : "stop" }] },
      ].map(chunk => `data: ${JSON.stringify({ id: "installed-smoke", object: "chat.completion.chunk", ...chunk })}\n\n`).join("") + "data: [DONE]\n\n")
    } catch (error) {
      providerError = error.message
      response.writeHead(500).end()
    }
  })

  async function inspect(method, params = {}) {
    const id = ++sequence
    const response = new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
    socket.send(JSON.stringify({ id, method, params }))
    return response
  }
  async function evaluate(expression, awaitPromise = true) {
    const reply = await inspect("Runtime.evaluate", { expression, awaitPromise, returnByValue: true, includeCommandLineAPI: true })
    if (reply.exceptionDetails) throw Error(reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text)
    return reply.result?.value
  }
  async function check(id, operation) {
    try {
      const detail = await operation()
      checks.push({ id, status: "PASS", detail })
    } catch (error) {
      checks.push({ id, status: "FAIL", detail: error.message })
    }
  }

  try {
    await new Promise(resolve => provider.listen(0, "127.0.0.1", resolve))
    const config = {
      model: "installed-smoke/test-model", enabled_providers: ["installed-smoke"],
      formatter: false, lsp: false, permission: { "*": "allow" },
      provider: { "installed-smoke": {
        name: "Installed smoke", id: "installed-smoke", env: [], npm: "@ai-sdk/openai-compatible",
        models: { "test-model": { id: "test-model", name: "Installed smoke", attachment: false,
          reasoning: false, temperature: false, tool_call: true, release_date: "2025-01-01",
          limit: { context: 100000, output: 10000 }, cost: { input: 0, output: 0 }, options: {} } },
        options: { apiKey: "local-smoke", baseURL: `http://127.0.0.1:${provider.address().port}/v1` },
      } },
    }
    let targets
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(Math.min(1000, remaining())) })
        targets = await response.json()
        if (targets.length === 1) break
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    assert.equal(targets?.length, 1, "Expected one main-process inspector target")
    socket = new WebSocket(targets[0].webSocketDebuggerUrl)
    socket.addEventListener("message", event => {
      const reply = JSON.parse(event.data)
      if (reply.method === "Debugger.paused") paused?.(reply.params)
      const request = pending.get(reply.id)
      if (!request) return
      pending.delete(reply.id)
      if (reply.error) request.reject(Error(reply.error.message))
      else request.resolve(reply.result)
    })
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true })
      socket.addEventListener("error", reject, { once: true })
    })
    console.log("INFO installed main inspector connected")
    // --inspect-brk first waits before Node's own loaders are initialized. Enable
    // the debugger and let those loaders finish before evaluating the app fixture.
    await inspect("Debugger.enable")
    console.log("INFO installed main debugger enabled")
    const entry = new Promise(resolve => { paused = resolve })
    await inspect("Runtime.runIfWaitingForDebugger")
    console.log("INFO installed main released from debugger startup wait")
    await entry
    console.log("INFO installed main paused at entry")
    // Seed an isolated, encrypted, passwordless connection before production
    // startup restores it. Restoring only starts local Help, never a browser.
    // No product exports, tool implementations or IPC handlers are replaced.
    await evaluate(`(() => {
      const { app, safeStorage } = require('electron');
      const fs = require('node:fs');
      const path = require('node:path');
      process.env.LOGINOM_AI_AGENT_CONFIG_CONTENT = ${JSON.stringify(JSON.stringify(config))};
      process.env.LOGINOM_AI_AGENT_DISABLE_PROJECT_CONFIG = '1';
      app.whenReady().then(() => {
        if (path.resolve(app.getPath('userData')) !== ${JSON.stringify(resolve(profile, "desktop"))}) throw Error('SMOKE_PROFILE_MISMATCH');
        const directory = path.join(app.getPath('userData'), 'loginom', 'connection');
        fs.mkdirSync(path.join(directory, 'generations'), { recursive: true });
        const record = JSON.stringify({ generation: 1, revision: 1, url: 'http://127.0.0.1:1/app/', username: 'installed-smoke',
          secrets: { encrypted: safeStorage.encryptString(JSON.stringify({ apiKey: '', password: '' })).toString('base64') } });
        fs.writeFileSync(path.join(directory, 'v040-migration.json'), JSON.stringify({ state: 'complete' }));
        fs.writeFileSync(path.join(directory, 'connection.json'), record);
        fs.writeFileSync(path.join(directory, 'generations', '1.json'), record);
      });
      return true;
    })()`, false)
    await inspect("Debugger.resume")
    await inspect("Debugger.disable")
    console.log("INFO installed main resumed with offline profile fixture")
    let backend
    while (Date.now() < deadline) {
      backend = await evaluate(`(async () => {
        const window = require('electron').BrowserWindow.getAllWindows()[0];
        if (!window) return null;
        return window.webContents.executeJavaScript('window.api ? window.api.awaitInitialization() : null').catch(() => null);
      })()`)
      if (backend?.url) break
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    assert.ok(backend?.url, "Installed sidecar did not initialize")
    assert.match(backend.url, /^http:\/\/127\.0\.0\.1:\d+$/)
    const workspace = join(profile, "workspace")
    await evaluate(`require('node:fs').mkdirSync(${JSON.stringify(workspace)}, { recursive: true }); true`)
    call = async (path, method = "GET", body) => {
      const response = await fetch(`${backend.url}${path}?directory=${encodeURIComponent(workspace)}`, {
        method, headers: { "content-type": "application/json",
          authorization: `Basic ${Buffer.from(`${backend.username}:${backend.password}`).toString("base64")}` },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(remaining()),
      })
      assert.ok(response.ok, `${method} ${path}: HTTP ${response.status}`)
      return response.json()
    }
    await check("sidecar-bundled-skills", async () => {
      const manifest = JSON.parse(await readFile(join(resources, "resource-manifest.json"), "utf8"))
      const catalog = await call("/skill")
      result.skills = { catalog }
      Object.assign(result.skills, checkBundledSkills(manifest, catalog))
      return `count=${result.skills.actual.length}; ${result.skills.actual.join(", ")}`
    })
    await check("sidecar-local-help", async () => {
      while (Date.now() < deadline) {
        result.connection = await evaluate(`require('electron').BrowserWindow.getAllWindows()[0].webContents.executeJavaScript('window.api.loginom.status()')`)
        assert.equal(result.connection.generation, 1, "Encrypted offline fixture was not restored")
        assert.ok(!result.connection.failure && result.connection.state !== "recoverable-error", "Local Help startup failed")
        if (result.connection.state === "ready") break
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      assert.equal(result.connection?.state, "ready", "Local Help did not become ready")
      const agents = await call("/agent")
      const agent = agents.find(agent => agent.mode === "primary" && !agent.hidden)
      assert.ok(agent, "Sidecar must expose a primary agent")
      session = await call("/session", "POST", { title: "Installed local Help smoke" })
      await call(`/session/${session.id}/message`, "POST", {
        agent: agent.name, model: { providerID: "installed-smoke", modelID: "test-model" },
        parts: [{ type: "text", text: "Read one page of bundled local Loginom Help." }],
      })
      const messages = await call(`/session/${session.id}/message`)
      result.help = { uri, messages, providerRequests: requests, providerError }
      assert.ok(!providerError, providerError)
      const tool = checkHelpResult(messages, uri, source)
      return `loginom_read; ${uri}; bytes=${Buffer.byteLength(tool.state.output)}`
    })
  } catch (error) {
    checks.push({ id: "sidecar-probe", status: "FAIL", detail: error.stack })
  } finally {
    result.startupFailures = await readFile(join(profile, "desktop/loginom/knowledge/1/startup-failures.jsonl"), "utf8").catch(() => undefined)
    if (result.startupFailures) console.error("KNOWLEDGE_STARTUP " + result.startupFailures)
    if (session && call) await call(`/session/${session.id}`, "DELETE").catch(error => checks.push({ id: "sidecar-session-cleanup", status: "FAIL", detail: error.message }))
    socket?.close()
    provider.closeAllConnections()
    await new Promise(resolve => provider.close(resolve))
    clearTimeout(timeout)
    await writeFile(output, JSON.stringify(result, null, 2) + "\n")
  }
  for (const check of checks) console.log(`${check.status} ${check.id}: ${check.detail}`)
  if (checks.some(check => check.status === "FAIL")) process.exitCode = 1
}

export function checkBundledSkills(manifest, catalog) {
  const expected = manifest.files.flatMap(file => /^skills\/([^/]+)\/SKILL\.md$/.exec(file.path)?.slice(1) ?? []).sort()
  assert.ok(expected.includes("loginom-automation"), "Manifest must include loginom-automation")
  assert.equal(new Set(expected).size, expected.length, "Duplicate manifest skill")
  const bundled = catalog.filter(skill => skill.source === "bundled")
  const actual = bundled.map(skill => skill.name).sort()
  assert.deepEqual(actual, expected, "Sidecar bundled skill names/count differ from installed manifest")
  assert.ok(bundled.every(skill => /^[a-f0-9]{64}$/.test(skill.digest)), "Bundled provenance is missing")
  return { expected, actual }
}

export function checkHelpResult(messages, uri, source) {
  const tool = messages.flatMap(message => message.parts).find(part => part.type === "tool" && part.tool === "loginom_read")
  assert.ok(tool, "Installed sidecar did not execute loginom_read")
  assert.equal(tool.state.status, "completed", "Help tool failed")
  assert.ok(tool.state.output?.trim(), "Help tool returned empty output")
  assert.ok(tool.state.output.includes(uri), "Help result must identify the requested page")
  assert.ok(source.trim(), "Help source must not be empty")
  assert.ok(tool.state.output.includes(source.slice(0, 200)), "Help result must contain real page content")
  return tool
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2))
