import { createRequire } from "node:module"
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { tmpdir } from "node:os"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { verifyResources } from "./resources.mjs"
import { validateStartInput } from "./start-input.mjs"
import { loginBrowser, checkConnection, loginomAddress } from "./connection-check.mjs"
import { createSession } from "../client/lib/session.mjs"
import { admitStartupArtifacts } from "../client/lib/artifacts.mjs"
import { createBridge } from "../client/lib/bridge.mjs"

const require = createRequire(new URL("../client/package.json", import.meta.url))
process.umask(0o077)
const state = {
  starting: false,
  closing: undefined,
  bridge: undefined,
  client: undefined,
  controller: undefined,
  session: undefined,
  browser: undefined,
  browserProfile: undefined,
  browserServer: undefined,
  inputs: new Map(),
}
const requests = new Set()
const send = (message, disconnect = false) => {
  if (process.connected)
    process.send(message, () => {
      if (disconnect && process.connected) process.disconnect()
    })
}
function closeRejection(value) {
  return value instanceof Error ? {kind:"Error",name:value.name,message:value.message,
    ...("cause" in value?{cause:closeRejection(value.cause)}:{})} :
    {kind:"value",value:value===undefined?null:value,is_undefined:value===undefined}
}
async function recordClose(stage, detail) {
  state.shutdown ??= {stages:[]}
  state.shutdown.stages.push({stage,...detail})
  if(state.session) await writeFile(join(state.session.directory,"managed-shutdown.json"),
    JSON.stringify(state.shutdown,null,2)+"\n",{mode:0o600})
}
function close() {
  if (state.closing) return state.closing
  state.closing = (async () => {
    await recordClose("drain",{status:"started"})
    let primary
    try {
    await Promise.allSettled([...requests])
    if (state.authenticatedReadiness && !state.browser) throw Error("LOGINOM_RUNTIME_CLEANUP_FAILED")
    if (state.browser && !state.bridge) throw Error("LOGINOM_RUNTIME_CLEANUP_FAILED")
    if (state.bridge) {
      await recordClose("bridge",{status:"started"})
      const receipt = await state.bridge.close()
      if (receipt?.browser_transport_closed !== true || receipt.cleanup_complete!==true
          || (state.authenticatedReadiness && receipt.native_logout_confirmed !== true))
        primary={stage:"bridge",error:new Error("LOGINOM_RUNTIME_CLEANUP_FAILED", {cause:receipt})}
      await recordClose("bridge",{status:"returned",receipt})
      if (primary) throw primary.error
    }
    state.controller?.abort()
    const results = []
    for (const [name,handle] of [["client",state.client],["browser_server",state.browserServer],["browser_context",state.browser]]) {
      const result=await Promise.allSettled([Promise.resolve().then(() => handle?.close())])
      results.push(...result)
      if(result[0].status==="rejected" && !primary) primary={stage:name,error:new Error("LOGINOM_RUNTIME_CLEANUP_FAILED",{cause:result[0].reason})}
      await recordClose(name,{status:result[0].status,
        ...(result[0].status==="rejected"?{rejection:closeRejection(result[0].reason)}:{})})
    }
    if (state.browserProfile)
      results.push(...(await Promise.allSettled([rm(state.browserProfile, { recursive: true, force: true })])))
    const refused=results.find(result=>result.status==="rejected")
    if (refused) throw primary?.error??new Error("LOGINOM_RUNTIME_CLEANUP_FAILED",{cause:refused.reason})
    await recordClose("outer_acknowledgement",{status:"allowed"})
    } catch(error) {
      const rejection=primary?.error??error
      state.closeFailure=rejection
      if(primary) state.shutdown.primaryFailure={stage:primary.stage,rejection:closeRejection(rejection)}
      if(primary && error!==rejection) state.shutdown.persistenceFailure=closeRejection(error)
      try { await recordClose("refused",{rejection:closeRejection(rejection)}) }
      catch(persistenceFailure) { state.shutdown.persistenceFailure=closeRejection(persistenceFailure) }
      throw rejection
    }
  })()
  state.closing.catch(error => { state.closeFailure = error; state.closing = undefined })
  return state.closing
}
const stop = () => {
  void close().then(
    () => process.exit(0),
    error => { state.closeFailure = error },
  )
}
process.on("disconnect", stop)
process.on("SIGTERM", stop)
process.on("message", (message) => {
  const request = handle(message)
  requests.add(request)
  void request
    .finally(() => requests.delete(request))
    .catch(() => {
      process.exitCode = 1
    })
})
async function handle(message) {
  if (!message || typeof message !== "object" || typeof message.id !== "string") return
  try {
    if (state.closing && message.operation !== "close") throw Error("LOGINOM_RUNTIME_CLOSING")
    if (message.operation === "start") {
      if (state.starting) throw Error("LOGINOM_ALREADY_STARTED")
      state.starting = true
      const input = message.input
      const { acceptanceCleanupPackage, acceptanceCapture } = validateStartInput(input)
      const resources = await verifyResources(input.resources)
      let captureHarness
      if (acceptanceCapture) {
        // Fixed reviewed receiving resource, never a request-selected module.
        const path = "runtime/src/acceptance/calculator-grouped-before-done-v1.mjs"
        if (!resources.manifest.files.some(file => file.path === path && !file.link && !file.directory))
          throw Error("LOGINOM_CAPTURE_UNAVAILABLE")
        const module = await import(pathToFileURL(join(input.resources, path)).href)
        if (typeof module.captureCalculator !== "function") throw Error("LOGINOM_CAPTURE_UNAVAILABLE")
        captureHarness = module.captureCalculator
      }
      // A new process must never overwrite the receipts or browser state of a crashed attempt.
      const directory = join(
        input.stateDir,
        "generations",
        String(input.generation),
        "chats",
        input.chat,
        "attempts",
        randomUUID(),
      )
      await mkdir(directory, { recursive: true, mode: 0o700 })
      // Chromium creates nested files below user-data-dir. The normal Desktop
      // state path is already close to MAX_PATH on Windows, so a valid profile
      // can otherwise fail before Loginom authentication even starts.
      const browserProfile =
        process.platform === "win32" ? await mkdtemp(join(tmpdir(), "lb")) : join(directory, "browser-profile")
      state.browserProfile = process.platform === "win32" ? browserProfile : undefined
      const login = {
        browserPath: resources.browserPath,
        profile: browserProfile,
        candidate: input.connection,
        headless: input.headless === true,
      }
      if (input.validation === true) {
        await checkConnection({ ...login, endpoint: input.endpoint })
        send({ id: message.id, result: { checked: true, protocol: 1, generation: input.generation } })
        return
      }
      const authenticated = await loginBrowser({ ...login, keepOpen: true })
      state.browser = authenticated.context
      const config = {
        endpoint: input.endpoint,
        apiKey: input.connection.apiKey,
        // Preparation must bind to the same canonical path used by private login.
        loginomUrl: loginomAddress(input.connection.url),
        stateDir: input.stateDir,
        agent: "loginom-ai-agent",
        adapterRevision: "1",
        mode: "executor-replay",
        resultProfile: "user-v1",
        actionManifestUri: input.actionManifestUri,
        actionManifestSha256: input.actionManifestSha256,
        replayBootstrap: false,
        replayLoginUser: null,
        // Acceptance-only shutdown cleanup; the bridge binds it to the observed
        // prepared account, so no replay login account is needed here.
        acceptanceCleanupPackage,
        storageDirectories: {
          inputs: `/${input.connection.username}`,
          exports: `/${input.connection.username}`,
          packages: `/${input.connection.username}`,
        },
        inputUploadDirectory: `/${input.connection.username}`,
      }
      const session = await createSession(config, {
        headless: input.headless === true,
        managed: { directory, browserPath: resources.browserPath, browserRoot: resources.browserRoot },
      })
      state.session = session
      // Bind only the document owned by this successful private login. This is
      // not workspace preparation and confers no package-close authority.
      const documentId=randomUUID()
      state.authenticatedReadiness=await authenticated.context.pages()[0].evaluate(o=>{
        const app=globalThis.bg?.app,m=app?.Application?.FInstance?.FMainForm?.FMapTree;
        if(location.origin!==o.origin||app?.Version!=='7.4.2'||m?.FServerConnection?.UserName!==o.account
            ||m.FServerConnection.Connected!==true||globalThis.__loginomDockReadinessV1)
          throw Error('LOGINOM_READINESS_IDENTITY_REQUIRED');
        globalThis.__loginomDockReadinessV1={document,documentId:o.documentId,sessionId:o.sessionId,
          account:o.account,loginomBuild:app.Version};
        return {documentId:o.documentId,account:o.account,loginomBuild:app.Version};
      },{documentId,sessionId:session.metadata.sessionId,account:input.connection.username,
        origin:new URL(config.loginomUrl).origin})
      const { Client } = require("@modelcontextprotocol/sdk/client/index.js")
      const { InMemoryTransport } = require("@modelcontextprotocol/sdk/inMemory.js")
      const { createConnection } = require("@playwright/mcp")
      state.browserServer = await createConnection(
        JSON.parse(await readFile(session.browserConfig, "utf8")),
        async () => authenticated.context,
      )
      const [browserClientTransport, browserServerTransport] = InMemoryTransport.createLinkedPair()
      await state.browserServer.connect(browserServerTransport)
      state.bridge = await createBridge(config, session, { browserTransport: browserClientTransport,
        authenticatedReadiness:state.authenticatedReadiness,
        acceptanceCapture: acceptanceCapture ? { binding: Object.freeze({...acceptanceCapture, session:session.metadata.sessionId}),
          harness: captureHarness } : undefined })
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
      state.client = new Client({ name: "loginom-ai-agent-host", version: "0.1.0" })
      await state.bridge.server.connect(serverTransport)
      await state.client.connect(clientTransport)
      send({
        id: message.id,
        result: {
          ready: true,
          protocol: 1,
          generation: input.generation,
          chat: input.chat,
          manifestHash: resources.manifestHash,
          browserHash: resources.browserHash,
          clientRevision: session.metadata.clientRevision,
        },
      })
      return
    }
    if (message.operation === "close") {
      await close()
      send({ id: message.id, result: { closed: true } }, true)
      return
    }
    if (state.closing) throw Error("LOGINOM_RUNTIME_CLOSING")
    if (!state.client) throw Error("LOGINOM_NOT_READY")
    if (message.operation === "acceptance.capture") {
      if (message.input !== undefined || state.controller || state.closeFailure !== undefined)
        throw Error("LOGINOM_REQUEST_INVALID")
      try {
        const result = await state.bridge.captureAcceptance()
        send({id:message.id,result})
      } catch (rejected) {
        send({id:message.id,result:{cleanupComplete:false,refused:true,
          rejectedIsUndefined:rejected === undefined,
          rejected:rejected instanceof Error ? {name:rejected.name,message:rejected.message} : rejected}})
      }
      return
    }
    if (message.operation === "admit") {
      if (typeof message.input.userMessage !== "string" || !message.input.userMessage)
        throw Error("LOGINOM_INPUT_INVALID")
      const previous = state.inputs.get(message.input.userMessage)
      if (previous) {
        send({ id: message.id, result: previous })
        return
      }
      const result = await admitStartupArtifacts(state.session.artifactStore, message.input.files)
      state.inputs.set(message.input.userMessage, result)
      send({ id: message.id, result })
      return
    }
    if (message.operation === "list") {
      send({ id: message.id, result: await state.client.listTools() })
      return
    }
    if (message.operation === "interrupt") {
      await recordClose("interrupt",{status:"received"})
      state.controller?.abort()
      send({ id: message.id, result: { interrupted: true } })
      return
    }
    if (message.operation !== "call" || state.controller) throw Error("LOGINOM_REQUEST_INVALID")
    const controller = new AbortController()
    state.controller = controller
    try {
      // dock_node_wait may legitimately wait 60 seconds. Leave room for its receipt
      // before the supervisor's 120-second deadline, instead of the SDK's 60-second default.
      const result = await state.client.callTool(message.input, undefined, {
        signal: controller.signal,
        timeout: 105_000,
      })
      send({ id: message.id, result: {
        result, recoveryPending: state.bridge.hasUnsettledWork(), activeWork: state.bridge.hasActiveWork(),
      } })
    } finally {
      state.controller = undefined
    }
  } catch (error) {
    const code = /^LOGINOM_[A-Z_]+$/.test(error?.message ?? "") ? error.message : "LOGINOM_RUNTIME_FAILED"
    send({ id: message.id, error: code })
    if (message.operation === "start") {
      // Clean up immediately, but keep IPC until the owner requests an acknowledged close.
      // close() retains a rejection so that the later close request reports cleanup failure.
      setImmediate(() => {
        void close().catch(() => undefined)
      })
    }
  }
}
