// Operator-only source-runtime diagnostic. Public calls use the real MCP wire;
// a script may inspect the owned browser for diagnosis, never as Hermes guidance.
import fs from 'node:fs/promises';
import readline from 'node:readline';
import {Client} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import {createSession} from '../../client/lib/session.mjs';
import {makeWorkspacePrepareCode} from '../../client/lib/workspace.mjs';
import {createActionRuntime} from '../../client/lib/executor.mjs';
import {createCandidateNodeSupport} from '../../client/lib/node-support.mjs';
import {createExecutionJournal} from '../../client/lib/execution-journal.mjs';
import {createPublicNodeWire} from './public-node-wire.mjs';
import {createNetworkFaultProxy} from './network-fault-proxy.mjs';
import {createStorageBinding,withStorageIdentity} from '../../client/lib/storage-policy.mjs';
process.umask(0o077);
// This interactive harness must not open a package and immediately hit EOF.
// Automated callers that provide a complete operator stream opt in explicitly.
if(!process.stdin.isTTY&&!process.argv.includes('--allow-piped-operators'))throw Error('Interactive diagnostic harness requires a TTY (or explicit --allow-piped-operators)');
const option=k=>{const i=process.argv.indexOf(k);if(i<0||!process.argv[i+1])throw Error('Required '+k);return process.argv[i+1];};
const loginomUrl=option('--loginom-url'),user=option('--loginom-user'),storage=option('--storage'),packagePath=option('--package');
const url=new URL(loginomUrl);
if(url.username||url.password||!/^\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(storage)||!packagePath.startsWith(storage+'/'))throw Error('Explicit safe URL and storage required');
const dir=process.cwd()+'/.dock/text-export/live-'+Date.now();await fs.mkdir(dir+'/runtime',{recursive:true});
await fs.symlink(process.env.HOME+'/.loginom-dock/runtime/browsers',dir+'/runtime/browsers');
const session=await createSession({stateDir:dir,agent:'codex',adapterRevision:'text-export-diagnostic',mode:'executor-replay',storageDirectories:{packages:storage,inputs:storage,exports:storage}});
session.metadata.targetIdentity={origin:url.origin,loginom_build:'7.4.2'};
await fs.writeFile(dir+'/session.json',JSON.stringify(session.metadata,null,2));
const networkFault=process.argv.includes('--network-fault-proxy')?await createNetworkFaultProxy(url.origin):null;
if(networkFault){const config=JSON.parse(await fs.readFile(session.browserConfig,'utf8'));config.browser.launchOptions.proxy={server:networkFault.server};await fs.writeFile(session.browserConfig,JSON.stringify(config));}
const client=new Client({name:'text-export-live',version:'1'}),transport=new StdioClientTransport({command:process.execPath,
 args:[session.browserCli,'--config',session.browserConfig],env:{...getDefaultEnvironment(),PLAYWRIGHT_BROWSERS_PATH:session.browserRoot},stderr:'pipe'});
transport.stderr?.on('data',()=>{});let sequence=0,wire,outputDoneReplyDropped=false,inputDoneConnectionDropped=false;
const diagnosticFault={hideOutputReceipt:process.argv.includes('--unknown-output-done-once'),operationId:null};
const record=createExecutionJournal({directory:dir,metadata:session.metadata});
const execute=async code=>{
 const r=await client.callTool({name:'browser_run_code_unsafe',arguments:{code}},undefined,{timeout:60000});
 await fs.writeFile(dir+'/browser-'+(++sequence)+'.json',JSON.stringify(r));
 const text=r.content.filter(c=>c.type==='text').map(c=>c.text).join('\n'),raw=text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/)?.[1];
 if(!raw)throw Error(text.slice(0,1000));
 const value=JSON.parse(raw);
 if(diagnosticFault.hideOutputReceipt&&diagnosticFault.operationId
   &&value.output?.state==='completed'&&value.output.receipt?.operation_id===diagnosticFault.operationId){
  await fs.appendFile(dir+'/hidden-output-receipt.jsonl',JSON.stringify({browser_sequence:sequence,operation_id:diagnosticFault.operationId,operator_injected:true})+'\n');
  return {...value,output:{state:'missing'}};
 }
 const effect=value.action_key==='node.apply.transport'?value.output?.value:value;
 // Explicit operator-only loss AFTER Loginom completed the original gesture.
 // The browser receipt remains available for normal recovery; never suppress
 // a second response or inject this fault into a Hermes corpus run.
 if((process.argv.includes('--drop-output-done-once')||diagnosticFault.hideOutputReceipt)&&!outputDoneReplyDropped
   &&effect?.action_key==='ui.act'&&effect.status==='SUCCEEDED'&&effect.trace?.some(e=>e.event==='output_port_finish_verified')){
  outputDoneReplyDropped=true;
  diagnosticFault.operationId=effect.operation_id;
  await fs.writeFile(dir+'/injected-output-response-loss.json',JSON.stringify({browser_sequence:sequence,operation_id:effect.operation_id,status:effect.status,after_confirmed_gesture:true}));
  throw Error('Operator injected loss of confirmed output Done response');
 }
 if(process.argv.includes('--drop-input-done-connection-once')&&!inputDoneConnectionDropped
   &&effect?.action_key==='ui.act'&&effect.status==='SUCCEEDED'&&effect.trace?.some(e=>e.event==='input_port_finish_verified')){
  if(!networkFault)throw Error('Input Done fault requires the diagnostic network proxy');
  inputDoneConnectionDropped=true;
  const transportFault=networkFault.disconnect();
  await fs.writeFile(dir+'/injected-input-connection-loss.json',JSON.stringify({browser_sequence:sequence,operation_id:effect.operation_id,status:effect.status,after_confirmed_gesture:true,...transportFault}));
  throw Error('Operator injected transport loss after confirmed input Done');
 }
 return value;
};
try {
 await client.connect(transport);await client.callTool({name:'browser_navigate',arguments:{url:loginomUrl}});
 const geometry=await execute('async page=>({viewport:page.viewportSize(),window:await page.evaluate(()=>({width:innerWidth,height:innerHeight,outerWidth,outerHeight,availableWidth:screen.availWidth,availableHeight:screen.availHeight}))})');
 await fs.writeFile(dir+'/geometry.json',JSON.stringify(geometry));
 if(geometry.viewport!==null||geometry.window.width!==geometry.window.outerWidth||geometry.window.width<geometry.window.availableWidth*.9)throw Error('Visible native window is not maximized');
 await execute(`async page=>{await page.locator('[data-tid="LoginForm;Login;edtUsername"] input').fill(${JSON.stringify(user)});await page.locator('[data-tid="LoginForm;Login;btnLogin"]').click();await page.locator('[data-tid="MF;cntMain;tlbMainToolbar;btnAvatar"]').waitFor();return true}`);
 let prep=await execute(makeWorkspacePrepareCode({loginomUrl,compatibility:{profile_id:'loginom-7.4.2-macos-chromium',loginom_build:'7.4.2',platform:'macos',browser:'chromium'},
  sessionId:session.metadata.sessionId,operationId:'prepare',intent:'open_package',packagePath,timeoutMs:15000}));
 await fs.writeFile(dir+'/preparation.json',JSON.stringify(prep,null,2));if(prep.status!=='READY')throw Error('Saved package preparation failed');
 if(process.argv.includes('--copy-to')||prep.workflow_ref.navigation_path.some(c=>c.label.endsWith('(только чтение)'))){
  if(!process.argv.includes('--copy-to'))throw Error('Diagnostic package is read-only; use a separate writable copy');
  const copy=option('--copy-to');
  if(!copy.startsWith(storage+'/')||!/^\/[A-Za-z0-9_./-]+\.lgp$/.test(copy)||copy.includes('..')||copy===packagePath)throw Error('Explicit distinct diagnostic copy required');
  await execute(`async page=>{await page.locator('[data-tid="MF;cntMain;tlbMainToolbar;btnPackagesMenu"]').click();await page.locator('[data-tid="MF;MainMenuForm;btnSaveAsPackage"]').click();await page.locator('[data-tid="SaveDialogForm;edtFileName"] input').fill(${JSON.stringify(copy)});await page.locator('[data-tid="SaveDialogForm;btnOpen"]').click();await page.locator('[data-tid="SaveDialogForm"]').waitFor({state:'hidden'});await page.locator('[data-tid="MF;MainMenuForm;btnSaveAsPackage"]').waitFor({state:'hidden'});return await page.locator('[data-tid*="cnrNaviMode;b.s_Сервер>Пакеты>"]').evaluateAll(es=>es.filter(e=>e.getBoundingClientRect().width>0).map(e=>({tid:e.getAttribute('data-tid'),label:e.textContent.trim()})))}`);
  prep=await execute(makeWorkspacePrepareCode({loginomUrl,compatibility:{profile_id:'loginom-7.4.2-macos-chromium',loginom_build:'7.4.2',platform:'macos',browser:'chromium'},sessionId:session.metadata.sessionId,operationId:'prepare-copy',intent:'open_package',packagePath:copy,timeoutMs:15000}));
  if(prep.status!=='READY'||prep.workflow_ref.navigation_path.some(c=>c.label.endsWith('(только чтение)')))throw Error('Diagnostic copy not writable');
  // Save As updates the package label before navigation tids. Complete a
  // separately observed close/reopen before issuing a bound node request.
  await execute(`async page=>{await page.locator('[data-tid="MF;cntMain;tlbMainToolbar;btnPackagesMenu"]').click();const header=page.locator('[data-tid="MF;MainMenuForm;pnlSaveClosePackage;p.h;p.t"]');await header.waitFor();if((await header.innerText()).trim()!==${JSON.stringify(prep.workflow_ref.navigation_path[2].label)})throw Error('Diagnostic copy menu ownership changed');return true}`);
  await execute(`async page=>{await page.locator('[data-tid="MF;MainMenuForm;btnClosePackage"]').click();await page.locator('[data-tid="'+${JSON.stringify(prep.workflow_ref.tab_tid)}+'"]').waitFor({state:'hidden'});return true}`);
  prep=await execute(makeWorkspacePrepareCode({loginomUrl,compatibility:{profile_id:'loginom-7.4.2-macos-chromium',loginom_build:'7.4.2',platform:'macos',browser:'chromium'},sessionId:session.metadata.sessionId,operationId:'prepare-copy-reopened',intent:'open_package',packagePath:copy,timeoutMs:15000}));
  if(prep.status!=='READY'||prep.workflow_ref.navigation_path.some(c=>c.label.endsWith('(только чтение)')))throw Error('Diagnostic copy reopen not writable');
  await fs.writeFile(dir+'/copy-preparation.json',JSON.stringify({path:copy,preparation:prep},null,2));
  // Dismiss only the now-resolved warning for the original read-only seed.
  // Other notifications remain visible and continue to block node operations.
  await execute(`async page=>{const warnings=page.locator('[data-tid="toast"]');for(const toast of await warnings.all()){const text=await toast.innerText();if(text.includes(${JSON.stringify('Пакет "'+packagePath+'" открыт только на чтение')})&&text.includes('Сохранение возможно только под другим именем.'))await toast.locator('[data-tid="toast;p.h;close"]').click();}return true;}`);
 }
 const actions=JSON.parse(await fs.readFile('executor/catalog/actions.json')).actions,selectors=JSON.parse(await fs.readFile('executor/catalog/selectors.json')).selectors;
 for(const a of actions)if(['package.save_as','package.save_checkpoint'].includes(a.action_key))a.effect.allowed_roots=[storage];
 const config={targetOrigin:url.origin,targetBuild:'7.4.2',storageDirectories:{packages:storage,inputs:storage,exports:storage}},support=createCandidateNodeSupport(config);
 const binding=createStorageBinding({sessionId:session.metadata.sessionId,origin:url.origin,build:'7.4.2',documentId:prep.document_id,account:user,directories:config.storageDirectories});
 const guardedExecute=code=>execute(withStorageIdentity(code,binding));
 const rawRuntime=createActionRuntime({pinned:{actions:new Map(actions.map(a=>[a.action_key,a])),selectors:new Map(selectors.map(s=>[s.symbol,s])),pins:{}},
  execute:guardedExecute,onRecord:record,...config,allowCandidate:true,artifactStore:session.artifactStore,...support});
 wire=await createPublicNodeWire(rawRuntime,{directory:dir,browserSequence:()=>sequence});
 const ctx={execute,guardedExecute,session,dir,fs,record,prep,runtime:wire.runtime,rawRuntime,networkFault,diagnosticFault};
 console.log(JSON.stringify({dir,status:'READY',runtime:session.metadata.clientRevision}));
 for await(const line of readline.createInterface({input:process.stdin})) {
  if(!line.trim())continue;const command=JSON.parse(line);if(command.operator==='close')break;
  try{const body=await fs.readFile(command.file,'utf8');const result=await new Function('ctx','return (async()=>{'+body+'})()')(ctx);
   await fs.writeFile(dir+'/'+command.id+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify({id:command.id,result}));
  }catch(e){console.log(JSON.stringify({id:command.id,error:e.message}));}
 }
}finally{await wire?.close();await client.callTool({name:'browser_close',arguments:{}}).catch(()=>{});await client.close();await networkFault?.close();process.stdin.pause();process.stdin.unref?.();}
