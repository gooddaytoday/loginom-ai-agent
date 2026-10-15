import { createRequire } from "node:module"
import { mkdir, writeFile, readFile, open, rename, unlink } from "node:fs/promises"
import { constants } from "node:fs"
import { randomUUID, createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import { join, dirname } from "node:path"
import { browserDownloadScript } from "../client/lib/browser-downloads.mjs"
import { browserLaunch } from "../client/lib/browser-launch.mjs"
import { createCalculatorResourceReader } from "./acceptance/calculator-resource-reader.mjs"

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

// This function is reachable only from the private host channel, never from model tools.
// It performs login and identity read-back only; no file panel or folder permission probe.
export async function loginPage(page, candidate, owner) {
  // Passive diagnostics only. These events never qualify login or cleanup,
  // read application data, renew deadlines, or issue an extra Page request.
  const scriptFailureCodes=['net::ERR_CERT_VERIFIER_CHANGED','net::ERR_FAILED','net::ERR_CERT_AUTHORITY_INVALID',
    'net::ERR_CERT_COMMON_NAME_INVALID','net::ERR_CERT_DATE_INVALID','net::ERR_CERT_INVALID',
    'net::ERR_SSL_PROTOCOL_ERROR','net::ERR_CONNECTION_RESET']
  const trace=owner ? (owner.evidence??={}).login_ui={revision:1,source:'original_page_events',
    owner_id:owner.id,phase:'navigation',events:[],dropped:0,script_failures:[],script_failures_dropped:0,
    script_failure_histogram:Object.fromEntries([...scriptFailureCodes,'other'].map(code=>[code,0])),authority:false} : undefined
  const context=owner?.context,ownerId=owner?.id
  const listeners=[]
  const append=event=>{
    if(!trace||trace.observation_closed)return
    if(owner.page!==page||owner.context!==context||owner.id!==ownerId){trace.owner_changed=true;return}
    if(trace.events.length>=32){trace.dropped++;return}
    trace.events.push({...event,at:new Date().toISOString()})
  }
  const sameOrigin=url=>{try{return new URL(url).origin===new URL(candidate.url).origin}catch{return false}}
  const listen=(name,read)=>{
    if(!trace)return
    try {
      if(typeof page.on!=='function'||typeof page.off!=='function'){trace.events_available=false;return}
      const listener=value=>{try{const event=read(value);if(event)append(event)}catch{trace.event_read_failed=true}}
      listeners.push([name,listener]);page.on(name,listener);trace.events_available=true
    }catch{trace.registration_failed=true}
  }
  try {
    listen('domcontentloaded',()=>({kind:'domcontentloaded'}))
    listen('load',()=>({kind:'load'}))
    listen('pageerror',error=>({kind:'pageerror',name:['Error','TypeError','ReferenceError','SyntaxError','RangeError'].includes(error?.name)?error.name:'Other',
      message_sha256:createHash('sha256').update(String(error?.message??'')).digest('hex')}))
    const resourceType=request=>{const type=request.resourceType();return ['document','stylesheet','image','media','font','script','texttrack','xhr','fetch','eventsource','websocket','manifest','other'].includes(type)?type:'unknown'}
    listen('response',response=>{
      const type=resourceType(response.request()),status=response.status();
      if(type!=='document'&&Number.isInteger(status)&&status<400)return
      return {kind:'response',resource_type:type,same_origin:sameOrigin(response.url()),
        status:Number.isInteger(status)&&status>=100&&status<=599?status:null}
    })
    listen('requestfailed',request=>{
      const type=resourceType(request),url=request.url(),same=sameOrigin(url),errorText=String(request.failure()?.errorText??'')
      if(type==='script'&&same&&trace&&!trace.observation_closed&&owner.page===page&&owner.context===context&&owner.id===ownerId) {
        const code=scriptFailureCodes.includes(errorText)?errorText:'other'
        trace.script_failure_histogram[code]++
        if(trace.script_failures.length>=30)trace.script_failures_dropped++
        else {
          let text=errorText
          for(const secret of [candidate.password,candidate.apiKey].filter(v=>typeof v==='string'&&v.length))text=text.split(secret).join('[REDACTED]')
          trace.script_failures.push({pathname:new URL(url).pathname,errorText:text,at:new Date().toISOString()})
        }
      }
      return {kind:'requestfailed',resource_type:type,same_origin:same,error_sha256:createHash('sha256').update(errorText).digest('hex')}
    })
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
  if(trace) trace.phase='waiting_entry'
  await avatar.or(field("edtUsername")).first().waitFor({ state: "visible", timeout: 60_000 })
  if (!(await avatar.isVisible())) {
    if(trace) trace.phase='credentials'
    await field("edtUsername").locator("input").fill(candidate.username)
    const password = field("edtPassword").locator("input")
    // Loginom resolves password availability when username loses focus.
    // fill() waits for editability before focusing, so focus explicitly first.
    await password.click()
    // Passwordless accounts may make an already empty field readonly after username lookup.
    if (candidate.password !== "" || (await password.inputValue()) !== "") await password.fill(candidate.password)
    if(owner) owner.loginSubmitted=true
    if(trace) trace.phase='login_submitted'
    await field("btnLogin").click()
    await avatar.waitFor({ state: "visible", timeout: 30_000 }).catch(cause => {
      throw new Error("LOGINOM_LOGIN_REJECTED",{cause})
    })
  }
  if(trace) trace.phase='identity_read'
  const identity = await page.evaluate(
    () => globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree?.FServerConnection?.UserName ?? null,
  )
  if (identity !== candidate.username) throw Error("LOGINOM_ACCOUNT_MISMATCH")
  if(trace) trace.phase='verified'
  return { authenticated: true }
  } finally {
    if(trace)trace.observation_closed=true
    for(const [name,listener] of listeners) {try{page.off(name,listener)}catch{trace.detach_failed=true}}
  }
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
function startupPhaseTiming(owner,name,started) {
  const now=Date.now(),initial=owner.initialReadiness;
  const nonnegative=value=>Number.isSafeInteger(value)&&value>=0?value:null;
  owner.phaseTiming??=[];
  if(owner.phaseTiming.length>=32){owner.phaseTimingTruncated=true;return}
  owner.phaseTiming.push({name,at_ms:nonnegative(now-(initial?.local_deadline-initial?.budget_ms)),
    ...(started===undefined?{}:{duration_ms:nonnegative(now-started)})});
}
async function startupEvidence(owner) {
  // Freeze only already completed timing marks. The current write's durations
  // remain beside evidence until the NEXT write; no second persistence pass.
  owner.evidence.phase_timing=(owner.phaseTiming??[]).map(mark=>({...mark}));
  owner.evidence.phase_timing_truncated=owner.phaseTimingTruncated===true;
  startupPhaseTiming(owner,'evidence_before');
  try {
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
    phase='file_sync';const syncStarted=Date.now();
    try {await file.sync()} finally {startupPhaseTiming(owner,'file_sync',syncStarted)}
  }catch(error){failed=true;primary=error}
  if(file) {
    try {await file.close()}
    catch(error){owner.evidencePendingClose.push(file);closeFailures.push({phase:'file_close',rejection:startupRejection(error)});if(!failed){failed=true;primary=error;phase='file_close'}}
  }
  if(!failed) {
    try {
      phase='rename';const renameStarted=Date.now();
      try {await rename(temporary,join(owner.directory,'startup-cleanup.json'))} finally {startupPhaseTiming(owner,'rename',renameStarted)}
      created=false;
      phase='directory_open';directory=await open(owner.directory,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
      phase='directory_sync';const syncStarted=Date.now();
      try {await directory.sync()} finally {startupPhaseTiming(owner,'directory_sync',syncStarted)}
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
  } finally {startupPhaseTiming(owner,'evidence_after')}
}
// Shared initial read-only gate. Reuse the same owner budget, never renew it.
async function startupReadiness(owner, initial=true, persist=true) {
  owner.readinessBinding ??= Object.freeze({id:owner.id,account:owner.account,origin:owner.origin,context:owner.context,page:owner.page,deadline:owner.deadline,signal:owner.signal});
  const binding=owner.readinessBinding;
  const start=Date.now();
  if(initial) owner.initialReadiness ??= {started_at:new Date(start).toISOString(),budget_ms:5000,
    local_deadline:start+5000,upstream_deadline:owner.deadline??null,
    upstream_available:Number.isSafeInteger(owner.deadline),provenance:owner.deadlineSource??'NOT_SUPPLIED',
    effective_deadline:Math.min(start+5000,owner.deadline??Infinity),parent_policy:'diagnostic_only'};
  const budget=initial?owner.initialReadiness:null;
  owner.evidence.initial_readiness ??= budget?{...budget,status:'observing'}:{parent_policy:'diagnostic_only',status:'strict_cleanup'};
  const guard=()=>{
    if(owner.id!==binding.id||owner.account!==binding.account||owner.origin!==binding.origin
        ||owner.context!==binding.context||owner.page!==binding.page||owner.deadline!==binding.deadline||owner.signal!==binding.signal
        ||owner.context.pages().length!==1||owner.context.pages()[0]!==binding.page)
      throw Error('LOGINOM_INITIAL_READINESS_OWNER_CHANGED');
    if(owner.signal?.aborted)throw owner.signal.reason;
    if(Date.now()>=(budget?.effective_deadline??owner.deadline??Infinity))
      throw Error('LOGINOM_INITIAL_READINESS_DEADLINE');
  };
  let iteration=0;
  for(;;) {
    guard();
    if(owner.guardReadOperation?.state==='pending')throw Error('LOGINOM_INITIAL_READINESS_READ_PENDING');
    const reading={state:'pending'};
    owner.guardReadOperation=reading;
    startupPhaseTiming(owner,'observe_before');
    reading.promise=owner.page.evaluate(o=>{
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
      if(build!=='7.4.2'||account!==o.account) return result({reason:'STARTUP_NOT_OWN_EMPTY_IDLE'});
      let running;
      try {running=m.HasRunningNodes();snapshot.running={...exact(running),available:true,observed:true}}
      catch(error){
        const detail=rejection(error);
        snapshot.running={available:false,observed:true,rejection:detail};
        // Raw values preserve VM/transport identity; the DTO preserves
        // Error causes even when browser serialization omits them.
        return result({reason:'STARTUP_GUARD_READ_REJECTED',guardFailure:{value:error,rejection:detail}});
      }
      if(count!==0||running!==false) return result({reason:'STARTUP_NOT_OWN_EMPTY_IDLE'});
      return result({authenticated:true});
    },{id:owner.id,account:owner.account,origin:owner.origin,navigationStarted:owner.navigationStarted===true,loginSubmitted:owner.loginSubmitted===true,deadline:owner.deadline??null})
    reading.promise.then(()=>{reading.state='settled'},value=>{reading.state='settled';reading.rejection=startupRejection(value)});
    let timer,stop;
    const interrupted=new Promise((_,reject)=>{
      stop=()=>reject(binding.signal.reason);
      binding.signal?.addEventListener('abort',stop,{once:true});
      if(binding.signal?.aborted)stop();
      const remaining=Math.min(budget?.effective_deadline??owner.deadline??Infinity,Date.now()+5000)-Date.now();
      if(Number.isFinite(remaining))timer=setTimeout(()=>reject(Error('LOGINOM_INITIAL_READINESS_DEADLINE')),Math.max(0,remaining));
    });
    let observed;
    try {observed=await Promise.race([reading.promise,interrupted])}
    catch(value){owner.evidence.guard_read={state:reading.state,read_only:true,rejection:startupRejection(value)};throw value}
    finally {clearTimeout(timer);binding.signal?.removeEventListener('abort',stop);startupPhaseTiming(owner,'observe_after')}
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
      owner_id:binding.id,account:binding.account,origin:binding.origin,snapshot:observed.snapshot,
      result:{authenticated:observed.authenticated===true,reason:observed.reason??null}});
    // Freeze the FIRST observation; later cleanup/retries cannot replace it.
    if(!owner.evidence.first_guard) {
      owner.evidence.first_guard={...observed.snapshot,result:{authenticated:observed.authenticated===true,reason:observed.reason??null},artifacts:owner.artifacts??{available:false}}
    }
    if(initial)owner.evidence.initial_readiness={...budget,status:observed.guardFailure?'rejected':observed.authenticated?'ready':observed.unauthenticated?'unauthenticated':'not_ready'};
    if(!observed.authenticated&&!observed.unauthenticated)owner.evidence.initial_refusal ??= {snapshot:observed.snapshot,reason:observed.reason??null};
    try {if(persist)await startupEvidence(owner)}
      catch(error) {
        owner.evidence.guard_persistence_failure=startupRejection(error)
        if(observed.guardFailure) throw owner.guardFailure.value
        if(!observed.authenticated&&!observed.unauthenticated) throw new Error('LOGINOM_STARTUP_CLEANUP_BLOCKED',{cause:observed})
        throw error // no native gesture without durable first evidence
    }
    if(observed.guardFailure) throw owner.guardFailure.value
    
    if(!observed.authenticated&&!observed.unauthenticated)owner.evidence.initial_refusal ??= {snapshot:observed.snapshot,reason:observed.reason??null};
    try {guard()} finally {startupPhaseTiming(owner,'post_guard')}
    if(observed.authenticated||observed.unauthenticated){if(initial)owner.initialReadinessCompleted=true;return observed}
    owner.evidence.initial_refusal ??= {snapshot:observed.snapshot,reason:observed.reason??null};
    const x=observed.snapshot,unknown=v=>v?.is_undefined===true||v?.value===null;
    const pending=initial&&observed.reason==='STARTUP_NOT_OWN_EMPTY_IDLE'
      &&x.document_matches&&x.origin_matches&&x.identity_matches&&x.build.value==='7.4.2'
      &&x.connected.value===true&&x.dialogs.available&&x.dialogs.visible===false
      &&x.running.observed===true&&x.running.available===true
      &&(unknown(x.count)||x.count.value===0)
      &&(unknown(x.running)||x.running.value===false)
      &&(unknown(x.count)||unknown(x.running));
    if(!pending)return observed;
    owner.evidence.initial_readiness={...budget,status:'pending',observations:++iteration};
    await startupEvidence(owner);
    try {guard()} finally {startupPhaseTiming(owner,'post_guard')}
    const delay=Math.min(10*2**Math.min(iteration-1,4),budget.effective_deadline-Date.now());
    await new Promise((resolve,reject)=>{
      const signal=binding.signal;
      const stop=()=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);reject(signal.reason)};
      const timer=setTimeout(()=>{signal?.removeEventListener('abort',stop);resolve()},Math.max(0,delay));
      signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
    });
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
      let nativeStage,nativeLogoutObservation
      try {
        await owner.calculatorResourceReader?.dispose()
        if(owner.launchAttempted && !owner.context) throw Error('LOGINOM_STARTUP_LAUNCH_UNKNOWN')
        if(owner.contextCloseAttempted && !owner.contextClosed) throw new Error('LOGINOM_STARTUP_CONTEXT_UNKNOWN',{cause:owner.contextCloseFailure})
        if(owner.context && !owner.contextClosed && (owner.context.pages().length!==1||owner.context.pages()[0]!==owner.page)) throw Error('LOGINOM_STARTUP_PAGE_CHANGED')
        if(owner.context && !owner.nativeConfirmed) {
          if(owner.nativeAttempted) throw new Error('LOGINOM_STARTUP_CLEANUP_UNKNOWN',{cause:owner.nativeFailure?.value})
          if(!owner.page) throw Error('LOGINOM_STARTUP_PAGE_UNKNOWN')
          // Cleanup is a strict fresh observation, not a retry of the failed
          // initial readiness window. Original owner/upstream/signal guards
          // still apply; unknown native effects remain non-replayable.
          const observed=await startupReadiness(owner,false)
          if(observed.authenticated) {
            const fresh=await startupReadiness(owner,false,false)
            if(!fresh.authenticated)throw new Error('LOGINOM_INITIAL_READINESS_REFUSED',{cause:fresh})
            if(owner.signal?.aborted)throw owner.signal.reason
            if(owner.deadline!==null&&owner.deadline!==undefined&&Date.now()>=owner.deadline)throw Error('LOGINOM_INITIAL_READINESS_DEADLINE')
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
            const logoutGateVisible=await at('MF;AppMenuForm;btnLogOut').isVisible()
            owner.evidence.logout_gate_visible=logoutGateVisible
            if(!logoutGateVisible) {
              nativeStage='native_menu_reopen'
              await at('MF;cntMain;tlbMainToolbar;btnAvatar').click({timeout:8000})
            }
            nativeStage='native_logout'
            try {await at('MF;AppMenuForm;btnLogOut').click({timeout:8000})}
            catch(error) {
              const message=typeof error?.message==='string'?error.message:''
              const unstable=message.indexOf('not stable')
              if(error?.name==='TimeoutError'&&unstable>=0&&message.indexOf('not visible',unstable)>unstable) {
                nativeLogoutObservation={logout_visible:null,logout_bounding_box:null,menu_visible:null}
                for(const [field,read] of [
                  ['logout_visible',()=>at('MF;AppMenuForm;btnLogOut').isVisible()],
                  ['logout_bounding_box',()=>at('MF;AppMenuForm;btnLogOut').boundingBox()],
                  ['menu_visible',()=>at('MF;AppMenuForm').isVisible()],
                ]) {
                  try {nativeLogoutObservation[field]=await read()}
                  catch(observationError) {
                    (nativeLogoutObservation.observation_rejections??=[]).push({field,rejection:startupRejection(observationError)})
                  }
                }
              }
              throw error
            }
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
          owner.evidence.stages.push({stage:nativeStage,status:'rejected',rejection:startupRejection(error),
            ...(nativeLogoutObservation?{post_timeout_observation:nativeLogoutObservation}:{})})
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
export async function loginBrowser({ browserPath, profile, candidate, headless = false, keepOpen = false, owner = {}, calculatorResourceRead = false }) {
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
    owner.readinessBinding=Object.freeze({id:owner.id,account:owner.account,origin:owner.origin,context:owner.context,page:owner.page,deadline:owner.deadline,signal:owner.signal})
    await owner.context.addInitScript({content:browserDownloadScript(candidate.url)})
    const result=await loginPage(owner.page,candidate,owner)
    const ready=await startupReadiness(owner,!owner.initialReadinessCompleted)
    if(!ready.authenticated)throw new Error('LOGINOM_INITIAL_READINESS_REFUSED',{cause:ready})
    // The empty pre-initialization collection is not the settled package root.
    // Capture once after native readiness, retaining the same owner/Page. Never
    // repin an existing reader after a failed read or a later root replacement.
    if(calculatorResourceRead) await createCalculatorResourceReader(owner)
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
