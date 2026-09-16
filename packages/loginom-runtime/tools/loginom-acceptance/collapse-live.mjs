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
process.umask(0o077);
const option=k=>{const i=process.argv.indexOf(k);if(i<0||!process.argv[i+1])throw Error('Required '+k);return process.argv[i+1];};
const loginomUrl=option('--loginom-url'),user=option('--loginom-user'),storage=option('--storage'),packagePath=option('--package');
const readonlyFirst=process.argv.includes('--readonly-first')?JSON.parse(await fs.readFile(option('--readonly-first'),'utf8')):null;
if(readonlyFirst&&(process.argv.includes('--copy-to')||process.argv.includes('--new-draft')))throw Error('Readonly-first forbids draft/copy writes');
if(process.argv.includes('--reopen-case')&&(!readonlyFirst||!process.argv.includes('--public-user-v1')))throw Error('Automatic replay requires readonly-first and public user-v1');
const url=new URL(loginomUrl);
if(url.username||url.password||!/^\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(storage)||!packagePath.startsWith(storage+'/'))throw Error('Explicit safe URL and storage required');
const dir=process.cwd()+'/.dock/node16/live-'+Date.now();await fs.mkdir(dir+'/runtime',{recursive:true});
await fs.symlink(process.env.HOME+'/.loginom-dock/runtime/browsers',dir+'/runtime/browsers');
const session=await createSession({stateDir:dir,agent:'codex',adapterRevision:'node16-diagnostic',mode:'executor-replay'});
session.metadata.targetIdentity={origin:url.origin,loginom_build:'7.4.2'};
session.metadata.operatorPublicProfile=process.argv.includes('--public-user-v1')?'user-v1':'raw';
session.metadata.automaticReadonlyReopen=process.argv.includes('--reopen-case');
await fs.writeFile(dir+'/session.json',JSON.stringify(session.metadata,null,2));
const diagnostic={dropReply:null,dropUploadReply:null,dropped:[],nodeDrivers:new Map()};
const client=new Client({name:'collapse-live',version:'1'}),transport=new StdioClientTransport({command:process.execPath,
 args:[session.browserCli,'--config',session.browserConfig],env:{...getDefaultEnvironment(),PLAYWRIGHT_BROWSERS_PATH:session.browserRoot},stderr:'pipe'});
transport.stderr?.on('data',()=>{});let sequence=0,wire;
const record=createExecutionJournal({directory:dir,metadata:session.metadata});
const execute=async code=>{
 const r=await client.callTool({name:'browser_run_code_unsafe',arguments:{code}},undefined,{timeout:60000});
 await fs.writeFile(dir+'/browser-'+(++sequence)+'.json',JSON.stringify(r));
 const text=r.content.filter(c=>c.type==='text').map(c=>c.text).join('\n'),raw=text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/)?.[1];
 if(!raw)throw Error(text.slice(0,1000));const value=JSON.parse(raw);
 if(diagnostic.dropUploadReply&&value.action_key==='artifact.upload'&&value.operation_id===diagnostic.dropUploadReply&&value.output?.upload_submitted===true&&value.cleanup_complete===true){
  const lost={operation_id:diagnostic.dropUploadReply,browser_sequence:sequence,native_result_saved:true};diagnostic.dropUploadReply=null;diagnostic.dropped.push(lost);await fs.writeFile(dir+'/dropped-upload-replies.json',JSON.stringify(diagnostic.dropped,null,2));throw Error('Diagnostic lost upload acknowledgement after native completion');
 }
 const fault=diagnostic.dropReply,act=value.output?.value;
 if(fault&&value.operation_id===fault.operation_id&&act?.action_key==='ui.act'&&act.status==='SUCCEEDED'&&act.output?.gesture_applied===true&&code.includes(JSON.stringify('verb')+':'+JSON.stringify(fault.verb))){
  diagnostic.dropReply=null;const receipt={operation_id:fault.operation_id,verb:fault.verb,browser_sequence:sequence,gesture_applied:true};diagnostic.dropped.push(receipt);await fs.writeFile(dir+'/dropped-replies.json',JSON.stringify(diagnostic.dropped,null,2));throw Error('Diagnostic reply loss after a verified browser gesture');
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
  sessionId:session.metadata.sessionId,operationId:'prepare',intent:process.argv.includes('--new-draft')?'new_draft':'open_package',packagePath:process.argv.includes('--new-draft')?null:packagePath,timeoutMs:15000}));
 await fs.writeFile(dir+'/preparation.json',JSON.stringify(prep,null,2));if(prep.status!=='READY')throw Error('Saved package preparation failed');
 if(readonlyFirst){
  const {downloadReadonly,openReadonlyDirectory}=await import('./collapse/native-gates/readonly-download.mjs');
  if(readonlyFirst.package?.path!==packagePath||!readonlyFirst.source?.path?.startsWith(storage+'/'))throw Error('Readonly-first explicit file pair required');
  const start=sequence,downloads=[];
  await openReadonlyDirectory(execute,storage);
  for(const entry of [readonlyFirst.source,readonlyFirst.package]){
   if(!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error('Readonly-first frozen byte hash required');
   const first=sequence+1;
   const download=await downloadReadonly({execute,documentId:prep.document_id,path:entry.path,directory:dir+'/readonly-downloads',expectedSha256:entry.sha256});
   delete download.base64;downloads.push({...download,raw_observation_refs:[`browser-${first}.json`]});
  }
  await fs.writeFile(dir+'/readonly-first.json',JSON.stringify({kind:'collapse_readonly_first_diagnostic_v1',session_id:session.metadata.sessionId,document_id:prep.document_id,package_path:packagePath,start_sequence:start,end_sequence:sequence,executor_created:false,downloads},null,2));
  await execute(`async page=>{await page.locator('[data-tid="'+${JSON.stringify(prep.workflow_ref.tab_tid)}+'"]').click();return true}`);
 }
 if(process.argv.includes('--copy-to')||(!readonlyFirst&&prep.workflow_ref.navigation_path.some(c=>c.label.endsWith('(только чтение)')))){
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
 const config={targetOrigin:url.origin,targetBuild:'7.4.2'},support=createCandidateNodeSupport(config);
 const rawRuntime=createActionRuntime({pinned:{actions:new Map(actions.map(a=>[a.action_key,a])),selectors:new Map(selectors.map(s=>[s.symbol,s])),pins:{}},
  execute,onRecord:record,...config,allowCandidate:true,artifactStore:session.artifactStore,...support,
  nodeApplyDriverFactory:options=>{diagnostic.nodeDrivers.set(options.operation.id,options);return support.nodeApplyDriverFactory(options);}});
 wire=await createPublicNodeWire(rawRuntime,{directory:dir,browserSequence:()=>sequence,userProfile:process.argv.includes('--public-user-v1')});
 const ctx={execute,session,dir,fs,record,prep,diagnostic,runtime:wire.runtime,rawRuntime,readonlyFirst,browserSequence:()=>sequence};
 if(session.metadata.automaticReadonlyReopen){
  try{const {reopenCase}=await import('./collapse/native-gates/reopen-case.mjs');await fs.writeFile(dir+'/automatic-reopen.json',JSON.stringify(await reopenCase(ctx),null,2));}
  catch(error){await fs.writeFile(dir+'/automatic-reopen.json',JSON.stringify({status:'FAILED',error:error.message},null,2));}
 }
 console.log(JSON.stringify({dir,status:'READY',runtime:session.metadata.clientRevision}));
 for await(const line of readline.createInterface({input:process.stdin})) {
  if(!line.trim())continue;const command=JSON.parse(line);if(command.operator==='close')break;
  try{const body=await fs.readFile(command.file,'utf8');const result=await new Function('ctx','return (async()=>{'+body+'})()')(ctx);
   await fs.writeFile(dir+'/'+command.id+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify({id:command.id,result}));
  }catch(e){console.log(JSON.stringify({id:command.id,error:e.message}));}
 }
}finally{await wire?.close();await client.callTool({name:'browser_close',arguments:{}}).catch(()=>{});await client.close();process.stdin.pause();process.stdin.unref?.();}
