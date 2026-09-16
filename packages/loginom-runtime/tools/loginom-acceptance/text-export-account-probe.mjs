// Acceptance-only fixed account observation. No new browser or public tool.
import {readFile,writeFile,realpath} from 'node:fs/promises';
import {join,dirname,basename} from 'node:path';import {createHash} from 'node:crypto';import {performance} from 'node:perf_hooks';
import {parseBrowserResult} from './text-export-observer-native.mjs';
const need=(v,m)=>{if(!v)throw Error(m)},sha=x=>createHash('sha256').update(x).digest('hex');
export async function nativeAccountProbe(page,binding){
 const start=Date.now(),deadline=Math.min(binding.deadline_epoch_ms,start+20000),observations=[],steps=[];let opened=false,closed=false,account=null,phase='before';
 const mark=(step)=>{phase=step;if(steps.length>=96)throw Error('ACCOUNT_EVIDENCE_LIMIT');steps.push({step,elapsed_ms:Date.now()-start});};
 const remaining=()=>{if(Date.now()>=deadline)throw Error('ACCOUNT_DEADLINE');return deadline-Date.now()};
 const inspect=async(readAccount=false)=>{
  remaining();mark(phase+':read_started');const o=await page.evaluate(({readAccount,operation})=>{
   const visible=e=>{if(!e?.isConnected)return false;for(let p=e;p;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'||Number(s.opacity)===0)return false;}const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};
   const all=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')].filter(visible);
   const avatars=all('MF;cntMain;tlbMainToolbar;btnAvatar'),menus=all('MF;AppMenuForm');
   const state=globalThis.__loginomDockPreparationV1,receipt=state?.document===document?state.receipts.get(operation):null;
   let session=null;try{session=JSON.parse(receipt?.request).session}catch{}
   const tab=receipt?.tab;const active=!!tab?.isConnected&&visible(tab)&&tab.classList.contains('x-tab-active');
   let account=null,line_visible=false;
   if(readAccount&&menus.length===1){
    const walk=document.createTreeWalker(menus[0],NodeFilter.SHOW_TEXT);let node,visited=0;
    // Stop at the first rendered nonempty account line. Never read the menu's
    // innerText/textContent, never enumerate/log other menu entries.
    while((node=walk.nextNode())&&++visited<=64){
     const parent=node.parentElement;if(!visible(parent))continue;
     const range=document.createRange();range.selectNodeContents(node);if(![...range.getClientRects()].some(r=>r.width>0&&r.height>0))continue;
     const value=node.nodeValue?.trim();if(!value)continue;
     if(value.length>128||/[\r\n]/.test(value)||parent.closest('[data-tid^="MF;AppMenuForm;btn"]'))break;
     account=value;line_visible=true;break;
    }
   }
   return {origin:location.origin,url:location.href,build:globalThis.bg?.app?.Version??null,document_id:state?.document===document?state.id:null,session_id:session,workflow_id:receipt?.workflowId??null,tab_tid:tab?.getAttribute('data-tid')??null,prepared_verified:receipt?.phase==='verified',active_tab:active,avatar_count:avatars.length,menu_count:menus.length,account,line_visible};
  },{readAccount,operation:binding.operation_id});remaining();
  if(o.origin!==binding.origin||o.document_id!==binding.document_id||o.session_id!==binding.session_id||o.workflow_id!==binding.workflow_id||o.tab_tid!==binding.tab_tid||!o.prepared_verified||!o.active_tab||o.avatar_count!==1||o.build!=='7.4.2')throw Error('ACCOUNT_OWNER_CHANGED');
  if(observations.length>=32)throw Error('ACCOUNT_EVIDENCE_LIMIT');observations.push(o);steps.push({step:'read_completed',elapsed_ms:Date.now()-start,observation_index:observations.length-1});return o;
 };
 try{
  const before=await inspect();if(before.menu_count!==0)throw Error('ACCOUNT_MENU_ALREADY_OPEN');
  mark('open_started');remaining();await page.locator('[data-tid="MF;cntMain;tlbMainToolbar;btnAvatar"]:visible').click({timeout:remaining()});remaining();opened=true;mark('open_completed');
  let current;
  for(;;){phase='account_wait';current=await inspect(true);if(current.menu_count===1)break;if(current.menu_count!==0)throw Error('ACCOUNT_MENU_OWNER_AMBIGUOUS');await page.waitForTimeout(Math.min(100,remaining()));remaining();}
  account=current.account;
  if(!current.line_visible||typeof account!=='string')throw Error('ACCOUNT_LINE_UNOBSERVED');
  phase='before_close';const beforeClose=await inspect();if(beforeClose.menu_count!==1)throw Error('ACCOUNT_MENU_CHANGED');mark('close_started');remaining();await page.locator('[data-tid="MF;cntMain;tlbMainToolbar;btnAvatar"]:visible').click({timeout:remaining()});remaining();mark('close_gesture_completed');
  for(;;){phase='close_wait';const after=await inspect();if(after.menu_count===0){closed=true;break;}if(after.menu_count!==1)throw Error('ACCOUNT_MENU_OWNER_AMBIGUOUS');await page.waitForTimeout(Math.min(100,remaining()));remaining();}
  if(account!=='test-2')throw Error('ACCOUNT_MISMATCH');
  return {status:'SUCCEEDED',account,opened,closed,elapsed_ms:Date.now()-start,phase,steps,pending_ui_actions:0,observations};
 }catch(e){return {status:'FAILED',reason:/^ACCOUNT_[A-Z_]+$/.test(String(e.message))?String(e.message):'ACCOUNT_BROWSER_ERROR',error_name:String(e.name),account,opened,closed,elapsed_ms:Date.now()-start,phase,steps,pending_ui_actions:0,observations};}
}
export function validateAccountEvidence(value,binding){
 need(value?.status==='SUCCEEDED'&&value.account==='test-2'&&value.opened===true&&value.closed===true&&value.elapsed_ms>=0&&value.elapsed_ms<=30000,'Account probe incomplete');
 need(value.observations.length>=3&&value.observations[0].menu_count===0&&value.observations.at(-1).menu_count===0,'Account menu lifecycle incomplete');
 need(value.observations.filter(o=>o.account!==null).length===1,'Unique account line required');
 for(const o of value.observations){need(o.origin===binding.origin&&new URL(o.url).origin===o.origin&&o.document_id===binding.document_id&&o.session_id===binding.session_id&&o.workflow_id===binding.workflow_id&&o.tab_tid===binding.tab_tid&&o.build==='7.4.2'&&o.prepared_verified&&o.active_tab&&o.avatar_count===1,'Account evidence owner differs');if(o.account!==null)need(o.account==='test-2'&&o.line_visible&&o.menu_count===1,'Visible exact account required');}
 return true;
}
export function installAccountProbe({Client,Server,CallToolRequestSchema,runDirectory,stateDirectory,overallDeadline}){
 const connect=Client.prototype.connect,set=Server.prototype.setRequestHandler;let browser,directory,used=false;
 Client.prototype.connect=async function(transport,...rest){
  if(this._clientInfo?.name==='loginom-dock-browser'){
   need(!browser,'Second account browser forbidden');const p=transport?._serverParams;directory=dirname(p?.args?.[2]??'');
   need(p.command===process.execPath&&p.args.length===3&&p.args[1]==='--config'&&basename(p.args[2])==='playwright.json'&&p.cwd===directory&&dirname(directory)===join(stateDirectory,'sessions')&&await realpath(directory)===directory,'Foreign account browser transport');browser=this;
  }return connect.call(this,transport,...rest);
 };
 Server.prototype.setRequestHandler=function(schema,handler){if(schema!==CallToolRequestSchema)return set.call(this,schema,handler);return set.call(this,schema,async(request,extra)=>{
  const reply=await handler(request,extra);if(request.params.name!=='dock_prepare')return reply;
  need(!used&&browser,'Account probe is one-shot');used=true;const prepared=JSON.parse(reply.content[0].text);need(prepared.prepared&&prepared.workspace?.status==='READY','Account preparation missing');
  const start=performance.now(),deadline=Math.min(start+30000,overallDeadline);need(deadline-start>11000,'Account budget unavailable');
  const guard=()=>{extra.signal?.throwIfAborted();need(performance.now()<deadline,'Account host deadline');};guard();
  const session=JSON.parse(await readFile(join(directory,'session.json'),'utf8'));guard();
  const profile=session.targetIdentity;need(session.sessionId===prepared.sessionId&&session.sessionId===basename(directory)&&session.resultProfile==='user-v1'&&profile.profile_id==='loginom-7.4.2-macos-chromium-ru'&&profile.loginom_build==='7.4.2'&&profile.platform==='macos'&&profile.browser==='chromium','Account session/profile differs');
  const binding={session_id:session.sessionId,document_id:prepared.workspace.document_id,workflow_id:prepared.workspace.workflow_ref.workflow_id,tab_tid:prepared.workspace.workflow_ref.tab_tid,operation_id:prepared.workspace.operation_id,origin:'http://logi-test-plan.bg.local',deadline_epoch_ms:Date.now()+Math.min(20000,Math.floor(deadline-performance.now())-10000)};
  const code=`async page=>(${nativeAccountProbe.toString()})(page,${JSON.stringify(binding)})`;
  const record={session_id:session.sessionId,profile,result_profile:session.resultProfile,binding,code_sha256:sha(code),mono_start:start,deadline_ms:deadline};
  await writeFile(join(runDirectory,'account-probe-prepared.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});guard();
  const signal=extra.signal?AbortSignal.any([extra.signal,AbortSignal.timeout(Math.max(1,Math.floor(deadline-performance.now())))]):AbortSignal.timeout(Math.max(1,Math.floor(deadline-performance.now())));
  await writeFile(join(runDirectory,'account-transport.json'),JSON.stringify({phase:'browser_call_issued_after_prepare_handler',session_id:session.sessionId,mono_ms:performance.now(),prepare_handler_returned:true,host_deadline_ms:deadline,browser_deadline_epoch_ms:binding.deadline_epoch_ms})+'\n',{flag:'wx',mode:0o600});guard();
  let raw;try{raw=await browser.callTool({name:'browser_run_code_unsafe',arguments:{code}},undefined,{signal,timeout:Math.max(1,Math.floor(deadline-performance.now()))});}catch(error){await browser.close();await writeFile(join(runDirectory,'account-transport-failure.json'),JSON.stringify({phase:'browser_call_failed',session_id:session.sessionId,mono_ms:performance.now(),owned_browser_transport_closed:true,reason:error?.code??error?.name??'transport_error'})+'\n',{flag:'wx',mode:0o600});throw error;}guard();
  const value=parseBrowserResult(raw);await writeFile(join(runDirectory,'account-probe.json'),JSON.stringify({...record,mono_end:performance.now(),raw,value},null,2)+'\n',{flag:'wx',mode:0o600});guard();validateAccountEvidence(value,binding);return reply;
 });};
}
