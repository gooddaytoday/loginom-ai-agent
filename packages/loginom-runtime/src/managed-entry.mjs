import {retainFPManagedStartup} from "./fp-managed-startup.mjs"
import {decodePreReadyRejection} from "./qualified-pre-ready.mjs"
import { createRequire } from "node:module"
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { tmpdir } from "node:os"
import { mkdir, mkdtemp, readFile, rm, writeFile, open, lstat } from "node:fs/promises"
import { open as evidenceOpen, writeFile as evidenceWrite, fsync as evidenceSync, close as evidenceClose, rename as evidenceRename, constants } from "node:fs"
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
const preReadyRequests = new Map()
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
async function closeEvidenceFile(file) {
  if (file.closeComplete) return
  if (file.io?.pending) throw Error("LOGINOM_MANAGED_WRITER_IO_UNKNOWN")
  if (file.closeStarted) throw file.closeFailure ? file.closeFailure.value : Error("LOGINOM_MANAGED_WRITER_CLOSE_UNKNOWN")
  file.closeStarted=true
  let projection
  const completion=new Promise((resolve,reject)=>{
    try {projection=evidenceClose(file.fd,error=>{
      if(error===null||error===undefined){file.closeComplete=true;resolve()}
      else {file.closeFailure={value:error};reject(error)}
    })}catch(value){file.closeFailure ??= {value};reject(value)}
  })
  // A returned thenable may report a failure, but fulfillment never replaces
  // the original kernel callback (the standard Node API returns void).
  await Promise.all([completion,projection])
}
async function recordClose(stage, detail) {
  state.shutdown ??= {stages:[]}
  if (Object.hasOwn(state,"startupFailure")) state.shutdown.startupFailure ??= closeRejection(state.startupFailure)
  state.shutdown.stages.push({stage,...detail})
  const evidenceOwner=state.session??state.startupOwner
  const directory=state.session?.directory??state.startupOwner?.directory
  // A retained binding remains authoritative even when the current owner or
  // directory disappears. That refusal must precede the no-start shortcut.
  const retainedBinding=state.evidenceOwnerBinding
  if(retainedBinding&&(retainedBinding.owner!==evidenceOwner||retainedBinding.directory!==directory))
    throw Error("LOGINOM_MANAGED_OWNER_DIRECTORY_CHANGED")
  if (!directory) {
    if(evidenceOwner||state.browser||state.browserProfile||state.browserServer||state.client||state.bridge||state.bridgeCleanup||state.evidenceWriters?.size||state.evidencePublication)
      throw Error("LOGINOM_MANAGED_OWNER_DIRECTORY_CHANGED")
    return // No-start has acquired no owner, binding or native resources.
  }
  state.evidenceOwnerBinding ??= Object.freeze({owner:evidenceOwner,directory})
  if(state.evidencePublication?.pending)throw state.evidencePrimary?state.evidencePrimary.value:Error("LOGINOM_MANAGED_PUBLICATION_UNKNOWN")
  const parent=await lstat(directory)
  if(!parent.isDirectory()||parent.isSymbolicLink())throw Error("LOGINOM_MANAGED_DIRECTORY_REFUSED")
  const path=join(directory,"managed-shutdown.json")
  const existing=await lstat(path).catch(error=>{if(error.code!=="ENOENT")throw error;return null})
  if(existing&&(!existing.isFile()||existing.isSymbolicLink()||existing.nlink!==1))throw Error("LOGINOM_MANAGED_TARGET_REFUSED")
  const guardPublication=async()=>{
    if((state.session?.directory??state.startupOwner?.directory)!==directory)throw Error("LOGINOM_MANAGED_OWNER_DIRECTORY_CHANGED")
    const current=await lstat(directory)
    if(!current.isDirectory()||current.isSymbolicLink()||current.dev!==parent.dev||current.ino!==parent.ino)throw Error("LOGINOM_MANAGED_DIRECTORY_CHANGED")
    const target=await lstat(path).catch(error=>{if(error.code!=="ENOENT")throw error;return null})
    if(existing? !target||target.dev!==existing.dev||target.ino!==existing.ino||!target.isFile()||target.isSymbolicLink()||target.nlink!==1 : target!==null)throw Error("LOGINOM_MANAGED_TARGET_CHANGED")
  }
  state.evidenceWriters ??= new Set()
  // Descriptor retirement (including FileHandle's fd=-1/close event) is not
  // kernel completion. Only the original fs.close success callback is proof.
  for (const file of state.evidenceWriters) {
    // An original open callback may arrive after its caller lost the reply.
    // Retire that same confirmed descriptor once, never open a replacement first.
    if (!file.closeStarted && file.openComplete && file.fd!==undefined) {
      try {await closeEvidenceFile(file)} catch(error) {file.closeFailure ??= {value:error}}
    }
    if (!file.closeComplete) {
      const error=file.closeFailure ? file.closeFailure.value : Error("LOGINOM_MANAGED_WRITER_CLOSE_UNKNOWN")
      state.shutdown.persistenceFailures ??= []
      state.shutdown.persistenceFailures.push({phase:"retained_file_close",rejection:closeRejection(error)})
      throw state.evidencePrimary ? state.evidencePrimary.value : error
    }
    state.evidenceWriters.delete(file)
  }
  const temporary=join(directory,`.managed-shutdown.${randomUUID()}.tmp`)
  const persist=async(target,write)=>{
    const file={fd:undefined,closeComplete:false}
    state.evidenceWriters.add(file)
    let phase=write?"file_open":"directory_open",primary
    const remember=value=>{
      primary ??= {phase,value}
      state.evidencePrimary ??= primary
      state.shutdown.persistencePrimary ??= {phase:primary.phase,rejection:closeRejection(primary.value)}
      state.shutdown.persistenceFailures ??= []
      state.shutdown.persistenceFailures.push({phase,rejection:closeRejection(value)})
    }
    const callback=invoke=>{
      const operation={pending:true,phase}
      file.io=operation
      let projection
      const completion=new Promise((resolve,reject)=>{
        try {projection=invoke((error,result)=>{
          operation.pending=false
          if(error!==null&&error!==undefined){operation.failure={value:error};reject(error)}
          else resolve(result)
        })}catch(value){reject(value)}
      })
      return Promise.all([completion,projection]).then(([result])=>result)
    }
    try {
      await callback(done=>evidenceOpen(target,write?constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW:constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW,0o600,(error,fd)=>{
        file.openComplete=true
        if(error===null||error===undefined)file.fd=fd
        else state.evidenceWriters.delete(file) // authoritative open failure acquired no writer
        done(error,fd)
      }))
      if(write){phase="file_write";await callback(done=>evidenceWrite(file.fd,JSON.stringify(state.shutdown,null,2)+"\n",done))}
      phase=write?"file_sync":"directory_sync";await callback(done=>evidenceSync(file.fd,done))
    }catch(value){remember(value)}
    if(file.fd!==undefined){
      phase=write?"file_close":"directory_close"
      // Register the native operation before invoking it. A wrapper may throw
      // after scheduling close: retain the original callback, never retry it.
      try {
        await closeEvidenceFile(file)
        state.evidenceWriters.delete(file)
      }catch(value){file.closeFailure ??= {value};remember(value)}
    }
    if(primary)throw primary.value
    if(!file.closeComplete)throw Error("LOGINOM_MANAGED_WRITER_CLOSE_UNKNOWN")
  }
  await guardPublication()
  await persist(temporary,true)
  await guardPublication()
  // Retain the original publication callback independently of its projection.
  const publication={pending:true,temporary,path}
  state.evidencePublication=publication
  let projection
  const completion=new Promise((resolve,reject)=>{
    try {projection=evidenceRename(temporary,path,error=>{
      publication.pending=false
      if(error!==null&&error!==undefined){publication.failure={value:error};reject(error)}
      else {publication.confirmed=true;resolve()}
    })}catch(value){reject(value)}
  })
  try {await Promise.all([completion,projection])}
  catch(value){
    state.evidencePrimary ??= {phase:"rename",value}
    state.shutdown.persistencePrimary ??= {phase:"rename",rejection:closeRejection(value)}
    state.shutdown.persistenceFailures ??= []
    state.shutdown.persistenceFailures.push({phase:"rename",rejection:closeRejection(value)})
    throw value
  }
  await persist(directory,false)
  // Directory IO can outlive the original foreground owner binding.
  if((state.session??state.startupOwner)!==evidenceOwner
      ||(state.session?.directory??state.startupOwner?.directory)!==directory)
    throw Error("LOGINOM_MANAGED_OWNER_DIRECTORY_CHANGED")
}
function close() {
  if(state.preReadyReadHeld)return Promise.reject(Error("LOGINOM_RECOVERY_REQUIRED"))
  if (state.closing) return state.closing
  state.closing = (async () => {
    state.shutdown ??= {stages:[]}
    state.release ??= {}
    let stage="drain",primary
    try {
      await recordClose(stage,{status:"started"})
      await Promise.allSettled([...requests])
      if (state.startupOwner && !state.bridge) {
        stage="startup_owner"
        const owner=state.startupOwner
        state.startupBinding ??= Object.freeze({owner,id:owner.id,account:owner.account,origin:owner.origin,context:owner.context,page:owner.page})
        const binding=state.startupBinding
        if (binding.owner!==owner || binding.id!==owner.id || binding.account!==owner.account
            || binding.origin!==owner.origin || binding.context!==owner.context || binding.page!==owner.page)
          throw Error("LOGINOM_STARTUP_OWNER_CHANGED")
        if (state.startupCleanup && state.startupCleanup.owner!==owner) throw Error("LOGINOM_STARTUP_OWNER_CHANGED")
        if (!state.startupCleanup) {
          try {
            const receipt=owner.closed===true?owner.receipt:await owner.close()
            if (receipt?.cleanup_complete!==true || owner.closed!==true
                || (owner.context && owner.contextClosed!==true))
              throw new Error("LOGINOM_RUNTIME_CLEANUP_FAILED",{cause:receipt})
            state.startupCleanup={owner,receipt}
          } catch (error) {
            // Preserve the original native value, including undefined/falsy,
            // independently of authentication and later persistence failures.
            primary={stage,error:new Error("LOGINOM_RUNTIME_CLEANUP_FAILED",{
              cause:owner.nativeFailure?owner.nativeFailure.value:error})}
            throw primary.error
          }
        }
        await recordClose(stage,{status:"returned",receipt:state.startupCleanup.receipt})
        if (owner.contextClosed) state.browser=undefined
      }
      if (state.authenticatedReadiness && !state.browser && !state.startupOwner?.closed) throw Error("LOGINOM_RUNTIME_CLEANUP_FAILED")
      if (state.browser && !state.bridge) throw Error("LOGINOM_RUNTIME_CLEANUP_FAILED")
      if (state.bridge) {
        stage="bridge"
        if (!state.bridgeCleanup) {
          if (state.bridgeCloseAttempted) throw state.bridgeCloseFailure
          await recordClose(stage,{status:"started"})
          state.bridgeCloseAttempted=true
          try {
            const receipt=await state.bridge.close()
            // Preserve this receiving branch's existing bridge receipt contract.
            if (receipt?.browser_transport_closed!==true || receipt.cleanup_complete!==true
                || (state.authenticatedReadiness && receipt.native_logout_confirmed!==true))
              throw new Error("LOGINOM_RUNTIME_CLEANUP_FAILED",{cause:receipt})
            state.bridgeCleanup=receipt
          } catch (error) {
            state.bridgeCloseFailure=new Error("LOGINOM_RUNTIME_CLEANUP_FAILED",{cause:error})
            throw state.bridgeCloseFailure
          }
        }
        await recordClose(stage,{status:"returned",receipt:state.bridgeCleanup})
      }
      state.controller?.abort()
      for (const [name,handle] of [["client",state.client],["browser_server",state.browserServer],["browser_context",state.browser]]) {
        stage=name
        if (!state.release[name]) {
          if (state.release[name+"_attempted"]) throw state.release[name+"_failure"]
          await recordClose(stage,{status:"started"})
          state.release[name+"_attempted"]=true
          try {await handle?.close();state.release[name]=true}
          catch (error) {state.release[name+"_failure"]=new Error("LOGINOM_RUNTIME_CLEANUP_FAILED",{cause:error});throw state.release[name+"_failure"]}
        }
        await recordClose(stage,{status:"returned"})
      }
      stage="browser_profile"
      if (state.browserProfile && !state.release.browser_profile) {
        await rm(state.browserProfile,{recursive:true,force:true})
        state.release.browser_profile=true
      }
      await recordClose("outer_acknowledgement",{status:"allowed"})
    } catch (error) {
      const rejection=primary?.error??(error instanceof Error?error:new Error("LOGINOM_RUNTIME_CLEANUP_FAILED",{cause:error}))
      state.closeFailure=rejection
      state.shutdown.primaryFailure ??= {stage,rejection:closeRejection(rejection)}
      if (Object.hasOwn(state,"startupFailure")) state.shutdown.startupFailure ??= closeRejection(state.startupFailure)
      if (primary && error!==rejection) state.shutdown.persistenceFailure=closeRejection(error)
      try {await recordClose("refused",{rejection:closeRejection(rejection)})}
      catch (persistenceFailure) {state.shutdown.persistenceFailure=closeRejection(persistenceFailure)}
      throw rejection
    }
  })()
  state.closing.catch(error=>{state.closeFailure=error;state.closing=undefined})
  return state.closing
}
const stop = () => {
  if(state.fpStartup && !state.fpStartup.accepted) {state.closeFailure=Error("LOGINOM_NOT_READY");return}
  void close().then(
    () => process.exit(0),
    error => { state.closeFailure = error },
  )
}
process.on("disconnect", stop)
process.on("SIGTERM", stop)
process.on("message", (message) => {
  const request = handle(message)
  // Close awaits the ordinary requests; tracking its own control handler would
  // make that drain wait for itself (and for every concurrent Close handler).
  if (message?.operation !== "close") requests.add(request)
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
      const { acceptanceCleanupPackage, acceptanceCapture, fpStartup } = validateStartInput(input)
      if(fpStartup) {
        state.startupController=new AbortController()
        state.fpStartup=retainFPManagedStartup(message,input,state,state.startupController)
      }
      const observed=async(work)=>{
        let value;try {value=await work}catch(error){throw state.fpStartup?state.fpStartup.reject(error):error}
        state.fpStartup?.guard();return value
      }
      state.fpStartup?.guard()
      if (Object.hasOwn(message,"deadline") && (!Number.isSafeInteger(message.deadline) || message.deadline<=Date.now()))
        throw Error("LOGINOM_INITIAL_READINESS_DEADLINE")
      const resources = await observed(verifyResources(input.resources))
      let captureHarness
      if (acceptanceCapture) {
        // Fixed reviewed receiving resource, never a request-selected module.
        const fp = acceptanceCapture.harness === "field-parameters-preservation-v1"
        const amount = acceptanceCapture.harness === "amount-import-type-v1"
        const path = fp ? "runtime/src/acceptance/field-parameters-preservation-v1.mjs" : amount ? "runtime/src/acceptance/amount-import-type-v1.mjs"
          : "runtime/src/acceptance/calculator-grouped-before-done-v1.mjs"
        if (!resources.manifest.files.some(file => file.path === path && !file.link && !file.directory))
          throw Error("LOGINOM_CAPTURE_UNAVAILABLE")
        const module = await observed(import(pathToFileURL(join(input.resources, path)).href))
        if (typeof (fp ? module.collectFieldParametersPreservation : amount ? module.captureAmount : module.captureCalculator) !== "function") throw Error("LOGINOM_CAPTURE_UNAVAILABLE")
        captureHarness = fp ? module.collectFieldParametersPreservation : amount ? module.captureAmount : module.captureCalculator
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
      await observed(mkdir(directory, { recursive: true, mode: 0o700 }))
      // Chromium creates nested files below user-data-dir. The normal Desktop
      // state path is already close to MAX_PATH on Windows, so a valid profile
      // can otherwise fail before Loginom authentication even starts.
      const browserProfile =
        process.platform === "win32" ? await observed(mkdtemp(join(tmpdir(), "lb"))) : join(directory, "browser-profile")
      state.browserProfile = process.platform === "win32" ? browserProfile : undefined
      state.startupController??=new AbortController()
      state.startupOwner={directory,generation:input.generation,chat:input.chat,
        deadline:Number.isSafeInteger(message.deadline)?message.deadline:null,
        deadlineSource:Number.isSafeInteger(message.deadline)?"supervisor.request.start":"NOT_SUPPLIED",
        signal:state.startupController.signal}
      state.fpStartup?.bindOwner(state.startupOwner)
      const login = {
        owner:state.startupOwner,
        browserPath: resources.browserPath,
        profile: browserProfile,
        candidate: input.connection,
        headless: input.headless === true,
      }
      if (input.validation === true) {
        try {await checkConnection({ ...login, endpoint: input.endpoint })}
        finally {if(!state.fpStartup)state.startupController=undefined}
        send({ id: message.id, result: { checked: true, protocol: 1, generation: input.generation } })
        return
      }
      let authenticated
      try {authenticated = await observed(loginBrowser({ ...login, keepOpen: true }))}
      finally {if(!state.fpStartup)state.startupController=undefined}
      if(state.fpStartup && (authenticated?.context!==state.startupOwner.context || !state.startupOwner.page
          || authenticated.context.pages().length!==1 || authenticated.context.pages()[0]!==state.startupOwner.page))
        throw Error("LOGINOM_STARTUP_OWNER_CHANGED")
      state.browser = authenticated.context
      state.startupBinding=Object.freeze({owner:state.startupOwner,id:state.startupOwner.id,account:state.startupOwner.account,origin:state.startupOwner.origin,context:state.startupOwner.context,page:state.startupOwner.page,generation:state.startupOwner.generation,chat:state.startupOwner.chat})
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
      const session = await observed(createSession(config, {
        headless: input.headless === true,
        managed: { directory, browserPath: resources.browserPath, browserRoot: resources.browserRoot },
      }))
      state.session = session
      const originalStartup=state.startupBinding,originalOwner=state.startupOwner,originalMetadata=session.metadata,
        originalDirectory=session.directory,originalSessionId=session.metadata.sessionId;
      const assertStartup=()=>{
        state.fpStartup?.guard();
        if(state.session!==session || session.metadata!==originalMetadata || session.directory!==originalDirectory
            || session.metadata.sessionId!==originalSessionId || state.startupBinding!==originalStartup || state.startupOwner!==originalOwner
            || originalStartup.owner!==originalOwner || originalStartup.id!==originalOwner.id
            || originalStartup.page!==originalOwner.page || originalStartup.context!==originalOwner.context
            || originalStartup.account!==originalOwner.account || originalStartup.origin!==originalOwner.origin
            || originalStartup.generation!==originalOwner.generation || originalStartup.chat!==originalOwner.chat)
          throw Error("LOGINOM_STARTUP_OWNER_CHANGED");
      };
      assertStartup();
      // Bind only the document owned by this successful private login. This is
      // not workspace preparation and confers no package-close authority.
      const documentId=randomUUID()
      state.authenticatedReadiness=await observed(authenticated.context.pages()[0].evaluate(o=>{
        const app=globalThis.bg?.app,m=app?.Application?.FInstance?.FMainForm?.FMapTree;
        if(location.origin!==o.origin||app?.Version!=='7.4.2'||m?.FServerConnection?.UserName!==o.account
            ||m.FServerConnection.Connected!==true||globalThis.__loginomDockReadinessV1)
          throw Error('LOGINOM_READINESS_IDENTITY_REQUIRED');
        globalThis.__loginomDockReadinessV1={document,documentId:o.documentId,sessionId:o.sessionId,
          account:o.account,loginomBuild:app.Version};
        return {documentId:o.documentId,account:o.account,loginomBuild:app.Version};
      },{documentId,sessionId:session.metadata.sessionId,account:input.connection.username,
        origin:new URL(config.loginomUrl).origin}))
      assertStartup();
      const { Client } = require("@modelcontextprotocol/sdk/client/index.js")
      const { InMemoryTransport } = require("@modelcontextprotocol/sdk/inMemory.js")
      const { createConnection } = require("@playwright/mcp")
      state.browserServer = await observed(createConnection(
        JSON.parse(await observed(readFile(session.browserConfig, "utf8"))),
        async () => authenticated.context,
      ))
      assertStartup();
      const [browserClientTransport, browserServerTransport] = InMemoryTransport.createLinkedPair()
      await observed(state.browserServer.connect(browserServerTransport))
      assertStartup();
      state.bridge = await observed(createBridge(config, session, { browserTransport: browserClientTransport,
        authenticatedReadiness:state.authenticatedReadiness,
        acceptanceCapture: acceptanceCapture ? { binding: Object.freeze({...acceptanceCapture, session:session.metadata.sessionId}),
          harness: captureHarness } : undefined }))
      assertStartup();
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
      state.client = new Client({ name: "loginom-ai-agent-host", version: "0.1.0" })
      state.readonlyBinding=Object.freeze({startup:state.startupBinding,owner:state.startupOwner,
        bridge:state.bridge,client:state.client,session,state,metadata:session.metadata,
        directory:session.directory,sessionId:session.metadata.sessionId,reader:state.bridge.readPreReady})
      state.preReadyOwner=state.readonlyBinding
      await observed(state.bridge.server.connect(serverTransport))
      assertStartup();
      await observed(state.client.connect(clientTransport))
      assertStartup();
      state.fpStartup?.accept()
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
    if(message.operation==="readonly.preReady.cancel" && message.input?.phase==="startup") {
      if(!state.fpStartup?.cancel(message.input))throw Error("LOGINOM_HANDSHAKE_INVALID")
      send({id:message.id,result:{accepted:true,pending:state.fpStartup.pending,nativeCancellationConfirmed:false}});return
    }
    if(state.fpStartup && !state.fpStartup.accepted) throw Error("LOGINOM_NOT_READY")
    if(state.preReadyReadHeld && !["readonly.preReady","readonly.preReady.cancel","interrupt"].includes(message.operation))
      throw Error("LOGINOM_RECOVERY_REQUIRED")
    if (message.operation === "close") {
      await close()
      send({ id: message.id, result: { closed: true } }, true)
      return
    }
    if (state.closing) throw Error("LOGINOM_RUNTIME_CLOSING")
    if (message.operation === "interrupt" && state.startupController) {
      state.startupController.abort(Error("LOGINOM_INITIAL_STARTUP_CANCELLED"))
      await recordClose("interrupt",{status:"startup_cancelled"})
      send({id:message.id,result:{interrupted:true}})
      return
    }
    if (message.operation === "readonly.preReady.cancel") {
      const pending=preReadyRequests.get(message.input?.requestId);
      if(!pending)throw Error("LOGINOM_PRE_READY_READ_REFUSED");
      pending.abort(decodePreReadyRejection(message.input.rejection));return;
    }
    if (!state.client) throw Error("LOGINOM_NOT_READY")
    if(message.operation === "readonly.preReady") {
      if(state.controller || state.admitting || !message.input || Object.keys(message.input).join(',')!=='deadline')
        throw Error("LOGINOM_PRE_READY_READ_REFUSED");
      const controller=new AbortController();state.controller=controller;state.preReadyReadHeld=true;preReadyRequests.set(message.id,controller);
      try {
        const result=await state.preReadyOwner.reader({retained:state.preReadyOwner,signal:controller.signal,deadline:message.input.deadline});
        state.readonlyRetained=true;
        send({id:message.id,result:{readonlyPreReady:true,result}});
      } catch(value) {
        state.preReadyReadRefusal??={value};state.readonlyRetained=true;
        send({id:message.id,result:{readonlyPreReady:false,rejection:closeRejection(value)}});
      } finally {preReadyRequests.delete(message.id);if(state.controller===controller)state.controller=undefined}
      return;
    }

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
      state.admitting=(state.admitting??0)+1
      try {
        const result = await admitStartupArtifacts(state.session.artifactStore, message.input.files)
        state.inputs.set(message.input.userMessage, result)
        send({ id: message.id, result })
      } finally {state.admitting--}
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
    if(message.operation==="start" && state.fpStartup)send({id:message.id,rejection:closeRejection(state.fpStartup.propagate(error)),rejectionOrigin:state.fpStartup.rejectionOrigin,
      ...(state.fpStartup.secondary?{secondaryRejection:closeRejection(state.fpStartup.secondary.value)}:{})})
    else send({ id: message.id, error: code })
    if (message.operation === "start") {
      state.startupFailure=error
      if (state.startupOwner?.context) {
        state.browser=state.startupOwner.context
        state.startupBinding ??= Object.freeze({owner:state.startupOwner,id:state.startupOwner.id,account:state.startupOwner.account,origin:state.startupOwner.origin,context:state.startupOwner.context,page:state.startupOwner.page})
      }
      // Clean up immediately, but keep IPC until the owner requests an acknowledged close.
      // close() retains a rejection so that the later close request reports cleanup failure.
      if(!state.fpStartup) setImmediate(() => {
        void close().catch(() => undefined)
      })
    }
  } finally { if(message.operation==="start")state.fpStartup?.settle() }
}
