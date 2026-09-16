// Operator-only acceptance of private verified-source -> configured node.
// --execute checks new process ownership; --read-output reads its bound Table.
// This harness does not prove package persistence or replace the independent audit.
import fs from 'node:fs/promises';
import readline from 'node:readline';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Client} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import {createSession} from '../../client/lib/session.mjs';
import {makeWorkspacePrepareCode} from '../../client/lib/workspace.mjs';
import {makeWorkspaceUiCode} from '../../client/lib/workspace-ui.mjs';
import {makePackageReopenQaCode} from './package-reopen-qa.mjs';
import {makeCapabilityCode,createActionRuntime} from '../../client/lib/executor.mjs';
import {createTextImportNodeSupport} from '../../client/lib/text-import-node.mjs';
import {createExecutionJournal} from '../../client/lib/execution-journal.mjs';
import {createPublicNodeWire} from './public-node-wire.mjs';
process.umask(0o077);
const option=name=>{const i=process.argv.indexOf(name);if(i<0||!process.argv[i+1])throw Error('Required '+name);return process.argv[i+1];};
const loginomUrl=option('--loginom-url'),user=option('--loginom-user'),storage=option('--storage');
const countIndex=process.argv.indexOf('--columns'),count=countIndex<0?3:Number(process.argv[countIndex+1]);if(!Number.isInteger(count)||count<1||count>1000)throw Error('Column count must be 1..1000');
const url=new URL(loginomUrl);if(url.username||url.password || !/^\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(storage))throw Error('Explicit safe URL and storage required');
const encodingIndex=process.argv.indexOf('--encoding'),encoding=encodingIndex<0?'UTF-8':process.argv[encodingIndex+1];
const codecs={'UTF-8':'utf-8','Windows-1251':'cp1251','Windows-1252':'cp1252','UTF-16 LE':'utf-16-le','UTF-16 BE':'utf-16-be'};
if(!Object.hasOwn(codecs,encoding))throw Error('Unsupported fixture encoding');
const delimiter=process.argv.includes('--tsv')?'\t':';';
const skipIndex=process.argv.indexOf('--rows-to-skip'),rowsToSkip=skipIndex<0?0:Number(process.argv[skipIndex+1]);
if(!Number.isInteger(rowsToSkip)||rowsToSkip<0||rowsToSkip>10)throw Error('Fixture skip count must be 0..10');
const decimalSeparator=process.argv.includes('--decimal-comma')?',':'.';
const firstLineAsTitle=!process.argv.includes('--no-header');
if(!firstLineAsTitle&&process.argv.includes('--empty'))throw Error('A headerless empty file has no source schema');
if(process.argv.includes('--close')&&process.argv.includes('--execute'))throw Error('Choose Close or Execute');
const settingsPatchIndex=process.argv.indexOf('--settings-patch');
const settingsPatch=settingsPatchIndex<0?null:JSON.parse(process.argv[settingsPatchIndex+1]);
if(settingsPatch!==null&&!process.argv.includes('--existing-patch'))throw Error('--settings-patch requires --existing-patch');
const replacementIndex=process.argv.indexOf('--replace-source'),replaceSource=replacementIndex<0?null:process.argv[replacementIndex+1];
if(replaceSource&&!['same-schema','changed-schema'].includes(replaceSource))throw Error('Unknown replacement fixture');
if(replaceSource&&(!process.argv.includes('--existing-patch')||count!==3||encoding!=='UTF-8'||!firstLineAsTitle||rowsToSkip!==0||delimiter!==';'||settingsPatch))throw Error('Replacement fixture requires the standard seed and no settings override');
const existingPatch=process.argv.includes('--existing-patch'),seedReadOutput=process.argv.includes('--seed-read-output');
const typedFixture=process.argv.includes('--typed-fixture');
const wideMixedFixture=process.argv.includes('--wide-mixed-fixture');
if(wideMixedFixture&&(count<10||typedFixture||existingPatch||replaceSource))throw Error('Wide mixed fixture requires a new import with at least 10 columns');
const largeRowsIndex=process.argv.indexOf('--large-import-rows'),largeRows=largeRowsIndex<0?0:Number(process.argv[largeRowsIndex+1]);
if(largeRowsIndex>=0&&(!Number.isInteger(largeRows)||largeRows<100000||largeRows>(typedFixture?450000:2500000)||count!==3
  ||encoding!=='UTF-8'||!firstLineAsTitle||delimiter!==';'||rowsToSkip!==0||process.argv.includes('--empty')))
 throw Error('Large fixture requires 100000..2500000 standard rows or up to 450000 typed rows in UTF-8');
const integratedDelivery=process.argv.includes('--integrated-delivery');
const deliveryStartChild=process.argv.includes('--delivery-start-child');
if(deliveryStartChild&&!integratedDelivery)throw Error('Child-directory start requires integrated delivery');
const lostDeliveryReplies=process.argv.includes('--delivery-lost-replies'),lostDeliveryStages=new Set();
if(lostDeliveryReplies&&!integratedDelivery)throw Error('Delivery loss fixture requires integrated delivery');
const conflictIndex=process.argv.indexOf('--delivery-conflict'),deliveryConflict=conflictIndex<0?null:process.argv[conflictIndex+1];
if(deliveryConflict&&(!integratedDelivery||!['reject','replace'].includes(deliveryConflict)))throw Error('Delivery conflict fixture requires integrated delivery and reject/replace');
const deliveryPauseIndex=process.argv.indexOf('--delivery-pause-after'),deliveryPause=deliveryPauseIndex<0?null:process.argv[deliveryPauseIndex+1];
if(deliveryPause&&(!integratedDelivery||!['upload','verify'].includes(deliveryPause)||lostDeliveryReplies||deliveryConflict))throw Error('Delivery pause requires an isolated integrated upload/verify boundary');
const deliveryBrowserLoss=process.argv.includes('--delivery-browser-loss');
if(deliveryBrowserLoss&&deliveryPause!=='upload')throw Error('Browser-loss fixture requires a delivery pause after upload');
const deliveryPauseController=new AbortController();
if(integratedDelivery&&(existingPatch||process.argv.includes('--missing-source')||replaceSource))throw Error('Integrated delivery fixture requires a new source');
const mappedOutput=process.argv.includes('--mapped-output');
if(mappedOutput&&(count<2||typedFixture||process.argv.includes('--edit-fields')||process.argv.includes('--only-column')))throw Error('Mapped output fixture requires an unedited import with at least two columns');
const onlyColumnIndex=process.argv.indexOf('--only-column'),onlyColumn=onlyColumnIndex<0?null:process.argv[onlyColumnIndex+1];
if(onlyColumn&&(!/^[A-Za-z][A-Za-z0-9]*$/.test(onlyColumn)||process.argv.includes('--existing-patch')||process.argv.includes('--edit-fields')))throw Error('Only-column fixture requires a new unedited import');
if(typedFixture&&(count!==3||encoding!=='UTF-8'||!firstLineAsTitle||rowsToSkip!==0||delimiter!==';'||settingsPatch||replaceSource||process.argv.includes('--existing-patch')||process.argv.includes('--empty')||process.argv.includes('--edit-fields')))throw Error('Typed fixture requires standard new import');
const missingSource=process.argv.includes('--missing-source');
const saveConflict=process.argv.includes('--save-conflict');
const saveCheckpoint=process.argv.includes('--save-checkpoint')||saveConflict;
const saveReopen=process.argv.includes('--save-reopen')||saveCheckpoint;
if(saveCheckpoint&&process.argv.includes('--save-reopen'))throw Error('Choose one save acceptance mode');
const saveActionKey=saveCheckpoint?'package.save_checkpoint':'package.save_as';
if(saveReopen&&(!process.argv.includes('--execute')||!process.argv.includes('--read-output')||missingSource||existingPatch))throw Error('Save/reopen fixture requires a new executed import with output');
if(missingSource&&(process.argv.includes('--existing-patch')||replaceSource))throw Error('Missing-source fixture requires a new node');
if(seedReadOutput&&(!existingPatch||!process.argv.includes('--read-output')))throw Error('--seed-read-output requires an existing patch with output reading');
if(existingPatch&&(!process.argv.includes('--execute')||process.argv.includes('--edit-fields')))throw Error('--existing-patch requires Execute and a separate unedited baseline');
const finish=process.argv.includes('--close')?'close':process.argv.includes('--execute')?'execute':'done',readOutput=process.argv.includes('--read-output');
const pauseAfterConfigure=process.argv.includes('--pause-after-configure');
const asyncNode=process.argv.includes('--async-node');
const pauseDuringWait=process.argv.includes('--pause-during-execution-wait');
const sourcePreflightRefusal=process.argv.includes('--source-preflight-refusal');
if(pauseDuringWait&&(!asyncNode||finish!=='execute'||existingPatch||pauseAfterConfigure||saveReopen))throw Error('Read-wait pause requires an isolated async Execute');
const publicApi=process.argv.includes('--public-api');
if(publicApi&&(asyncNode||deliveryPause||pauseAfterConfigure))throw Error('Public wire fixture currently requires an unpaused node and delivery');
const requestServerStop=process.argv.includes('--request-server-stop');
if(requestServerStop&&(!asyncNode||finish!=='execute'||pauseAfterConfigure||existingPatch||saveReopen))throw Error('Server stop fixture requires a new async Execute without pause/save');
if(asyncNode&&existingPatch)throw Error('Async fixture requires a new import');
const pausePhase=process.argv.includes('--pause-after-finish')?'finish':process.argv.includes('--pause-after-output-mapping')?'output_mapping':'configure';
if(pausePhase!=='configure'&&!pauseAfterConfigure)throw Error('Later boundary requires the diagnostic pause fixture');
if(process.argv.includes('--pause-after-finish')&&process.argv.includes('--pause-after-output-mapping'))throw Error('Choose one pause boundary');
const resumeAfterConfigure=process.argv.includes('--resume-after-configure');
const mutatePausedNull=process.argv.includes('--mutate-paused-null');
const mutatePausedCompletion=process.argv.includes('--mutate-paused-completion');
const mutatePaused=mutatePausedNull||mutatePausedCompletion;
if(mutatePaused&&!resumeAfterConfigure)throw Error('Paused mutation requires the resume fixture');
if(mutatePausedCompletion&&(mutatePausedNull||pausePhase!=='output_mapping'))throw Error('Completion mutation requires only the mapped boundary');
if(resumeAfterConfigure&&!pauseAfterConfigure)throw Error('Resume fixture requires the configuration pause');
if(pauseAfterConfigure&&(!process.argv.includes('--diagnose')||existingPatch||saveReopen||missingSource))throw Error('Phase pause requires a new diagnostic import');
if(readOutput&&finish!=='execute')throw Error('--read-output requires --execute');
const dir=process.cwd()+'/.dock/text-import-v3/'+finish+'-'+Date.now();await fs.mkdir(dir+'/runtime',{recursive:true});await fs.symlink(process.env.HOME+'/.loginom-dock/runtime/browsers',dir+'/runtime/browsers');
const session=await createSession({stateDir:dir,agent:'codex',adapterRevision:'text-import-done-qa-v1',mode:'executor-replay'});
session.metadata.targetIdentity={origin:url.origin,loginom_build:'7.4.2'};
await fs.writeFile(dir+'/session.json',JSON.stringify(session.metadata,null,2));
const client=new Client({name:'node-import-done-qa',version:'1'});
const transport=new StdioClientTransport({command:process.execPath,args:[session.browserCli,'--config',session.browserConfig],env:{...getDefaultEnvironment(),PLAYWRIGHT_BROWSERS_PATH:session.browserRoot},stderr:'pipe'});transport.stderr?.on('data',()=>{});
let sequence=0,diagnosticContext={},serverStopRequested=false,publicWire,waitPauseRequested=false;const pauseController=new AbortController();
const journal=createExecutionJournal({directory:dir,metadata:session.metadata});
const record=async event=>{const saved=await journal(event);
 if(pauseDuringWait&&!waitPauseRequested&&event.phase==='node_phase_prepared'&&event.receipt?.phase==='execute') {
  waitPauseRequested=true;
  // The next browser read yields after the shell claims execute. Cancel while
  // that read is in flight, never at the preceding finish checkpoint.
  setTimeout(()=>{
   const before=sequence,cancelled=diagnosticContext.runtime.cancelNodeApply(event.operation_id),after=sequence;
   diagnosticContext.waitCancel={before,after,cancelled,boundary:'execute_wait'};
  },0);
 }
 if(deliveryPause&&(deliveryPause==='upload'&&event.phase==='artifact_delivery_upload_receipt'&&event.operation_id==='deliver-source'
   ||deliveryPause==='verify'&&event.phase==='verification_completed'&&event.operation_id==='deliver-source:verify'))
  deliveryPauseController.abort(new Error('Operator delivery pause after '+deliveryPause));
 if(pauseAfterConfigure&&event.phase==='node_phase_completed'&&event.receipt?.phase===pausePhase) {
  if(asyncNode) {
   const before=sequence,cancelled=diagnosticContext.runtime.cancelNodeApply(event.operation_id),after=sequence;
   await fs.writeFile(dir+'/async-cancel.json',JSON.stringify({before,after,cancelled,boundary:pausePhase},null,2));
   if(before!==after)throw Error('Local cancellation invoked browser');
  } else pauseController.abort(new Error('Operator diagnostic pause after accepted '+pausePhase));
 }
 return saved;};
const execute=async code=>{
 const reply=await client.callTool({name:'browser_run_code_unsafe',arguments:{code}},undefined,{timeout:60000});
 await fs.writeFile(dir+'/browser-'+(++sequence)+'.json',JSON.stringify(reply));
 if(requestServerStop&&!serverStopRequested&&diagnosticContext.request) {
  const id=diagnosticContext.request.operation_id,status=diagnosticContext.runtime.nodeApplyStatus(id);
  if(status.state==='running'&&status.progress?.pending_phase==='execute'&&status.progress.execution?.status==='pending') {
   const before=sequence,requested=diagnosticContext.runtime.stopNodeApply(id),after=sequence;
   if(before!==after)throw Error('Stop request invoked browser concurrently');serverStopRequested=true;
   await fs.writeFile(dir+'/server-stop-request.json',JSON.stringify({status,requested,before,after},null,2));
  }
 }
 const text=reply.content.filter(x=>x.type==='text').map(x=>x.text).join('\n'),raw=text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/)?.[1];if(!raw)throw Error(text);const parsed=JSON.parse(raw);
 if(lostDeliveryReplies&&[['artifact.upload','deliver-source:upload'],['artifact.download','deliver-source:verify']].some(([action,id])=>parsed.action_key===action&&parsed.operation_id===id)&&!lostDeliveryStages.has(parsed.action_key)) {
  lostDeliveryStages.add(parsed.action_key);
  await fs.writeFile(dir+'/lost-'+parsed.action_key+'.json',JSON.stringify({action_key:parsed.action_key,operation_id:parsed.operation_id,browser_reply:sequence,raw_status:parsed.status},null,2));
  throw Error('Injected lost delivery response after the browser stored its receipt');
 }
 return parsed;
};
console.log(JSON.stringify({dir,stage:'starting',runtime:session.metadata.clientRevision}));
try {
 await client.connect(transport);await client.callTool({name:'browser_navigate',arguments:{url:loginomUrl}});
 const geometry=await execute(`async page=>({viewport:page.viewportSize(),window:await page.evaluate(()=>({width:innerWidth,height:innerHeight,outerWidth,outerHeight,availableWidth:screen.availWidth,availableHeight:screen.availHeight}))})`);
 await fs.writeFile(dir+'/browser-geometry.json',JSON.stringify(geometry,null,2));
 if(geometry.viewport!==null||geometry.window.width!==geometry.window.outerWidth||geometry.window.width<geometry.window.availableWidth*0.9)throw Error('Visible browser is not maximized with a native viewport');
 await execute(`async page=>{await page.locator('[data-tid="LoginForm;Login;edtUsername"] input').fill(${JSON.stringify(user)});await page.locator('[data-tid="LoginForm;Login;btnLogin"]').click();await page.locator('[data-tid="MF;cntMain;tlbMainToolbar;btnAvatar"]').waitFor();return true}`);
 const prep=await execute(makeWorkspacePrepareCode({loginomUrl,compatibility:{profile_id:'loginom-7.4.2-macos-chromium',loginom_build:'7.4.2',platform:'macos',browser:'chromium'},sessionId:session.metadata.sessionId,operationId:'prepare',timeoutMs:15000}));
 if(prep.status!=='READY')throw Error('Workspace preparation failed');await fs.writeFile(dir+'/preparation.json',JSON.stringify(prep,null,2));
 const name='Dock03-done-'+Date.now()+(delimiter==='\t'?'.tsv':'.csv');
 let bytes=Buffer.from(count===3?'Id;Title;Amount\n1;"one;two";1.23456789012345\n2;"";-2.5\n3;NULL;0\n':Array.from({length:count},(_,i)=>'Field'+String(i+1).padStart(2,'0')).join(';')+'\n'+Array.from({length:count},(_,i)=>i===count-1?'1.23456789012345':String(i+1)).join(';')+'\n'+Array.from({length:count},(_,i)=>String(-i-1)).join(';')+'\n');
 if(wideMixedFixture)bytes=Buffer.from(Array.from({length:count},(_,i)=>'Field'+String(i+1).padStart(2,'0')).join(';')+'\n'
  +[0,1].map(row=>Array.from({length:count},(_,i)=>i===0?String(row+1):i===count-1?(row?'-2.5':'1.23456789012345'):'value_'+row+'_'+i).join(';')).join('\n')+'\n');
 if(typedFixture)bytes=Buffer.from('Flag;Moment;Note\ntrue;29.02.2024 23:59:58.123;leap\nfalse;01.01.2000 00:00:00.001;epoch\nNULL;NULL;NULL\n');
 if(largeRows)bytes=Buffer.from(typedFixture?'Flag;Moment;Note\n'+'true;29.02.2024 23:59:58.123;leap\n'.repeat(largeRows):'Id;Title;Amount\n'+'1;z;0\n'.repeat(largeRows));
 let fixtureText=bytes.toString('utf8');
 if(!firstLineAsTitle)fixtureText=fixtureText.slice(fixtureText.indexOf('\n')+1);
 if(process.argv.includes('--empty'))fixtureText=fixtureText.split('\n')[0]+'\n';
 if(decimalSeparator===',')fixtureText=fixtureText.replaceAll('1.23456789012345','1,23456789012345').replaceAll('-2.5','-2,5');
 if(encoding!=='UTF-8')fixtureText=fixtureText.replace('one;two',encoding==='Windows-1252'?'Ångström;été':'Строка;Ёж');
 fixtureText=fixtureText.replaceAll(';',delimiter);
 fixtureText=Array.from({length:rowsToSkip},(_,i)=>'Ignored preamble '+(i+1)+'\n').join('')+fixtureText;
 bytes=Buffer.from(fixtureText);
 if(encoding!=='UTF-8'){const text=fixtureText;
  const encoded=spawnSync('python3',['-c','import sys; sys.stdout.buffer.write(sys.stdin.read().encode(sys.argv[1]))',codecs[encoding]],{input:text});
  if(encoded.status!==0)throw Error('Fixture encoding failed');bytes=encoded.stdout;
 }
 await fs.writeFile(dir+'/'+name,bytes);
 const artifact=await session.artifactStore.admit({sourcePath:dir+'/'+name,name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),upload:{directory:storage,overwrite:'replace'}});
 await fs.writeFile(dir+'/artifact.json',JSON.stringify(artifact,null,2));
 const actions=JSON.parse(await fs.readFile('executor/catalog/actions.json')).actions,selectors=JSON.parse(await fs.readFile('executor/catalog/selectors.json')).selectors;
 if(saveReopen)actions.find(a=>a.action_key===saveActionKey).effect.allowed_roots=[storage];
 let runtime=createActionRuntime({pinned:{actions:new Map(actions.map(a=>[a.action_key,a])),selectors:new Map(selectors.map(s=>[s.symbol,s])),pins:{}},execute,onRecord:record,targetOrigin:url.origin,targetBuild:'7.4.2',allowCandidate:true,artifactStore:session.artifactStore,
   ...createTextImportNodeSupport({targetOrigin:url.origin,targetBuild:'7.4.2'})});
 if(publicApi){publicWire=await createPublicNodeWire(runtime,{directory:dir,browserSequence:()=>sequence});runtime=publicWire.runtime;}
 const storagePrefix=integratedDelivery&&!deliveryStartChild?null:await execute(`async page=>{const find=t=>page.locator('[data-tid='+JSON.stringify(t)+']');await find('MF;cntMain;tlbMainToolbar;btnFilestorage').click();await page.locator('[data-tid$=";FileStorageForm;pnlFileStorage;tbl"]').waitFor();const tid=await page.locator('[data-tid^="MF;cntMain;cntWorkspace;Workspace;t.br;tb"].x-tab-active').getAttribute('data-tid');const prefix='MF;TF'+(tid.match(/;tb(-\\d+)?$/)?.[1]??'');for(const part of ${JSON.stringify(storage.split('/').filter(Boolean))})await find(prefix+';FileStorageForm;colName_'+part).dblclick();await find(prefix+';FileStorageForm;pnlFileStorage;tbl').waitFor();await find(prefix+';cnrNaviMode;b.s_Сервер>Файлы>'+${JSON.stringify(storage.split('/').filter(Boolean).join('>'))}).waitFor();return prefix}`);
 if(deliveryStartChild) {
  const child='Dock03-start-'+Date.now();
  // Operator fixture setup from E2E filestorage.CreateFolderInCurrent. Inspect
  // the exact current folder and visible native controls before the single click.
  const setup=await execute(`async page=>{
   const at=t=>page.locator('[data-tid='+JSON.stringify(t)+']'),prefix=${JSON.stringify(storagePrefix)},name=${JSON.stringify(child)};
   const path=prefix+';cnrNaviMode;b.s_Сервер>Файлы>'+${JSON.stringify(storage.split('/').filter(Boolean).join('>'))};
   const create=at(prefix+';FileStorageForm;btnCreateDirectory');
   if(await at(path).count()!==1||!await create.isVisible()||!await create.isEnabled()||await at(prefix+';FileStorageForm;colName_'+name).count())throw Error('Folder setup preconditions differ');
   const before={directory:${JSON.stringify(storage)},create_tid:await create.getAttribute('data-tid'),create_visible:await create.isVisible()};
   await create.click();const input=page.locator('[data-tid^="msgbox"][data-tid$="cnt;cnt;txt"] input');
   await input.waitFor();if(await input.count()!==1)throw Error('Folder prompt is ambiguous');await input.fill(name);
   await page.locator('[data-tid^="msgbox"][data-tid$="tlb;ok"]').click();
   const folder=at(prefix+';FileStorageForm;colName_'+name);await folder.waitFor();await folder.dblclick();await at(path+'>'+name).waitFor();
   return {before,created_child:name,directory:${JSON.stringify(storage)}+'/'+name,child_breadcrumb:path+'>'+name};
  }`);
  await fs.writeFile(dir+'/delivery-start-directory.json',JSON.stringify(setup,null,2));
 }
 const uploadSource=async(artifact,name,uploadId)=>{
 // Upload needs the exact visible destination, not an inventory of every file.
 let roots=await runtime.observe({scope:'roots'}),root=roots.output.ui.elements.find(e=>e.tid===storagePrefix+';NavigationBar;NavigationPanel');
 if(!root)throw Error('Exact storage navigation unavailable');
 let observed=await runtime.observe({rootRef:root.ref,observationId:roots.output.observation_id});
 if(observed.output.file_storage?.directory!==storage)throw Error('Observed destination differs');
 const upload=await runtime.upload({artifactId:artifact.artifact_id,grantId:artifact.upload.grant_id,observationId:observed.output.observation_id,operationId:uploadId});
 await fs.writeFile(dir+'/'+uploadId+'.json',JSON.stringify(upload,null,2));
 await execute(`async page=>{
  const file=page.locator('[data-tid='+JSON.stringify(${JSON.stringify(storagePrefix+';FileStorageForm;colName_'+name)})+']');
  const grid=page.locator('[data-tid='+JSON.stringify(${JSON.stringify(storagePrefix+';FileStorageForm;pnlFileStorage;tbl')})+']');
  const directory=page.locator('[data-tid='+JSON.stringify(${JSON.stringify(storagePrefix+';cnrNaviMode;b.s_Сервер>Файлы>'+storage.split('/').filter(Boolean).join('>'))})+']');
  for(let attempt=0;attempt<12;attempt++) {
   if(await file.count()===1)return true;
   if(await directory.count()!==1||await grid.count()!==1)throw Error('Upload listing owner changed');
   await grid.evaluate((el,attempt)=>{el.scrollTop=attempt===0?0:Math.min(el.scrollHeight-el.clientHeight,el.scrollTop+500)},attempt);
   await page.waitForTimeout(200);
  }
  throw Error('Uploaded file not found within bounded listing search');
 }`);
 await runtime.inspect({operationId:uploadId});
 let verification;
 for(let attempt=0;attempt<3;attempt++) {
  roots=await runtime.observe({scope:'roots',storageName:name});root=roots.output.ui.elements.find(e=>e.tid===storagePrefix+';FileStorageForm;colName_'+name);
  if(!root)throw Error('Uploaded file region unavailable');
  observed=await runtime.observe({rootRef:root.ref,observationId:roots.output.observation_id});
  let stable=0,previous=null;
  for(let sample=0;sample<20&&stable<2;sample++) {
   const stamp=JSON.stringify({epoch:observed.output.dom_epoch,files:observed.output.ui.elements});
   stable=stamp===previous?stable+1:0;previous=stamp;
   if(stable>=2)break;
   await execute('async page=>{await page.waitForTimeout(200);return true}');
   roots=await runtime.observe({scope:'roots',storageName:name});root=roots.output.ui.elements.find(e=>e.tid===storagePrefix+';FileStorageForm;colName_'+name);
   if(!root)throw Error('Uploaded file disappeared while settling');
   observed=await runtime.observe({rootRef:root.ref,observationId:roots.output.observation_id});
  }
  if(stable<2)throw Error('Uploaded file observation did not settle');
  const file=observed.output.ui.elements.find(e=>e.tid===root.tid);
  verification=await runtime.verifyArtifact({operationId:uploadId,verificationId:'verify-'+uploadId+(attempt?'-'+attempt:''),observationId:observed.output.observation_id,fileRef:file.ref});
  await fs.writeFile(dir+'/'+uploadId+'-verification'+(attempt?'-'+attempt:'')+'.json',JSON.stringify(verification,null,2));
  if(verification.status==='SUCCEEDED')break;
  if(verification.status!=='NOT_APPLIED'||verification.effect_possible!==false||verification.cleanup_complete!==true
    ||verification.phase!=='preconditions'||verification.error?.code!=='DOWNLOAD_CONTEXT_CHANGED')break;
 }
 if(verification.status!=='SUCCEEDED')throw Error('Source bytes not verified');
 };
 let sourceUploadId='upload';
 if(integratedDelivery) {
  diagnosticContext={runtime,prep};
  const deliveryRequest={operation_id:'deliver-source',artifact_id:artifact.artifact_id,upload_grant_id:artifact.upload.grant_id,budget_ms:120000};
  let delivered=await runtime.deliverArtifact(deliveryRequest,{signal:deliveryPauseController.signal});
  const resumeRequest={operation_id:'deliver-source',resume_id:'resume-deliver-source',budget_ms:120000};
  if(deliveryPause) {
   await fs.writeFile(dir+'/delivery-initial-result.json',JSON.stringify(delivered,null,2));
   if(delivered.outcome?.status!=='AMBIGUOUS')throw Error('Expected an interrupted delivery');
   const before=sequence,initialReplay=await runtime.deliverArtifact(deliveryRequest),after=sequence;
   await fs.writeFile(dir+'/delivery-initial-replay.json',JSON.stringify({before,after,replayed:initialReplay},null,2));
   if(before!==after)throw Error('Interrupted delivery replay invoked browser');
   await fs.writeFile(dir+'/delivery-resume-request.json',JSON.stringify(resumeRequest,null,2));
   await fs.writeFile(dir+'/delivery-pause-checkpoint.json',JSON.stringify({boundary:deliveryPause,browser_sequence:sequence},null,2));
   if(deliveryBrowserLoss) {
    const lossRoots=await runtime.observe({scope:'roots'}),lossBar=lossRoots.output.ui.elements.find(e=>e.tid===lossRoots.output.workflow_ref.prefix+';NavigationBar;NavigationPanel');
    if(!lossBar)throw Error('Diagnostic storage navigation missing');
    const lossObserved=await runtime.observe({rootRef:lossBar.ref,observationId:lossRoots.output.observation_id});
    if(lossObserved.output.file_storage?.directory!==storage)throw Error('Diagnostic storage changed');
    const closed=await execute(`async page=>{const document=await page.evaluate(()=>globalThis[Symbol.for('loginom-dock.workspace-ui.identity.v1')]?.epoch);if(document!==${JSON.stringify(lossObserved.output.dom_epoch.document)})throw Error('Unexpected diagnostic document');await page.close();return {closed:true,document};}`);
    closed.before=lossObserved.output;
    await fs.writeFile(dir+'/delivery-browser-loss.json',JSON.stringify(closed,null,2));
   }
   delivered=await runtime.resumeArtifactDelivery(resumeRequest);
  }
  await fs.writeFile(dir+'/delivery-result.json',JSON.stringify(delivered,null,2));
  if(delivered.outcome?.status!==(deliveryBrowserLoss?'AMBIGUOUS':'SUCCEEDED'))throw Error('Integrated delivery outcome differs: '+JSON.stringify(delivered.error));
  const before=sequence,replayed=await (deliveryPause?runtime.resumeArtifactDelivery(resumeRequest):runtime.deliverArtifact(deliveryRequest)),after=sequence;
  await fs.writeFile(dir+'/delivery-replay.json',JSON.stringify({before,after,replayed},null,2));
  if(before!==after)throw Error('Delivery replay invoked browser');sourceUploadId=delivered.upload_operation_id;
 } else await uploadSource(artifact,name,'upload');
 if(deliveryBrowserLoss) {
  const summary={status:'PASS',scope:'delivery_browser_loss_refused',transfer_verified:false,independent_audit:false,package_saved:false,hermes_acceptance:false};
  await fs.writeFile(dir+'/summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify({dir,...summary}));
 } else if(deliveryConflict) {
  const candidateBytes=Buffer.from('Id;Title;Amount\n9;replacement;9.75\n');
  await fs.writeFile(dir+'/conflict-source.csv',candidateBytes);
  const candidate=await session.artifactStore.admit({sourcePath:dir+'/conflict-source.csv',name,bytes:candidateBytes.length,sha256:createHash('sha256').update(candidateBytes).digest('hex'),upload:{directory:storage,overwrite:deliveryConflict}});
  await fs.writeFile(dir+'/conflict-artifact.json',JSON.stringify(candidate,null,2));
  const conflictRequest={operation_id:'deliver-conflict',artifact_id:candidate.artifact_id,upload_grant_id:candidate.upload.grant_id,budget_ms:120000};
  const conflict=await runtime.deliverArtifact(conflictRequest);
  await fs.writeFile(dir+'/conflict-result.json',JSON.stringify(conflict,null,2));
  if(conflict.outcome?.status!==(deliveryConflict==='reject'?'FAILED':'SUCCEEDED')
    ||deliveryConflict==='reject'&&conflict.outcome.code!=='UPLOAD_PATH_CONFLICT')throw Error('Conflict delivery result differs from requested policy');
  const before=sequence,replayed=await runtime.deliverArtifact(conflictRequest),after=sequence;
  await fs.writeFile(dir+'/conflict-replay.json',JSON.stringify({before,after,replayed},null,2));
  if(before!==after)throw Error('Conflict replay invoked browser');
  const inspection=await runtime.inspect({operationId:conflict.upload_operation_id});
  await fs.writeFile(dir+'/conflict-inspect.json',JSON.stringify(inspection,null,2));
  if(inspection.output?.state!=='resolved'||inspection.output?.cleanup_confirmed!==true)throw Error('Conflict original transfer unresolved');
  // Independent operator byte check after the terminal decision, separate from
  // product verification. Never repeat this download after an unknown reply.
  const outputPath=dir+'/conflict-server-copy.csv';
  const downloaded=await execute(`async page=>{
   const at=t=>page.locator('[data-tid='+JSON.stringify(t)+']');
   const active=await page.locator('[data-tid^="MF;cntMain;cntWorkspace;Workspace;t.br;tb"].x-tab-active').getAttribute('data-tid');
   const prefix='MF;TF'+(active.match(/;tb(-\\d+)?$/)?.[1]??'');
   const path=at(prefix+';cnrNaviMode;b.s_Сервер>Файлы>'+${JSON.stringify(storage.split('/').filter(Boolean).join('>'))});
   const file=at(prefix+';FileStorageForm;colName_'+${JSON.stringify(name)});
   if(!await path.isVisible()||await file.count()!==1||!await file.isVisible())throw Error('Independent copy target unavailable');
   const [download]=await Promise.all([page.waitForEvent('download',{timeout:15000}),file.dblclick()]);
   if(download.suggestedFilename()!==${JSON.stringify(name)})throw Error('Independent filename mismatch');
   await download.saveAs(${JSON.stringify(outputPath)});return {name:download.suggestedFilename(),saved:true};
  }`);
  const actual=await fs.readFile(outputPath),expected=deliveryConflict==='reject'?bytes:candidateBytes;
  if(!actual.equals(expected))throw Error('Post-conflict server bytes differ');
  const proof={...downloaded,bytes:actual.length,sha256:createHash('sha256').update(actual).digest('hex'),policy:deliveryConflict};
  await fs.writeFile(dir+'/conflict-server-proof.json',JSON.stringify(proof,null,2));
  const summary={status:'PASS',scope:'integrated_delivery_conflict_'+deliveryConflict,independent_audit:false,package_saved:false,hermes_acceptance:false};
  await fs.writeFile(dir+'/summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify({dir,...summary}));
 } else {
 if(missingSource) {
  // Operator fixture setup only: remove precisely the file just uploaded and
  // byte-verified by this run. The product still receives the genuine proof.
  const removed=await execute(`async page=>{
   const prefix=${JSON.stringify(storagePrefix)},name=${JSON.stringify(name)},at=t=>page.locator('[data-tid='+JSON.stringify(t)+']');
   const directory=at(prefix+';cnrNaviMode;b.s_Сервер>Файлы>'+${JSON.stringify(storage.split('/').filter(Boolean).join('>'))});
   if(!await directory.isVisible())throw Error('Fixture directory changed');
   const file=at(prefix+';FileStorageForm;colName_'+name);await file.click();
   const selected=await page.locator('[data-tid='+JSON.stringify(prefix+';FileStorageForm;pnlFileStorage;tbl')+'] .x-grid-item-selected [data-tid]').evaluateAll(es=>es.map(e=>e.getAttribute('data-tid')).filter(t=>t.includes(';colName_')));
   if(selected.length!==1||selected[0]!==prefix+';FileStorageForm;colName_'+name)throw Error('Fixture selection differs');
   await at(prefix+';FileStorageForm;btnDelete').click();
   const prompt=at('msgbox;cnt;cnt;cmp'),yes=at('msgbox;tlb;yes');
   if((await prompt.innerText()).trim()!=='Вы действительно хотите удалить выделенное?'||(await yes.innerText()).trim()!=='Удалить')throw Error('Unexpected fixture delete dialog');
   await yes.click();await file.waitFor({state:'detached'});
   return {destination:${JSON.stringify(storage)}+'/'+name,selected,removed:true};
  }`);
  await fs.writeFile(dir+'/missing-source-setup.json',JSON.stringify(removed,null,2));
 }

 let replacementArtifact;
 if(replaceSource) {
  const replacementName='Dock03-replacement-'+Date.now()+(replaceSource==='changed-schema'?'.tsv':'.csv');
  const replacementBytes=Buffer.from(replaceSource==='changed-schema'?'Title\tAmount\tId\tExtra\nreplacement\t9.75\t41\t9007199254740993\nsecond\t-10.5\t42\t9007199254740995\n':'Id;Title;Amount\n41;replacement;9.75\n42;NULL;-10.5\n');
  await fs.writeFile(dir+'/'+replacementName,replacementBytes);
  replacementArtifact=await session.artifactStore.admit({sourcePath:dir+'/'+replacementName,name:replacementName,bytes:replacementBytes.length,sha256:createHash('sha256').update(replacementBytes).digest('hex'),upload:{directory:storage,overwrite:'replace'}});
  await fs.writeFile(dir+'/replacement-artifact.json',JSON.stringify(replacementArtifact,null,2));
  await uploadSource(replacementArtifact,replacementName,'replacement-upload');
 }
 await execute(`async page=>{await page.locator('[data-tid='+JSON.stringify(${JSON.stringify(prep.workflow_ref.tab_tid)})+']').click();return true}`);
 const settings={source:{source_path:storage+'/'+name,encoding,rows_to_skip:rowsToSkip,first_line_as_title:firstLineAsTitle},format:{delimiter,decimal_separator:decimalSeparator,null_marker:'NULL',text_qualifier:'"'},columns:[{name:'Id',label:'Id',type:'integer',data_kind:'Дискретный',used:true},{name:'Title',label:'Title',type:'string',data_kind:'Дискретный',used:true},{name:'Amount',label:'Amount',type:'real',data_kind:'Непрерывный',used:true}]};
 if(typedFixture)settings.columns=[{name:'Flag',label:'Flag',type:'boolean',data_kind:'Дискретный',used:true},{name:'Moment',label:'Moment',type:'datetime',data_kind:'Непрерывный',used:true},{name:'Note',label:'Note',type:'string',data_kind:'Дискретный',used:true}];
 if(count!==3)settings.columns=Array.from({length:count},(_,i)=>({name:'Field'+String(i+1).padStart(2,'0'),label:'Field'+String(i+1).padStart(2,'0'),type:i===count-1?'real':'integer',data_kind:i===0?'Дискретный':'Непрерывный',used:true}));
 if(wideMixedFixture)settings.columns=settings.columns.map((c,i)=>({...c,type:i>0&&i<count-1?'string':c.type,
  data_kind:i<count-1?'Дискретный':c.data_kind,label:i===count-1?'Последнее поле':c.label}));
 if(onlyColumn){if(!settings.columns.some(c=>c.name===onlyColumn))throw Error('Unknown sole output field');settings.columns=settings.columns.map(c=>({...c,used:c.name===onlyColumn}));}
 if(!firstLineAsTitle)settings.columns=settings.columns.map((column,i)=>({...column,source_name:'COL'+(i+1)}));
 if(process.argv.includes('--edit-fields')){settings.columns[0]={...settings.columns[0],source_name:settings.columns[0].source_name??settings.columns[0].name,name:'RecordId',label:'Идентификатор'};settings.columns[1].used=false;settings.columns.at(-1).label='Сумма';}
 let request={operation_id:'import-'+finish,contract_revision:'1.0.0',document_id:prep.document_id,workflow_ref:prep.workflow_ref,target:{kind:'new',type:'imports.text',label:'Import03Done',position:{x:96,y:80}},inputs:[],mode:'delimited',parameters:{settings,source:{artifact_id:artifact.artifact_id,upload_operation_id:sourceUploadId,bytes:artifact.bytes,sha256:artifact.sha256}},mappings:[],finish,read:{ports:readOutput?[0]:[],sample_rows:readOutput?10:0,require_exact_numbers:readOutput},budgets:{configure_ms:Math.max(240000,count*1200),execute_ms:30000,total_ms:Math.max(300000,count*1800)}};
 if(mappedOutput)request.mappings=[{direction:'output',port:0,autosync:false,fields:[{source:{kind:'configured_field',name:'Amount'},name:'AmountMapped',label:'Сумма выхода'},{source:{kind:'configured_field',name:'Title'},name:'Id',label:'Название'},{source:{kind:'configured_field',name:'Id'},name:'Title',label:'Номер'}]}];
 if(mappedOutput&&count!==3){const fields=settings.columns.map(c=>({source:{kind:'configured_field',name:c.name},name:c.name,label:c.label}));for(const f of fields.slice(-2)){f.name='Output'+f.name;f.label='Выход '+f.source.name;}[fields[fields.length-2],fields[fields.length-1]]=[fields.at(-1),fields.at(-2)];request.mappings=[{direction:'output',port:0,autosync:false,fields}];}
 if(existingPatch) {
  const seed={...structuredClone(request),operation_id:'import-seed',read:seedReadOutput?structuredClone(request.read):{ports:[],sample_rows:0,require_exact_numbers:false}};
  await fs.writeFile(dir+'/seed-request.json',JSON.stringify(seed,null,2));
  const seeded=await runtime.runNodeApply(seed);await fs.writeFile(dir+'/seed-result.json',JSON.stringify(seeded,null,2));
  if(seeded.status!=='SUCCEEDED')throw Error('Existing import seed failed: '+JSON.stringify(seeded.error??seeded.output?.error));
  const seedCalls=sequence;await runtime.runNodeApply(seed);
  if(sequence!==seedCalls)throw Error('Seed replay invoked browser again');
  request={...request,...(mappedOutput?{mappings:[]}:{}),target:{kind:'existing',type:'imports.text',ref:seeded.output.node,label:request.target.label},
    parameters:{...request.parameters,settings:settingsPatch??{columns:[{name:settings.columns.at(-1).name,label:'Обновлённая сумма'}]}}};
  if(replacementArtifact)request.parameters={source:{artifact_id:replacementArtifact.artifact_id,upload_operation_id:'replacement-upload',bytes:replacementArtifact.bytes,sha256:replacementArtifact.sha256},settings:{source:{source_path:storage+'/'+replacementArtifact.name},...(replaceSource==='changed-schema'?{format:{delimiter:'\t'},columns:[{name:'Extra',label:'Extra',type:'integer',data_kind:'Дискретный',used:true}]}:{})}};
 }
 await fs.writeFile(dir+'/request.json',JSON.stringify(request,null,2));
 diagnosticContext={runtime,request,prep};
 if(sourcePreflightRefusal) {
  for(const kind of ['missing_upload','digest']) {
   const bad=structuredClone(request);bad.operation_id='bad-source-'+kind;
   if(kind==='missing_upload')bad.parameters.source.upload_operation_id='unknown-upload';else bad.parameters.source.sha256='0'.repeat(64);
   const before=sequence,refused=await runtime.runNodeApply(bad),replayed=await runtime.runNodeApply(bad);
   await fs.writeFile(dir+'/'+bad.operation_id+'.json',JSON.stringify({before,after:sequence,refused,replayed},null,2));
   if(before!==sequence||refused.status!=='NOT_APPLIED'||refused.effect_possible!==false||refused.cleanup_complete!==true)
    throw Error('Source preflight refusal did not safely release the gate');
  }
 }
 const runBackground=async(resume=false,tag='async')=>{
  const started=runtime.startNodeApply(request,{resume}),probes=[];
  const replayStart=runtime.startNodeApply(request,{resume});
  await fs.writeFile(dir+'/'+tag+'-start.json',JSON.stringify({started,replay:replayStart},null,2));
  let current=started;
  for(let i=0;current.state==='running'&&i<1800;i++) {
   const before=sequence,status=runtime.nodeApplyStatus(request.operation_id),after=sequence;
   if(before!==after)throw Error('Status invoked browser');
   probes.push({before,after,status});
   current=await runtime.waitNodeApply(request.operation_id,{timeoutMs:1000});
  }
  await fs.writeFile(dir+'/'+tag+'-probes.json',JSON.stringify(probes,null,2));
  await fs.writeFile(dir+'/'+tag+'-final.json',JSON.stringify(current,null,2));
  if(current.state!=='settled'||!current.outcome)throw Error('Async node did not settle: '+JSON.stringify(current.error));
  return current.outcome;
 };
 let result=asyncNode?await runBackground():await runtime.runNodeApply(request,{signal:pauseController.signal});
 if(pauseDuringWait) {
  const cancel=diagnosticContext.waitCancel;
  await fs.writeFile(dir+'/async-cancel.json',JSON.stringify(cancel,null,2));
  await fs.writeFile(dir+'/paused-result.json',JSON.stringify(result,null,2));
  if(!cancel||cancel.before!==cancel.after||cancel.cancelled.progress?.pending_phase!=='execute'
    ||result.status!=='AMBIGUOUS'||result.cleanup_complete!==true||result.output.pending_phase!==null
    ||result.output.execution?.status!=='pending')throw Error('Read-wait cancellation did not produce a safe checkpoint');
  const before=sequence,inspected=await runtime.inspect({operationId:request.operation_id});
  await fs.writeFile(dir+'/paused-inspect.json',JSON.stringify(inspected,null,2));
  if(before!==sequence||inspected.output.internal_resume_available!==true)throw Error('Paused wait is not inspectable without browser effects');
  result=await runBackground(true,'async-resume');
 }
 if(resumeAfterConfigure) {
  await fs.writeFile(dir+'/paused-result.json',JSON.stringify(result,null,2));
  if(result.status!=='AMBIGUOUS'||result.output?.pending_phase!==null||result.cleanup_complete!==true
    ||result.output?.phases.at(-1)?.phase!==pausePhase)throw Error('Configured pause did not reach a safe boundary');
  const count=sequence;const inspected=await runtime.inspect({operationId:request.operation_id});
  await fs.writeFile(dir+'/paused-inspect.json',JSON.stringify(inspected,null,2));
  if(sequence!==count)throw Error('Paused inspection invoked browser');
  if(mutatePaused) {
   const tid=prep.workflow_ref.prefix+';WizrdMCF;'+(mutatePausedCompletion?'DoneWizard;edtDisplayName':'ImportTextFileParamsWizard;edtValueNull;ValueControl');
   const marker=mutatePausedCompletion?'Changed paused label 03':'CHANGED_NULL_03';
   const mutation=await execute(`async page=>{const owner=page.locator('[data-tid='+JSON.stringify(${JSON.stringify(tid)})+']');const input=owner.locator('input');const before=await input.inputValue();await input.fill(${JSON.stringify(marker)});await input.press('Tab');return {tid:${JSON.stringify(tid)},before,after:await input.inputValue()}}`);
   await fs.writeFile(dir+'/paused-ui-mutation.json',JSON.stringify(mutation,null,2));
   if(mutation.after!==marker)throw Error('Operator mutation was not observed');
  }
  result=asyncNode?await runBackground(true,'async-resume'):await runtime.runNodeApply(request,{resume:true});
 }
 await fs.writeFile(dir+'/result.json',JSON.stringify(result,null,2));
 if(requestServerStop&&!serverStopRequested)throw Error('Server stop fixture did not reach the pending execution');
 if(mutatePaused) {
  if(result.status!=='AMBIGUOUS'||result.cleanup_complete!==true||!result.error?.message?.includes('Live package or accepted phases differ'))throw Error('Changed draft was not safely rejected');
  const before=sequence,replay=await runtime.runNodeApply(request);
  await fs.writeFile(dir+'/replayed.json',JSON.stringify(replay,null,2));
  if(sequence!==before)throw Error('Refused resume replay invoked the browser');
  const summary={status:'PASS',scope:mutatePausedCompletion?'changed_mapped_completion_resume_refused':'changed_configured_draft_resume_refused',independent_audit:false,hermes_acceptance:false};
  await fs.writeFile(dir+'/summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify({dir,...summary}));
 } else {
 if(missingSource) {
  if(result.status!=='AMBIGUOUS'||result.output?.pending_phase!=='configure'
    ||result.output?.error?.cause?.code!=='WIZARD_SOURCE_VALIDATION_FAILED')throw Error('Missing-source outcome differs: '+JSON.stringify(result.error??result.output?.error));
 } else if(result.status!=='SUCCEEDED')throw Error('Node apply failed: '+JSON.stringify(result.error??result.output?.error));
 const callsBefore=sequence,replayed=await runtime.runNodeApply(request);await fs.writeFile(dir+'/replayed.json',JSON.stringify(replayed,null,2));
 if(sequence!==callsBefore)throw Error('Completed replay invoked browser again');
 if(saveReopen) {
  const saveRequest={path:storage+'/Dock03-package-'+Date.now()+'.lgp',conflict_policy:'fail'};
  await fs.writeFile(dir+'/save-request.json',JSON.stringify(saveRequest,null,2));
  const saved=await runtime.run(saveActionKey,saveRequest,{operationId:'save-import'});
  await fs.writeFile(dir+'/save-result.json',JSON.stringify(saved,null,2));
  if(saved.status!=='SUCCEEDED'||saved.output?.reopened!==!saveCheckpoint)throw Error('Package save/reopen failed: '+JSON.stringify(saved.error??saved.output));
  const saveCalls=sequence;const saveReplay=await runtime.run(saveActionKey,saveRequest,{operationId:'save-import'});
  await fs.writeFile(dir+'/save-replayed.json',JSON.stringify(saveReplay,null,2));
  if(sequence!==saveCalls)throw Error('Save replay invoked browser');
  let savedWorkflow=request.workflow_ref;
  if(saveConflict) {
    const continuations=saved.output.workflow_continuations?.filter(c=>c.document_id===request.document_id&&c.workflow_ref.workflow_id===request.workflow_ref.workflow_id
      &&c.previous_workflow_ref.tab_tid===request.workflow_ref.tab_tid&&c.previous_workflow_ref.prefix===request.workflow_ref.prefix
      &&JSON.stringify(c.previous_workflow_ref.navigation_path)===JSON.stringify(request.workflow_ref.navigation_path));
    if(continuations?.length!==1)throw Error('Exact saved workflow continuation unavailable');
    savedWorkflow=continuations[0].workflow_ref;
    const patchedRequest={...structuredClone(request),operation_id:'import-before-resave',workflow_ref:savedWorkflow,
      target:{kind:'existing',type:'imports.text',label:request.target.label,ref:result.output.node},
      parameters:{source:request.parameters.source,settings:{columns:[{name:settings.columns[0].name,label:'После изменения'}]}}};
    await fs.writeFile(dir+'/save-patch-request.json',JSON.stringify(patchedRequest,null,2));
    const patched=await runtime.runNodeApply(patchedRequest);await fs.writeFile(dir+'/save-patch-result.json',JSON.stringify(patched,null,2));
    if(patched.status!=='SUCCEEDED')throw Error('Pre-save patch failed: '+JSON.stringify(patched.error??patched.output?.error));
    const refused=await runtime.run(saveActionKey,saveRequest,{operationId:'save-existing-fail'});
    await fs.writeFile(dir+'/save-conflict-result.json',JSON.stringify(refused,null,2));
    if(refused.status!=='NOT_APPLIED'||refused.cleanup_complete!==true||refused.output?.conflict!==true)throw Error('Save conflict was not safely rejected');
    const refusalCalls=sequence;await runtime.run(saveActionKey,saveRequest,{operationId:'save-existing-fail'});
    if(sequence!==refusalCalls)throw Error('Conflict replay invoked browser');
    const replaced=await runtime.run(saveActionKey,{...saveRequest,conflict_policy:'replace'},{operationId:'save-existing-replace'});
    await fs.writeFile(dir+'/save-replace-result.json',JSON.stringify(replaced,null,2));
    if(replaced.status!=='SUCCEEDED'||replaced.output?.reopened!==false)throw Error('Explicit replacement failed');
    const replaceCalls=sequence;await runtime.run(saveActionKey,{...saveRequest,conflict_policy:'replace'},{operationId:'save-existing-replace'});
    if(sequence!==replaceCalls)throw Error('Replacement replay invoked browser');
  }
  if(saveCheckpoint) {
    const qa=await execute(makePackageReopenQaCode({path:saveRequest.path,workflow_ref:savedWorkflow}));
    await fs.writeFile(dir+'/checkpoint-reopen-qa.json',JSON.stringify(qa,null,2));
    await record({phase:'checkpoint_reopen_qa',operation_id:'checkpoint-reopen-qa',save_operation_id:'save-import',qa});
    const checkpoint=await execute(makeCapabilityCode(actions.find(a=>a.action_key===saveActionKey),new Map(selectors.map(s=>[s.symbol,s])),saveRequest,
      {mode:'prepare',operation_id:'reopened-package-checkpoint',expected_origin:url.origin,expected_build:'7.4.2'}));
    await fs.writeFile(dir+'/reopened-package-checkpoint.json',JSON.stringify(checkpoint,null,2));
    await record({phase:'reopened_package_checkpoint',operation_id:'reopened-package-checkpoint',save_operation_id:'save-import',checkpoint});
  }
  const reopened=await execute(makeWorkspacePrepareCode({loginomUrl,compatibility:{profile_id:'loginom-7.4.2-macos-chromium',loginom_build:'7.4.2',platform:'macos',browser:'chromium'},sessionId:session.metadata.sessionId,operationId:'prepare-saved',intent:'open_package',packagePath:saveRequest.path,timeoutMs:15000}));
  await fs.writeFile(dir+'/saved-preparation.json',JSON.stringify(reopened,null,2));
  await record({phase:'saved_package_prepared',operation_id:'prepare-saved',save_operation_id:'save-import',requested_path:saveRequest.path,preparation:reopened});
  if(reopened.status!=='READY')throw Error('Saved package preparation failed');
  const reexecute={...structuredClone(request),...(mappedOutput?{mappings:[]}:{}),operation_id:'import-reopened',document_id:reopened.document_id,workflow_ref:reopened.workflow_ref,
    target:{kind:'existing',type:'imports.text',label:request.target.label,ref:{...result.output.node,document_id:reopened.document_id,workflow_id:reopened.workflow_ref.workflow_id}},
    parameters:{source:request.parameters.source,settings:{columns:[{name:settings.columns[0].name,label:saveConflict?'После изменения':settings.columns[0].label}]}}};
  await fs.writeFile(dir+'/reopened-request.json',JSON.stringify(reexecute,null,2));
  const repeated=await runtime.runNodeApply(reexecute);await fs.writeFile(dir+'/reopened-result.json',JSON.stringify(repeated,null,2));
  if(repeated.status!=='SUCCEEDED')throw Error('Saved import reexecution failed: '+JSON.stringify(repeated.error??repeated.output?.error));
  const repeatCalls=sequence;const repeatReplay=await runtime.runNodeApply(reexecute);await fs.writeFile(dir+'/reopened-replayed.json',JSON.stringify(repeatReplay,null,2));
  if(sequence!==repeatCalls)throw Error('Reopened import replay invoked browser');
 }
 if(finish==='close') {
  // Dedicated cancellation roundtrip; it is outside the product node.apply.
  const binding={document_id:prep.document_id,workflow_ref:prep.workflow_ref,node:result.output.node};
  const options={mode:'observe',prepared_node_context:binding,expected_origin:url.origin,expected_build:'7.4.2'};
  const before=await execute(makeWorkspaceUiCode({...options,discover_roots:true}));
  if(before.status!=='SUCCEEDED'||before.output.prepared_node_context?.surface!=='graph')throw Error('Cancelled node graph unavailable for QA reopen');
  const nodeTid=prep.workflow_ref.prefix+';Graph;'+request.target.label.replace(/\s/g,'_').replace(/,/g,'');
  await execute(`async page=>{const at=t=>page.locator('[data-tid='+JSON.stringify(t)+']');await at(${JSON.stringify(nodeTid)}).click();await at(${JSON.stringify(nodeTid+';Setting')}).click();await at(${JSON.stringify(prep.workflow_ref.prefix+';WizrdMCF;ImportTextFilePreviewWizard;edtFileName;ValueControl')}).locator('input').waitFor();return true}`);
  await execute(`async page=>{await page.waitForFunction(base=>['edtConnection','edtCodePage;ValueControl','edtRowsToSkip;ValueControl'].every(key=>{const owner=document.querySelector('[data-tid='+JSON.stringify(base+key)+']');const input=owner?.querySelector('input');return !!input&&input.value!=='';}),${JSON.stringify(prep.workflow_ref.prefix+';WizrdMCF;ImportTextFilePreviewWizard;')},{timeout:15000});return true}`);
  const roots=await execute(makeWorkspaceUiCode({...options,discover_roots:true}));
  const reopened=await execute(makeWorkspaceUiCode({...options,root_ref:roots.output?.wizard?.root_ref}));
  await fs.writeFile(dir+'/cancel-reopen.json',JSON.stringify(reopened,null,2));
  if(reopened.status!=='SUCCEEDED')throw Error('Cancellation roundtrip observation failed');
 }
 const summary={status:'PASS',scope:saveConflict?'intermediate_save_conflict_patch_replace_reopen_qa':saveCheckpoint?'intermediate_save_with_separate_reopen_qa':saveReopen?'saved_import_reopen_reexecute':missingSource?'verified_source_removed_before_node_apply':existingPatch?'existing_settings_patch_after_seed_execute':'verified_upload_to_node_'+finish,operation_id:request.operation_id,replayed_without_browser:true,execution_verified:result.output?.execution?.status==='completed',output_read:readOutput&&!missingSource,output_requested:readOutput,independent_audit:false,package_saved:saveReopen,package_reopened:saveReopen,persisted_settings_independently_verified:false,hermes_acceptance:false};
 await fs.writeFile(dir+'/summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify({dir,...summary}));
 }
}
} catch(error){
 await fs.writeFile(dir+'/failure.json',JSON.stringify({message:String(error.message)}));
 if(process.argv.includes('--diagnose')) {
  console.log(JSON.stringify({dir,status:'DIAGNOSTIC_WAITING',failure:String(error.message)}));
  const ctx={execute,session,dir,fs,...diagnosticContext};
  for await(const line of readline.createInterface({input:process.stdin})) {
   try{const command=JSON.parse(line),source=await fs.readFile(command.file,'utf8');
    const result=await new Function('ctx','return (async()=>{'+source+'})()')(ctx);
    await fs.writeFile(dir+'/'+command.id+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify({id:command.id,result}));
   }catch(diagnosticError){console.log(JSON.stringify({error:String(diagnosticError.stack)}));}
  }
 }
 throw error;
}
finally{await publicWire?.close();await client.close();}
