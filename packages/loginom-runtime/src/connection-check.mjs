import { createRequire } from "node:module"
import { mkdir, writeFile, readFile, open, rename, unlink } from "node:fs/promises"
import { constants } from "node:fs"
import { randomUUID, createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import { join, dirname } from "node:path"
import { browserDownloadScript } from "../client/lib/browser-downloads.mjs"
import { browserLaunch } from "../client/lib/browser-launch.mjs"

const runtimeModulePath = fileURLToPath(import.meta.url)

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

// Serialized read on the original startup document. Captures no input values.
export function readStartupBootstrap(o) {
  const own=globalThis.__loginomStartupV1;
  if(own?.document!==document||own.id!==o.id||own.account!==o.account||location.origin!==o.origin)
    throw Error('LOGINOM_STARTUP_PAGE_CHANGED');
  const visible=e=>!!e&&!!e.getBoundingClientRect().width&&!!e.getBoundingClientRect().height&&getComputedStyle(e).visibility!=='hidden';
  const blocker=[...document.querySelectorAll('[role="dialog"],.x-message-box,.bg-mask-message,.x-mask-msg')].find(visible);
  const avatar=document.querySelector('[data-tid="MF;cntMain;tlbMainToolbar;btnAvatar"]');
  const username=document.querySelector('[data-tid="LoginForm;Login;edtUsername"]');
  return {observed_at:new Date().toISOString(),owner_id:o.id,document_bound:true,
    url:location.href,build:globalThis.bg?.app?.Version??null,
    document_state:{ready_state:document.readyState??null,body_present:!!document.body,
      body_children:[...(document.body?.children??[])].slice(0,12).map(e=>({tag:e.tagName??null,class:e.getAttribute?.('class')??null,data_tid:e.getAttribute?.('data-tid')??null})),
      scripts:[...(document.scripts??[])].slice(0,24).map(e=>{try{const u=new URL(e.src,location.href);return {origin:u.origin,path:u.pathname}}catch{return {invalid:true}}})},
    blocker:blocker?{data_tid:blocker.getAttribute('data-tid'),class:blocker.getAttribute('class'),
      role:blocker.getAttribute('role'),text:(blocker.textContent??'').trim().slice(0,1000)}:null,
    avatar:{in_dom:!!avatar,visible:visible(avatar)},username:{in_dom:!!username,visible:visible(username)},
    read_only:true,mutation_authorized:false,release_authorized:false};
}
async function recordStartupBootstrap(page,owner,phase) {
  if(owner.page!==page||owner.context?.pages().length!==1||owner.context.pages()[0]!==page)
    throw Error('LOGINOM_STARTUP_PAGE_CHANGED');
  owner.evidence.bootstrap??={};
  if(Object.hasOwn(owner.evidence.bootstrap,phase))throw Error('LOGINOM_STARTUP_BOOTSTRAP_CONSUMED');
  const snapshot=await page.evaluate(readStartupBootstrap,{id:owner.id,account:owner.account,origin:owner.origin});
  if(owner.page!==page||owner.context.pages().length!==1||owner.context.pages()[0]!==page)
    throw Error('LOGINOM_STARTUP_PAGE_CHANGED');
  owner.evidence.bootstrap[phase]={...snapshot,page_events:owner.bootstrapEvents?{available:true,errors:[...owner.bootstrapEvents.errors],failed_requests:[...owner.bootstrapEvents.failed_requests],truncated:owner.bootstrapEvents.truncated}: {available:false}};
  await startupEvidence(owner);
}

// This function is reachable only from the private host channel, never from model tools.
// It performs login and identity read-back only; no file panel or folder permission probe.
export async function loginPage(page, candidate, owner) {
  if(owner) {
    owner.navigationStarted=true
    if(owner.page!==page)throw Error('LOGINOM_STARTUP_PAGE_CHANGED')
    if(typeof page.on==='function'){
      if(owner.bootstrapEvents)throw Error('LOGINOM_STARTUP_BOOTSTRAP_CONSUMED')
      const events={errors:[],failed_requests:[],truncated:false};owner.bootstrapEvents=events
      const append=(target,value)=>{if(owner.page!==page)return;if(target.length<16)target.push(value);else events.truncated=true}
      page.on('pageerror',error=>append(events.errors,{name:String(error?.name??'Error').slice(0,80),message:String(error?.message??error).slice(0,500)}))
      page.on('requestfailed',request=>{try{const u=new URL(request.url());append(events.failed_requests,{origin:u.origin,path:u.pathname,type:request.resourceType(),error:String(request.failure()?.errorText??'unknown').slice(0,240)})}catch{append(events.failed_requests,{invalid:true})}})
    }
  }
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
  if(owner)await recordStartupBootstrap(page,owner,'before');
  let waitFailed=false,waitFailure;
  try {await avatar.or(field("edtUsername")).first().waitFor({ state: "visible", timeout: 60_000 })}
  catch(reason){waitFailed=true;waitFailure=reason}
  // After belongs to the same original document, including a failed wait.
  // Persistence/read failures must not replace its original falsy/Error cause.
  if(owner) {
    try {await recordStartupBootstrap(page,owner,'after')}
    catch(secondary){if(!waitFailed)throw secondary;owner.evidence.bootstrap.after_rejection=startupRejection(secondary)}
  }
  if(waitFailed)throw waitFailure
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

// Validation closes immediately after login. Avatar/Connected alone do not
// prove native package-cache readiness. This cap is new observational policy,
// never an unavailable upstream/original Amount deadline.
export async function awaitOwnLoginReadiness(page,owner) {
  const started=Date.now(),cap=10000;
  const remaining=Number.isSafeInteger(owner.deadline)?Math.min(cap,owner.deadline-started):cap;
  if(remaining<=0)throw Error('LOGINOM_LOGIN_READINESS_EXPIRED');
  owner.evidence.login_readiness={started_at:new Date(started).toISOString(),cap_ms:cap,
    upstream_deadline_available:Number.isSafeInteger(owner.deadline),upstream_deadline:owner.deadline??null};
  const ready=o=>{
    const own=globalThis.__loginomStartupV1,app=globalThis.bg?.app,m=app?.Application?.FInstance?.FMainForm?.FMapTree;
    if(own?.document!==document||own.id!==o.id||own.account!==o.account||location.origin!==o.origin)throw Error('LOGINOM_LOGIN_READINESS_IDENTITY_CHANGED');
    if(!m||m.FServerConnection?.Connected!==true)return false;
    if(app.Version!=='7.4.2'||m.FServerConnection.UserName!==o.account)throw Error('LOGINOM_LOGIN_READINESS_IDENTITY_CHANGED');
    if(!m.FPackagesParentNode||m.PackageNodes?.Count!==0||typeof m.HasRunningNodes!=='function')return false;
    const running=m.HasRunningNodes,connection=m.FServerConnection,parent=m.FPackagesParentNode,packages=m.PackageNodes;
    const idle=running.call(m)===false;
    if(globalThis.__loginomStartupV1!==own||own.document!==document||own.id!==o.id||own.account!==o.account
      ||globalThis.bg?.app!==app||app.Application?.FInstance?.FMainForm?.FMapTree!==m
      ||m.FServerConnection!==connection||connection.UserName!==o.account||connection.Connected!==true
      ||m.FPackagesParentNode!==parent||m.PackageNodes!==packages||packages.Count!==0||m.HasRunningNodes!==running)
      throw Error('LOGINOM_LOGIN_READINESS_IDENTITY_CHANGED');
    return idle;
  };
  const expected={id:owner.id,account:owner.account,origin:owner.origin};
  const handle=await page.waitForFunction(ready,expected,{timeout:remaining});
  try {
    if(Number.isSafeInteger(owner.deadline)&&Date.now()>=owner.deadline)throw Error('LOGINOM_LOGIN_READINESS_EXPIRED');
    // Same operands are read afresh after await, never inferred from its handle.
    if(await page.evaluate(ready,expected)!==true)throw Error('LOGINOM_LOGIN_READINESS_CHANGED');
  } catch(primary) {
    try {await handle.dispose()}catch(secondary){owner.evidence.login_readiness.secondary_rejection=startupRejection(secondary)}
    throw primary;
  }
  await handle.dispose();
  owner.evidence.login_readiness.completed_at=new Date().toISOString();
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
function startupRejectionValue(detail) {
  if(detail.kind==='Error') {const value=new Error(detail.message);value.name=detail.name;if('cause' in detail)value.cause=startupRejectionValue(detail.cause);return value}
  return detail.is_undefined?undefined:detail.value
}
async function startupFingerprint(path) {
  try {const bytes=await readFile(path);return {available:true,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}}
  catch(error){return {available:false,rejection:startupRejection(error)}}
}
async function startupEvidence(owner) {
  // The producer owns durability. A collector syncing a later copy cannot
  // authorize this owner's context exit. Retry only storage/confirmed results.
  owner.evidencePendingClose??=[];
  for(const handle of [...owner.evidencePendingClose]) {
    await handle.close();owner.evidencePendingClose.splice(owner.evidencePendingClose.indexOf(handle),1);
  }
  const temporary=join(owner.directory,'.startup-cleanup-'+randomUUID()+'.json');
  let file,directory,created=false,phase='open',failed=false,primary;
  const closeFailures=[];
  try {
    file=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    created=true;phase='write';
    await file.writeFile(JSON.stringify(owner.evidence,null,2)+'\n');
    phase='file_sync';await file.sync();
  }catch(error){failed=true;primary=error}
  if(file) {
    try {await file.close()}
    catch(error){owner.evidencePendingClose.push(file);closeFailures.push({phase:'file_close',rejection:startupRejection(error)});if(!failed){failed=true;primary=error;phase='file_close'}}
  }
  if(!failed) {
    try {
      phase='rename';await rename(temporary,join(owner.directory,'startup-cleanup.json'));created=false;
      phase='directory_open';directory=await open(owner.directory,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
      phase='directory_sync';await directory.sync();
    }catch(error){failed=true;primary=error}
  }
  if(directory) {
    try {await directory.close()}
    catch(error){owner.evidencePendingClose.push(directory);closeFailures.push({phase:'directory_close',rejection:startupRejection(error)});if(!failed){failed=true;primary=error;phase='directory_close'}}
  }
  if(created) {
    try {await unlink(temporary)}
    catch(error){closeFailures.push({phase:'temporary_unlink',rejection:startupRejection(error)});if(!failed){failed=true;primary=error;phase='temporary_unlink'}}
  }
  if(failed) {
    const failure={phase,rejection:startupRejection(primary),secondary:closeFailures};
    owner.evidence.persistence_attempts??=[];
    owner.evidence.persistence_attempts.push(failure);
    owner.evidence.persistence_failure??=failure.rejection;
    throw primary;
  }
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
        if(owner.contextCloseAttempted && !owner.contextClosed) throw new Error('LOGINOM_STARTUP_CONTEXT_UNKNOWN',{cause:owner.contextCloseFailure})
        if(owner.context && !owner.contextClosed && (owner.context.pages().length!==1||owner.context.pages()[0]!==owner.page)) throw Error('LOGINOM_STARTUP_PAGE_CHANGED')
        if(owner.context && !owner.nativeConfirmed) {
          if(owner.nativeAttempted) throw new Error('LOGINOM_STARTUP_CLEANUP_UNKNOWN',{cause:owner.nativeFailure?.value})
          if(!owner.page) throw Error('LOGINOM_STARTUP_PAGE_UNKNOWN')
          const observed=await owner.page.evaluate(o=>{
            const own=globalThis.__loginomStartupV1,app=globalThis.bg?.app,m=app?.Application?.FInstance?.FMainForm?.FMapTree;
            const exact=value=>({type:typeof value,is_undefined:value===undefined,value:value===undefined?null:value});
            const rejection=value=>value instanceof Error?{kind:'Error',name:value.name,message:value.message,
              ...('cause' in value?{cause:rejection(value.cause)}:{})}:{kind:'value',value:value===undefined?null:value,is_undefined:value===undefined};
            // Sample each operand once. The later pre-logout native identity
            // check is intentionally independent; it cannot rewrite this sample.
            const documentMatches=own?.document===document&&own?.id===o.id&&own?.account===o.account;
            const origin=location.origin,build=app?.Version,connection=m?.FServerConnection;
            const account=connection?.UserName,connected=connection?.Connected;
            const parent=m?.FPackagesParentNode,count=m?.PackageNodes?.Count;
            const snapshot={observed_at:new Date().toISOString(),deadline:o.deadline,deadline_available:o.deadline!==null,
              document_matches:documentMatches,origin_matches:origin===o.origin,identity_matches:account===o.account,
              build:exact(build),connected:exact(connected),
              package_parent:{type:typeof parent,is_undefined:parent===undefined,is_null:parent===null},
              package_parent_ready:!!parent,count:exact(count),dialogs:{available:false},running:{...exact(undefined),available:false,observed:false}};
            const result=value=>({...value,snapshot});
            if(!o.navigationStarted && location.href==='about:blank' && !app) return result({unauthenticated:true});
            if(!documentMatches||origin!==o.origin) return result({reason:'STARTUP_DOCUMENT_CHANGED'});
            const visible=e=>!!e.getBoundingClientRect().width&&!!e.getBoundingClientRect().height&&getComputedStyle(e).visibility!=='hidden';
            snapshot.dialogs={available:true,visible:[...document.querySelectorAll('[role="dialog"],.x-message-box,.bg-mask-message,.x-mask-msg')].some(visible)};
            if(snapshot.dialogs.visible) return result({reason:'STARTUP_OPERATION_OPEN'});
            if(connected!==true) return result({unauthenticatedCandidate:!o.loginSubmitted,reason:'LOGIN_EFFECT_UNKNOWN'});
            if(build!=='7.4.2'||account!==o.account||count!==0) return result({reason:'STARTUP_NOT_OWN_EMPTY_IDLE'});
            let running;
            try {running=m.HasRunningNodes();snapshot.running={...exact(running),available:true,observed:true}}
            catch(error){
              const detail=rejection(error);
              snapshot.running={available:false,observed:true,rejection:detail};
              // Raw values preserve VM/transport identity; the DTO preserves
              // Error causes even when browser serialization omits them.
              return result({reason:'STARTUP_GUARD_READ_REJECTED',guardFailure:{value:error,rejection:detail}});
            }
            if(running!==false) return result({reason:'STARTUP_NOT_OWN_EMPTY_IDLE'});
            return result({authenticated:true});
          },{id:owner.id,account:owner.account,origin:owner.origin,navigationStarted:owner.navigationStarted===true,loginSubmitted:owner.loginSubmitted===true,deadline:owner.deadline??null})
          if(observed.guardFailure && !owner.guardFailure) {
            const detail=observed.guardFailure.rejection;
            let value=observed.guardFailure.value;
            if(detail.kind==='Error') {
              if(!(value instanceof Error)) {value=new Error(detail.message);value.name=detail.name;}
              value.name=detail.name;value.message=detail.message;
              if('cause' in detail && (!('cause' in value)
                  || JSON.stringify(startupRejection(value.cause))!==JSON.stringify(detail.cause)))
                value.cause=startupRejectionValue(detail.cause);
            } else if(detail.is_undefined) value=undefined;
            owner.guardFailure={value,rejection:detail};
            owner.evidence.guard_rejection=detail;
          }
          // Each actual retry has its own operands/time. Never reconstruct it
          // from a later title/idle receipt or replace the first observation.
          owner.evidence.guard_observations??=[];
          owner.evidence.guard_observations.push({attempt:owner.evidence.guard_observations.length+1,
            owner_id:owner.id,account:owner.account,origin:owner.origin,snapshot:observed.snapshot,
            result:{authenticated:observed.authenticated===true,reason:observed.reason??null}});
          // Freeze the FIRST observation; later cleanup/retries cannot replace it.
          if(!owner.evidence.first_guard) {
            owner.evidence.first_guard={...observed.snapshot,result:{authenticated:observed.authenticated===true,reason:observed.reason??null},artifacts:owner.artifacts??{available:false}}
          }
          try {await startupEvidence(owner)}
            catch(error) {
              owner.evidence.guard_persistence_failure=startupRejection(error)
              if(observed.guardFailure) throw owner.guardFailure.value
              if(!observed.authenticated&&!observed.unauthenticated) throw new Error('LOGINOM_STARTUP_CLEANUP_BLOCKED',{cause:observed})
              throw error // no native gesture without durable first evidence
          }
          if(observed.guardFailure) throw owner.guardFailure.value
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
        owner.cleanupFailure=owner.nativeFailure?owner.nativeFailure.value:owner.guardFailure?owner.guardFailure.value:error
        owner.evidence.cleanup_complete=false
        owner.evidence.effect_possible=owner.nativeAttempted===true||owner.loginSubmitted===true||(owner.launchAttempted===true&&!owner.context)
        owner.evidence.cleanup_rejection=startupRejection(owner.cleanupFailure)
        owner.evidence.cleanup_attempt_rejection=startupRejection(error)
        try { await startupEvidence(owner) } catch(persistenceFailure) {owner.evidence.persistence_failure=startupRejection(persistenceFailure)}
        if(owner.guardFailure && !nativeStage && !owner.nativeConfirmed) throw owner.guardFailure.value
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
  owner.deadline??=null // No upstream absolute deadline is supplied by the existing start contract.
  owner.artifacts??={node:await startupFingerprint(process.execPath),browser:await startupFingerprint(browserPath),runtime:await startupFingerprint(runtimeModulePath),resource_manifest:await startupFingerprint(join(dirname(runtimeModulePath),'../../resource-manifest.json')),cli_manifest:await startupFingerprint(join(dirname(runtimeModulePath),'../../../../cli-manifest.json')),foreground_caller:{available:false,reason:'NOT_SUPPLIED_BY_START_CONTRACT'}}
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
    await owner.context.addInitScript({content:browserDownloadScript(candidate.url)})
    const result=await loginPage(owner.page,candidate,owner)
    if(!keepOpen) {await awaitOwnLoginReadiness(owner.page,owner);await owner.close();return result}
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
