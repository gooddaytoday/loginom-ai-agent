// Operator-only fresh source harness. The ordinary classic bridge performs
// dock_prepare and remote pinning before the same public node dispatcher.
import fs from 'node:fs/promises';
import readline from 'node:readline';
import path from 'node:path';
import {Client} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {InMemoryTransport} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js';
import {loadConfig} from '../../client/lib/config.mjs';
import {createSession} from '../../client/lib/session.mjs';
import {createBridge} from '../../client/lib/bridge.mjs';
import {pinActionCatalog} from '../../client/lib/action-catalog.mjs';
import {createActionRuntime} from '../../client/lib/executor.mjs';
import {createCandidateNodeSupport} from '../../client/lib/node-support.mjs';
import {createExecutionJournal} from '../../client/lib/execution-journal.mjs';
import {makeWorkspacePrepareCode} from '../../client/lib/workspace.mjs';
import {createPublicNodeWire} from './public-node-wire.mjs';
process.umask(0o077);
const option=k=>{const i=process.argv.indexOf(k);if(i<0||!process.argv[i+1])throw Error('Required '+k);return process.argv[i+1];};
const configPath=path.resolve(option('--config')),stateDir=path.resolve(option('--state-dir')),user=option('--loginom-user');
const manifestUri=option('--manifest-uri'),manifestSha256=option('--manifest-sha256');
const config=await loadConfig({configPath,stateDir,agent:'codex',adapterRevision:'node-13-source-live',mode:'classic'});
if(!stateDir.startsWith(process.cwd()+'/.dock/')||user!=='test-3')throw Error('This harness requires owned state and test-3');
const session=await createSession(config),dir=session.directory,bridge=await createBridge(config,session);
const client=new Client({name:'node13-source-operator',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
await bridge.server.connect(b);await client.connect(a);let sequence=0,wire,lastObservation,replyLoss=null,operatorClosed=false;
const call=(name,args)=>client.callTool({name,arguments:args},undefined,{timeout:360000});
const execute=async code=>{const r=await call('browser_run_code_unsafe',{code});await fs.writeFile(dir+'/browser-'+(++sequence)+'.json',JSON.stringify(r));
 const t=r.content.filter(c=>c.type==='text').map(c=>c.text).join('\n'),raw=t.match(/^### Result\n([\s\S]*?)(?:\n### |$)/)?.[1];
 if(r.isError||!raw)throw Error(t.slice(0,1200));const value=JSON.parse(raw),actual=value.output?.value;
 if(replyLoss?.pendingId&&actual?.operation_id===replyLoss.pendingId&&actual.action_key==='ui.act'&&actual.status==='SUCCEEDED'&&actual.cleanup_complete===true){
  replyLoss.consumed=true;replyLoss.armed=false;
  await fs.writeFile(dir+'/injected-date-flag-reply-loss.json',JSON.stringify({...replyLoss,browser_reply:'browser-'+sequence+'.json',actual_status:actual.status,actual_cleanup_complete:actual.cleanup_complete},null,2));
  replyLoss.pendingId=null;throw Error('Operator-injected reply loss after the verified date flag click');
 }return value;};
const appendRecord=createExecutionJournal({directory:dir,metadata:session.metadata,knownSecrets:[config.apiKey]});
const record=async event=>{
 const ack=await appendRecord(event);
 if(event.phase==='node_observation_completed')lastObservation=event.outcome?.output;
 if(replyLoss?.armed&&event.operation_id===replyLoss.operationId&&event.phase==='node_step_prepared'&&event.action?.verb==='click'){
  const cell=lastObservation?.ui?.elements?.find(e=>e.ref===event.action.ref)?.date_time_cell;
  if(lastObservation?.node_date_time?.selected?.name===replyLoss.field&&cell?.role==='flag'&&cell.func===replyLoss.func&&cell.iso===false&&cell.flag===replyLoss.flag){
   replyLoss.pendingId=event.internal_operation_id;replyLoss.before=structuredClone(cell);
  }
 }return ack;
};
try{
 const prepared=await call('dock_prepare',{});if(prepared.isError)throw Error('dock_prepare failed');await fs.writeFile(dir+'/dock-prepare.json',JSON.stringify(prepared));
 const pinned=await pinActionCatalog(client,{manifestUri,manifestSha256,allowCandidate:true,runtimeIdentity:session.metadata});
 if(pinned.compatibility.loginom_build!=='7.4.2')throw Error('Manifest target differs');
 await fs.writeFile(dir+'/remote-pins.json',JSON.stringify(pinned,null,2));
 await call('browser_navigate',{url:config.loginomUrl});
 const geometry=await execute('async page=>({viewport:page.viewportSize(),window:await page.evaluate(()=>({width:innerWidth,height:innerHeight,outerWidth,outerHeight,availableWidth:screen.availWidth,availableHeight:screen.availHeight})),version:await page.locator("[data-tid=\\"LoginForm;Login;lblProductVersion\\"]").innerText()})');
 if(geometry.viewport!==null||geometry.window.width<geometry.window.availableWidth*.9||!geometry.version.includes('7.4.2'))throw Error('Live geometry/build mismatch');
 await fs.writeFile(dir+'/geometry.json',JSON.stringify(geometry));
 await execute(`async page=>{await page.locator('[data-tid="LoginForm;Login;edtUsername"] input').fill(${JSON.stringify(user)});await page.locator('[data-tid="LoginForm;Login;btnLogin"]').click();await page.locator('[data-tid="MF;cntMain;tlbMainToolbar;btnAvatar"]').waitFor();return true;}`);
 const runtimeConfig={targetOrigin:new URL(config.loginomUrl).origin,targetBuild:'7.4.2'};
 const rawRuntime=createActionRuntime({pinned,execute,onRecord:record,...runtimeConfig,allowCandidate:true,artifactStore:session.artifactStore,...createCandidateNodeSupport(runtimeConfig)});
 wire=await createPublicNodeWire(rawRuntime,{directory:dir,browserSequence:()=>sequence});
 const ctx={execute,session,dir,fs,record,runtime:wire.runtime,rawRuntime,pinned,call,browserSequence:()=>sequence,
  armDateFlagReplyLoss:plan=>{if(replyLoss||!plan?.operationId||!plan.field||!Number.isInteger(plan.func)||!['DoDateTimeFirst','DoDateTimeLast','DoNumber','DoString'].includes(plan.flag))throw Error('One exact operator fault plan required');replyLoss={...plan,armed:true,consumed:false};},
  prepare:async(args)=>execute(makeWorkspacePrepareCode({loginomUrl:config.loginomUrl,compatibility:pinned.compatibility,sessionId:session.metadata.sessionId,timeoutMs:30000,...args}))};
 console.log(JSON.stringify({status:'READY',dir,sessionId:session.metadata.sessionId,runtime:session.metadata.clientRevision,archiveActive:session.metadata.archiveActive,geometry}));
 for await(const line of readline.createInterface({input:process.stdin})){
  if(!line.trim())continue;const c=JSON.parse(line);if(c.operator==='close'){operatorClosed=true;break;}
  try{const body=await fs.readFile(c.file,'utf8'),result=await new Function('ctx','return (async()=>{'+body+'})()')(ctx);await fs.writeFile(dir+'/'+c.id+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify({id:c.id,result}));}
  catch(e){console.log(JSON.stringify({id:c.id,error:e.message}));}
 }
}finally{await wire?.close();await client.close();await bridge.close();}
// The operator has already closed the UI package and awaited bridge cleanup.
// Retained diagnostic worker timers must not leave an idle harness behind.
if(operatorClosed)process.exit(0);
