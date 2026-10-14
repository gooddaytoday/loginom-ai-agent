import { createRequire } from "node:module"
import { mkdir, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { terminalUserPublisherScript } from "../client/lib/terminal-user-publisher.mjs"
import { browserDownloadScript } from "../client/lib/browser-downloads.mjs"
import { browserLaunch } from "../client/lib/browser-launch.mjs"

const require = createRequire(new URL("../client/package.json", import.meta.url))

export function browserEnvironment(profile, environment = process.env) {
  return { ...environment, CHROME_LOG_FILE: join(profile, "chrome-debug.log") }
}

export function browserLoggingArguments(profile) {
  return ["--disable-logging", `--log-file=${join(profile, "chrome-debug.log")}`]
}

export function loginomAddress(value) {
  const url = new URL(value)
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw Error("LOGINOM_URL_INVALID")
  // The public root redirects to /app/ without preserving the testable query.
  if (url.origin === "https://app.loginom.ai" && url.pathname === "/") url.pathname = "/app/"
  url.searchParams.set("testable", "true")
  return url.href
}

// This function is reachable only from the private host channel, never from model tools.
// It performs login and identity read-back only; no file panel or folder permission probe.
export async function loginPage(page, candidate, owner) {
  if(owner) owner.navigationStarted=true
  await page.goto(loginomAddress(candidate.url), { waitUntil: "domcontentloaded", timeout: 60_000 })
  if(owner) {
    await page.evaluate(o=>{
      if(location.origin!==o.origin||globalThis.__loginomStartupV1) throw Error('LOGINOM_STARTUP_IDENTITY_REQUIRED')
      globalThis.__loginomStartupV1={document,id:o.id,account:o.account}
    },{id:owner.id,account:candidate.username,origin:new URL(candidate.url).origin})
    owner.documentBound=true
  }
  const field = (name) => page.locator(`[data-tid="LoginForm;Login;${name}"]`)
  const avatar = page.locator('[data-tid="MF;cntMain;tlbMainToolbar;btnAvatar"]')
  await avatar.or(field("edtUsername")).first().waitFor({ state: "visible", timeout: 60_000 })
  if (!(await avatar.isVisible())) {
    await field("edtUsername").locator("input").fill(candidate.username)
    const password = field("edtPassword").locator("input")
    // Loginom resolves password availability when username loses focus.
    // fill() waits for editability before focusing, so focus explicitly first.
    await password.click()
    // Passwordless accounts may make an already empty field readonly after username lookup.
    if (candidate.password !== "" || (await password.inputValue()) !== "") await password.fill(candidate.password)
    if(owner) owner.loginSubmitted=true
    await field("btnLogin").click()
    await avatar.waitFor({ state: "visible", timeout: 30_000 }).catch(cause => {
      throw new Error("LOGINOM_LOGIN_REJECTED",{cause})
    })
  }
  const identity = await page.evaluate(
    () => globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree?.FServerConnection?.UserName ?? null,
  )
  if (identity !== candidate.username) throw Error("LOGINOM_ACCOUNT_MISMATCH")
  return { authenticated: true }
}

export async function checkKnowledge(endpoint, apiKey, owner = {}) {
  const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
  const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js')
  const client=new Client({name:'loginom-ai-agent-connection-check',version:'0.1.0'})
  owner.knowledgeClient=client
  let primary,failed=false
  try {await client.connect(new StreamableHTTPClientTransport(new URL(endpoint),{
    requestInit:{headers:{Authorization:`Bearer ${apiKey}`},redirect:'error'}}),{timeout:30000})}
  catch(error){failed=true;primary=new Error([401,403].includes(error?.code??error?.status)?'LOGINOM_KNOWLEDGE_AUTH_FAILED':'LOGINOM_KNOWLEDGE_UNAVAILABLE',{cause:error})}
  owner.knowledgeCloseAttempted=true
  try {await client.close();owner.knowledgeClosed=true}
  catch(error){owner.knowledgeCloseFailure=error;if(!failed){failed=true;primary=new Error('LOGINOM_KNOWLEDGE_UNAVAILABLE',{cause:error})}}
  if(failed) throw primary
}

function startupRejection(value) {
  return value instanceof Error?{kind:'Error',name:value.name,message:value.message,
    ...('cause' in value?{cause:startupRejection(value.cause)}:{})}:
    {kind:'value',value:value===undefined?null:value,is_undefined:value===undefined}
}
async function startupEvidence(owner) {
  await writeFile(join(owner.directory,'startup-cleanup.json'),JSON.stringify(owner.evidence,null,2)+'\n',{mode:0o600})
}
// Internal foreground owner, assigned before authentication. No IPC authority.
function startupOwner(owner, profile, candidate) {
  if(owner.id) {
    if(owner.account!==candidate.username||owner.origin!==new URL(candidate.url).origin) throw Error('LOGINOM_STARTUP_OWNER_CHANGED')
    return owner
  }
  Object.assign(owner,{id:randomUUID(),directory:owner.directory??profile,account:candidate.username,
    origin:new URL(candidate.url).origin,evidence:{stages:[]}})
  Object.assign(owner.evidence,{version:1,owner_id:owner.id,account:owner.account,origin:owner.origin,profile,
    ...(owner.generation!==undefined?{generation:owner.generation}:{}),...(owner.chat!==undefined?{chat:owner.chat}:{})})
  owner.close=async()=>{
    if(owner.closed) return owner.receipt
    if(owner.closing) return owner.closing
    owner.closing=(async()=>{
      let nativeStage
      try {
        if(owner.launchAttempted && !owner.context) throw Error('LOGINOM_STARTUP_LAUNCH_UNKNOWN')
        if(owner.context && (owner.context.pages().length!==1||owner.context.pages()[0]!==owner.page)) throw Error('LOGINOM_STARTUP_PAGE_CHANGED')
        if(owner.context && !owner.nativeConfirmed) {
          if(owner.nativeAttempted) throw new Error('LOGINOM_STARTUP_CLEANUP_UNKNOWN',{cause:owner.nativeFailure?.value})
          if(!owner.page) throw Error('LOGINOM_STARTUP_PAGE_UNKNOWN')
          const observed=await owner.page.evaluate(o=>{
            const own=globalThis.__loginomStartupV1,app=globalThis.bg?.app,m=app?.Application?.FInstance?.FMainForm?.FMapTree;
            if(!o.navigationStarted && location.href==='about:blank' && !app) return {unauthenticated:true}
            if(!own||own.document!==document||own.id!==o.id||own.account!==o.account||location.origin!==o.origin)
              return {reason:'STARTUP_DOCUMENT_CHANGED'}
            const visible=e=>!!e.getBoundingClientRect().width&&!!e.getBoundingClientRect().height&&getComputedStyle(e).visibility!=='hidden';
            if([...document.querySelectorAll('[role="dialog"],.x-message-box,.bg-mask-message,.x-mask-msg')].some(visible))
              return {reason:'STARTUP_OPERATION_OPEN'}
            if(m?.FServerConnection?.Connected!==true) return {unauthenticatedCandidate:!o.loginSubmitted,reason:'LOGIN_EFFECT_UNKNOWN'}
            if(app.Version!=='7.4.2'||m.FServerConnection.UserName!==o.account||m.PackageNodes?.Count!==0||m.HasRunningNodes()!==false)
              return {reason:'STARTUP_NOT_OWN_EMPTY_IDLE'}
            return {authenticated:true}
          },{id:owner.id,account:owner.account,origin:owner.origin,navigationStarted:owner.navigationStarted===true,loginSubmitted:owner.loginSubmitted===true})
          if(observed.authenticated) {
            owner.nativeAttempted=true
            nativeStage='native_menu_open'
            const at=tid=>owner.page.locator('[data-tid='+JSON.stringify(tid)+']')
            await at('MF;cntMain;tlbMainToolbar;btnAvatar').click({timeout:8000})
            nativeStage='native_account_check'
            if((await at('MF;AppMenuForm;p.h;p.t').innerText()).trim()!==owner.account) throw Error('LOGINOM_STARTUP_ACCOUNT_CHANGED')
            nativeStage='native_identity_check'
            const same=await owner.page.evaluate(o=>{
              const own=globalThis.__loginomStartupV1,app=globalThis.bg?.app,m=app?.Application?.FInstance?.FMainForm?.FMapTree;
              return own?.document===document&&own.id===o.id&&own.account===o.account&&location.origin===o.origin&&app?.Version==='7.4.2'
                &&m.FServerConnection.UserName===o.account&&m.FServerConnection.Connected===true&&m.PackageNodes?.Count===0&&m.HasRunningNodes()===false
            },{id:owner.id,account:owner.account,origin:owner.origin})
            if(!same) throw Error('LOGINOM_STARTUP_IDENTITY_CHANGED')
            nativeStage='native_logout'
            await at('MF;AppMenuForm;btnLogOut').click({timeout:8000})
            nativeStage='native_logout_confirmation'
            await at('LoginForm;Login;edtUsername').locator('input').waitFor({state:'visible',timeout:8000})
            if(await at('MF;cntMain;tlbMainToolbar;btnAvatar').isVisible()) throw Error('LOGINOM_STARTUP_LOGOUT_UNKNOWN')
            owner.nativeConfirmed={logged_out:true,unauthenticated:false}
          } else if(observed.unauthenticated || (observed.unauthenticatedCandidate
              &&await owner.page.locator('[data-tid="LoginForm;Login;edtUsername"]').locator('input').isVisible()
              &&!await owner.page.locator('[data-tid="MF;cntMain;tlbMainToolbar;btnAvatar"]').isVisible()))
            owner.nativeConfirmed={logged_out:false,unauthenticated:true}
          else throw new Error('LOGINOM_STARTUP_CLEANUP_BLOCKED',{cause:observed})
        }
        owner.evidence.native=owner.nativeConfirmed??{logged_out:false,no_context:true}
        owner.evidence.stages.push({stage:'native_cleanup',status:'confirmed'})
        await startupEvidence(owner) // Native proof is durable BEFORE context exit.
        if(owner.knowledgeClient && !owner.knowledgeClosed) throw new Error('LOGINOM_STARTUP_TRANSPORT_UNKNOWN',{cause:owner.knowledgeCloseFailure})
        if(owner.context && !owner.contextClosed) {
          if(owner.contextCloseAttempted) throw new Error('LOGINOM_STARTUP_CONTEXT_UNKNOWN',{cause:owner.contextCloseFailure})
          owner.contextCloseAttempted=true
          try {await owner.context.close();owner.contextClosed=true}
          catch(error){owner.contextCloseFailure=error;throw error}
        }
        owner.evidence.stages.push({stage:'context_close',status:'confirmed'})
        owner.evidence.cleanup_complete=true
        await startupEvidence(owner)
        owner.closed=true
        owner.receipt={owner_id:owner.id,account:owner.account,cleanup_complete:true,...owner.evidence.native,context_closed:true}
        return owner.receipt
      } catch(error) {
        // A refused native gesture is never replayed. Keep its first exact
        // value independently of authentication, retry and persistence errors.
        if(nativeStage && !owner.nativeConfirmed && !owner.nativeFailure) {
          owner.nativeFailure={stage:nativeStage,value:error}
          owner.evidence.native_failure={stage:nativeStage,rejection:startupRejection(error)}
          owner.evidence.stages.push({stage:nativeStage,status:'rejected',rejection:startupRejection(error)})
        }
        owner.cleanupFailure=owner.nativeFailure?owner.nativeFailure.value:error
        owner.evidence.cleanup_complete=false
        owner.evidence.effect_possible=owner.nativeAttempted===true||owner.loginSubmitted===true||(owner.launchAttempted===true&&!owner.context)
        owner.evidence.cleanup_rejection=startupRejection(owner.cleanupFailure)
        owner.evidence.cleanup_attempt_rejection=startupRejection(error)
        try { await startupEvidence(owner) } catch(persistenceFailure) {owner.evidence.persistence_failure=startupRejection(persistenceFailure)}
        throw error
      }
    })()
    owner.closing.catch(()=>{owner.closing=undefined})
    return owner.closing
  }
  return owner
}
export async function loginBrowser({ browserPath, profile, candidate, headless = false, keepOpen = false, owner = {} }) {
  startupOwner(owner,profile,candidate)
  try {
    const { chromium } = require('playwright-core')
    const launch=browserLaunch(headless)
    await mkdir(profile,{recursive:true,mode:0o700})
    owner.launchAttempted=true
    owner.context = await chromium
    .launchPersistentContext(profile, {
      executablePath: browserPath,
      headless,
      chromiumSandbox: true,
      // Chrome for Testing otherwise writes debug.log beside chrome.exe on
      // Windows, mutating the signed/manifested application payload. Keep all
      // browser state and diagnostics inside the disposable session profile.
      env: browserEnvironment(profile),
      args: [
        // Browser traffic is always direct; backend proxy policy is independent.
        "--no-proxy-server",
        ...browserLoggingArguments(profile),
        ...launch.args,
        ...(!headless
          ? [
              ...(process.platform === "linux" &&
              process.env.WAYLAND_DISPLAY &&
              (process.env.XDG_SESSION_TYPE === "wayland" || !process.env.DISPLAY)
                ? ["--ozone-platform=wayland"]
                : []),
            ]
          : []),
      ],
      viewport: launch.viewport,
    })
    owner.page=owner.context.pages()[0]??await owner.context.newPage()
    await owner.context.addInitScript({content:browserDownloadScript(candidate.url)+"\n"+terminalUserPublisherScript(candidate.url)})
    const result=await loginPage(owner.page,candidate,owner)
    if(!keepOpen) {await owner.close();return result}
    return {...result,context:owner.context}
  } catch(error) {
    owner.primaryFailure=error
    owner.evidence.primary_rejection=startupRejection(error)
    try {await startupEvidence(owner)} catch(persistenceFailure) {owner.evidence.persistence_failure=startupRejection(persistenceFailure)}
    try {await owner.close()} catch(cleanupFailure) {owner.cleanupFailure=owner.nativeFailure?owner.nativeFailure.value:cleanupFailure}
    // Preserve generic/falsy originals as cause, with the same foreground owner.
    const code=['LOGINOM_ACCOUNT_MISMATCH','LOGINOM_LOGIN_REJECTED'].includes(error?.message)?error.message:owner.context?'LOGINOM_LOGIN_UNAVAILABLE':'LOGINOM_BROWSER_START_FAILED'
    const failure=new Error(code,{cause:error})
    failure.startupOwner=owner
    throw failure
  }
}

export async function checkConnection(options) {
  const owner=startupOwner(options.owner??{},options.profile,options.candidate)
  await mkdir(owner.directory,{recursive:true,mode:0o700})
  try {await checkKnowledge(options.endpoint,options.candidate.apiKey,owner)}
  catch(error){
    owner.primaryFailure=error;owner.evidence.primary_rejection=startupRejection(error)
    try {await owner.close()} catch(cleanupFailure){owner.cleanupFailure=owner.nativeFailure?owner.nativeFailure.value:cleanupFailure}
    const failure=error instanceof Error?error:new Error('LOGINOM_KNOWLEDGE_UNAVAILABLE',{cause:error})
    failure.startupOwner=owner;throw failure
  }
  return loginBrowser({...options,owner})
}
