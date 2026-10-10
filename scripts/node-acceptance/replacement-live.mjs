import {runReplacementDiagnostic} from './replacement-live-owner.mjs';
import {readFile,writeFile,mkdir,appendFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';import {pathToFileURL} from 'node:url';import {randomUUID,createHash} from 'node:crypto';import {createInterface} from 'node:readline';
export async function runLive398(args, owner) {
 if(!owner || typeof owner!=='object' || owner.context)throw Error('FOREGROUND_OWNER_REQUIRED');
try {
process.umask(0o077);
if (!process.stdin.isTTY) throw Error("DIAGNOSTIC_INTERACTIVE_STDIN_REQUIRED_BEFORE_LOGIN");
const root=resolve(args[0]),out=resolve(args[2]),load=n=>import(pathToFileURL(join(root,'runtime',n)).href);
await mkdir(out,{recursive:true});const config=JSON.parse(await readFile(args[1]));
const account=config.workflow_profile.loginom_user,storage='/'+account,name='replacement-null-live-'+randomUUID()+'.lgp',packagePath=storage+'/'+name,sid=randomUUID();
const {verifyResources}=await load('src/resources.mjs'),resources=await verifyResources(root),{loginBrowser}=await load('src/connection-check.mjs');
const {createActionRuntime}=await load('client/lib/executor.mjs'),{createCandidateNodeSupport}=await load('client/lib/node-support.mjs'),{createArtifactStore}=await load('client/lib/artifacts.mjs'),{createExecutionJournal}=await load('client/lib/execution-journal.mjs'),{makeWorkspacePrepareCode}=await load('client/lib/workspace.mjs'),{makePackageCleanupCode}=await load('client/lib/package-cleanup.mjs');
const save=(n,v)=>writeFile(join(out,n+'.json'),JSON.stringify(v,null,2));const need=(v,m)=>{if(!v)throw Error(m);};
// External observer wraps public Playwright calls without changing candidate code.
const {createRequire}=await import('node:module');const req=createRequire(join(root,'runtime/client/package.json'));const {chromium}=req('playwright-core');
const secrets=[config.workflow_profile.password,config.api_key].filter(Boolean),redact=v=>secrets.reduce((t,s)=>t.split(s).join('[REDACTED]'),String(v));
const observe=(stage,data={})=>{appendFile(join(out,'login-observer.jsonl'),JSON.stringify({at:new Date().toISOString(),stage,...data})+'\n').catch(()=>{});};
const originalLaunch=chromium.launchPersistentContext.bind(chromium);
chromium.launchPersistentContext=async(...args)=>{observe('launch-start');try{const ctx=await originalLaunch(...args);observe('launch-success');
 const hook=page=>{page.on('pageerror',e=>observe('pageerror',{error:redact(e.message)}));page.on('requestfailed',r=>observe('requestfailed',{url:new URL(r.url()).origin+new URL(r.url()).pathname,error:redact(r.failure()?.errorText)}));
 const wrap=(obj,names)=>{for(const n of names){const original=obj[n];if(typeof original!=='function')continue;obj[n]=function(...a){observe('call:'+n);try{const value=original.apply(this,a);if(value?.then)return value.catch(e=>{observe('original-failure:'+n,{error:redact(e.message)});throw e;});return value;}catch(e){observe('original-failure:'+n,{error:redact(e.message)});throw e;}};}};
 wrap(page,['goto','evaluate']);const proto=Object.getPrototypeOf(page.locator('body'));if(!proto.__observed){wrap(proto,['waitFor','click','fill','inputValue','isVisible']);proto.__observed=true;}};
 ctx.pages().forEach(hook);ctx.on('page',hook);return ctx;}catch(e){observe('original-failure:launch',{error:redact(e.message)});throw e;}};
console.log(JSON.stringify({diagnostic_out:out}));
const {context}=await loginBrowser({browserPath:resources.browserPath,profile:join(out,'browser'),candidate:{url:config.loginom_url,username:account,password:config.workflow_profile.password},headless:true,keepOpen:true}).catch(async e=>{await save('login-failure',{error:redact(e.message),at:new Date().toISOString(),profile:join(out,'browser'),runtime_created:false});throw e;});const page=context.pages()[0];
Object.assign(owner,{page,context});
const execute=code=>new Function('page',`return (${code})(page)`)(page);
const journal=createExecutionJournal({directory:out,metadata:{sessionId:sid},knownSecrets:[config.api_key,config.workflow_profile.password].filter(Boolean)});let trace=0;
const snapshot=async label=>{
 const value=await page.evaluate(async()=>{
  const m=bg.app.Application.FInstance.FMainForm.FMapTree;const roots=[...document.querySelectorAll('[data-tid$=";ReplaceColumnsWizard"]')].filter(e=>e.checkVisibility({checkVisibilityCSS:true}));
  const result={account:m.FServerConnection.UserName,packages:Array.from({length:m.PackageNodes.Count},(_,i)=>{const p=m.PackageNodes.Items(i);return {path:p.PackageFileName,read_only:p.ReadOnly,running:p.HasRunningNodes()};})};
  if(roots.length!==1)return result;const base=roots[0].getAttribute('data-tid')+';',cmp=n=>{const es=[...document.querySelectorAll('[data-tid='+JSON.stringify(base+n)+']')];return es.length===1&&roots[0].contains(es[0])?Ext.getCmp(es[0].id):null;};
  const grid=cmp('grdReplaceItems'),input=cmp('grdDataList');result.selected=input?.getSelectionModel?.().getSelection?.().map(r=>({id:r.internalId,name:r.data.Name,type:r.data.DataType}));result.pairs=[];
  for(const r of grid?.getStore?.().getData?.().items??[]){const d=r.data,p={id:r.internalId,index:d.Index,collection:d.CollectionID,cache:{from:d.ValueRender,to:d.ReplaceRender}};if(d.DataValue&&d.ReplaceBy)try{const read=async v=>({DataType:await v.DataType,IsNull:await v.IsNull,Value:await v.Value});p.native={from:await read(d.DataValue),to:await read(d.ReplaceBy)};}catch(e){p.error=String(e.message);}result.pairs.push(p);}
  result.editor={from:cmp('ReplaceEditor')?.Controller?.getValue?.(),to:cmp('ReplaceEditor-1')?.Controller?.getValue?.(),record:grid?.findPlugin?.('rowediting')?.context?.record?.internalId};return result;
 });await save('trace-'+(++trace),{label,at:new Date().toISOString(),value});return value;
};
const record=async event=>{const r=await journal(event);if(['node_step_prepared','node_step_completed'].includes(event.phase)&&event.action_key!=='package.save_checkpoint')try{await snapshot(event.phase+':'+JSON.stringify(event.action??event.condition??event.internal_operation_id));}catch(e){await save('trace-error-'+(++trace),{message:e.message});}return r;};
const actions=JSON.parse(await readFile(join(root,'runtime/executor/catalog/actions.json'))).actions,selectors=JSON.parse(await readFile(join(root,'runtime/executor/catalog/selectors.json'))).selectors;
for(const k of ['package.save_checkpoint','package.save_as'])actions.find(a=>a.action_key===k).effect.allowed_roots=[storage];
const artifactStore=await createArtifactStore({directory:join(out,'artifacts'),sessionId:sid}),rc={targetOrigin:new URL(config.loginom_url).origin,targetBuild:'7.4.2'};
const runtime=createActionRuntime({pinned:{actions:new Map(actions.map(a=>[a.action_key,a])),selectors:new Map(selectors.map(s=>[s.symbol,s])),pins:{}},execute,onRecord:record,artifactStore,allowCandidate:true,...rc,...createCandidateNodeSupport(rc)});
let prepared,artifact,source,result,absent=false,step=0;
const inventory=()=>page.evaluate(async()=>{const m=bg.app.Application.FInstance.FMainForm.FMapTree;return {account:m.FServerConnection.UserName,build:bg.app.Version,packages:await Promise.all(Array.from({length:m.PackageNodes.Count},async(_,i)=>{const n=m.PackageNodes.Items(i);return {path:n.PackageFileName,read_only:n.ReadOnly,running:n.HasRunningNodes(),modified:await m.FServerConnection.Session.IsPackageModified(n.Package)};}))};});
await save('identity',{session:sid,packagePath,historical_replacement_sha:'398109d58ccd6e01032b3a72416c79ece8d889b2',resources_manifest:resources.manifestHash,at:new Date().toISOString()});
console.log(JSON.stringify({ready:true,out,name,packagePath,inventory:await inventory(),unsettled:runtime.hasUnsettledWork()}));
const base=()=>({contract_revision:'1.0.0',document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,inputs:[],mappings:[],finish:'execute',read:{ports:[0],sample_rows:100,require_exact_numbers:true},budgets:{configure_ms:120000,execute_ms:120000,total_ms:300000}});
delete owner.context;
return await runReplacementDiagnostic({context,page,execute,runtime,directory:join(out,'lifecycle'),identity:{sessionId:sid,account,packagePath,loginomUrl:config.loginom_url,loginomBuild:'7.4.2'},makeCleanupCode:makePackageCleanupCode},owner,async({bindPrepared})=>{
 const lines=createInterface({input:process.stdin});try{for await(const line of lines){
  let q;try{q=JSON.parse(line);}catch{continue;}let r;
  try{
   if(q.command==='exit')throw Error('CONFIRMED_CLEANUP_REQUIRED');
   if(q.command==='absence'){
    const inv=await inventory();need(inv.account===account&&inv.build==='7.4.2'&&inv.packages.length===0&&!runtime.hasUnsettledWork(),'EMPTY_OWN_SESSION_REQUIRED');
    const at=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']');await at('MF;cntMain;tlbMainToolbar;btnFilestorage').click();
    r=await page.evaluate(()=>({elements:[...document.querySelectorAll('[data-tid]')].filter(e=>e.checkVisibility({checkVisibilityCSS:true})&&e.getAttribute('data-tid').includes('FileStorageForm')).map(e=>({tid:e.getAttribute('data-tid'),text:(e.innerText??'').slice(0,250)}))}));
   }else if(q.command==='click'){
    need(!prepared,'PREFLIGHT_NAVIGATION_ONLY');const at=page.locator('[data-tid='+JSON.stringify(q.tid)+']');need(await at.count()===1&&await at.isVisible(),'EXACT_NATIVE_UI_REQUIRED');if(q.double)await at.dblclick();else await at.click();r={clicked:q.tid};
   }else if(q.command==='storage'){
    r=await page.evaluate(()=>({elements:[...document.querySelectorAll('[data-tid]')].filter(e=>e.checkVisibility({checkVisibilityCSS:true})&&e.getAttribute('data-tid').includes('FileStorageForm')).map(e=>({tid:e.getAttribute('data-tid'),text:(e.innerText??'').slice(0,150)})),grids:[...document.querySelectorAll('[data-tid]')].filter(e=>e.checkVisibility({checkVisibilityCSS:true})&&e.getAttribute('data-tid').includes('FileStorageForm')).flatMap(e=>{const c=Ext.getCmp(e.id),s=c?.getStore?.();if(!s)return [];return [{tid:e.getAttribute('data-tid'),loading:s.isLoading?.(),count:s.getCount?.(),proxy:s.getProxy?.().$className,rows:s.getData?.().items?.map(r=>({id:r.internalId,data:Object.fromEntries(Object.entries(r.data).filter(([k,v])=>['string','boolean','number'].includes(typeof v)))}))}];}),nav:[...document.querySelectorAll('[data-tid]')].filter(e=>e.checkVisibility({checkVisibilityCSS:true})&&e.getAttribute('data-tid').includes('cnrNaviMode;b.s_')).map(e=>({tid:e.getAttribute('data-tid'),text:e.innerText}))}));
   }else if(q.command==='admit-absence'){
    need(q.directory===storage,'OWN_DIRECTORY_REQUIRED');r=await page.evaluate(({storage,name})=>{const nodes=[...document.querySelectorAll('[data-tid]')].filter(e=>e.checkVisibility({checkVisibilityCSS:true}));const nav=nodes.some(e=>e.getAttribute('data-tid').endsWith(';cnrNaviMode;b.s_Сервер>Файлы>'+storage.slice(1)));const grids0=nodes.flatMap(e=>{if(!e.getAttribute('data-tid').includes('FileStorageForm'))return [];const c=Ext.getCmp(e.id),s=c?.getStore?.();return s?[{s,tid:e.getAttribute('data-tid')}]:[];}).filter(({s})=>s.getData?.().items?.every(r=>Object.hasOwn(r.data,'FileName')));const grids=[...new Map(grids0.map(g=>[g.s,g])).values()];if(!nav||grids.length!==1)return {verified:false,reason:'STORAGE_BINDING'};const {s,tid}=grids[0],rows=s.getData().items;return {verified:!s.isLoading()&&s.getCount()===rows.length&&!rows.some(r=>r.data.FileName===name),directory:storage,name,count:rows.length,tid,names:rows.map(r=>r.data.FileName)};},{storage,name});need(r.verified,'ABSENCE_NOT_VERIFIED');absent=true;
   }else if(q.command==='home'){need(!prepared,'PREFLIGHT_ONLY');const at=page.locator('[data-tid='+JSON.stringify(q.tid)+']');need(await at.count()===1&&await at.isVisible(),'EXACT_HOME_REQUIRED');await at.click();r={clicked:q.tid};
   }else if(q.command==='refresh-saved'||q.command==='restore'){
    need(prepared?.status==='READY','READY_REQUIRED');const old=prepared;await page.evaluate(prefix=>{const p=globalThis.__loginomDockPreparationV1;const entries=[...p.receipts.values()].filter(r=>r.phase==='verified'&&r.tab?.getAttribute('data-tid')?.includes('tb-'));const r=entries.find(r=>r.tab.getAttribute('data-tid')===prefix);globalThis.__live398Binding={packageNode:r?.packageNode,tab:r?.tab};return {verified:!!r?.packageNode};},old.workflow_ref.tab_tid).catch(()=>null);
    const receipt=await execute(makeWorkspacePrepareCode({loginomUrl:config.loginom_url,compatibility:{loginom_build:'7.4.2',platform:'linux',browser:'chromium'},sessionId:sid,operationId:q.command+'-'+(++step),intent:q.command==='refresh-saved'?'open_package':'existing_workflow',packagePath:q.command==='refresh-saved'?packagePath:null,workflowRef:q.command==='restore'?{...old.workflow_ref,document_id:old.document_id}:null}));
    await save('fresh-prepare-'+step,receipt);need(receipt.status==='READY'&&receipt.loginom_account===account&&receipt.document_id===old.document_id&&receipt.package_ref.path===packagePath&&receipt.workflow_ref.tab_tid===old.workflow_ref.tab_tid,'FRESH_PREPARE_IDENTITY_REQUIRED');const same=await page.evaluate(tab=>{const p=globalThis.__loginomDockPreparationV1;const records=[...p.receipts.values()].filter(r=>r.phase==='verified'&&r.tab?.getAttribute('data-tid')===tab);return records.length>0&&records.every(r=>r.tab===globalThis.__live398Binding.tab&&r.packageNode===globalThis.__live398Binding.packageNode);},receipt.workflow_ref.tab_tid);need(same,'NATIVE_PACKAGE_GRAPH_CHANGED');prepared=receipt;r=receipt;
   }else if(q.command==='draft'){
    need(absent&&!prepared,'UNIQUE_TARGET_ABSENCE_REQUIRED');const i=await inventory();need(i.account===account&&i.packages.length===0&&!runtime.hasUnsettledWork(),'EMPTY_OWN_SESSION_REQUIRED');prepared=await execute(makeWorkspacePrepareCode({loginomUrl:config.loginom_url,compatibility:{loginom_build:'7.4.2',platform:'linux',browser:'chromium'},sessionId:sid,operationId:'new-live-draft',intent:'new_draft'}));r=prepared;
   }else if(q.command==='save'){
    r=await runtime.run('package.save_checkpoint',{path:packagePath,conflict_policy:q.bootstrap?'fail':'replace'},{operationId:q.bootstrap?'new-live-bootstrap':'new-live-save-'+(++step)});if(r.status==='SUCCEEDED')prepared={...prepared,package_ref:r.output.package_ref};
   }else if(q.command==='deliver'){
    const file=resolve(args[3]),bytes=await readFile(file);need(createHash('sha256').update(bytes).digest('hex')==='0e0151318f8307267dc1ed61b396c869303331dc8f1831cac8b7b5a73d2e2e4b','EXACT_CSV_REQUIRED');artifact=await artifactStore.admit({sourcePath:file,name:'live-null-'+sid+'.csv',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),upload:{directory:storage,overwrite:'reject'}});r=await runtime.deliverArtifact({operation_id:'new-live-source',artifact_id:artifact.artifact_id,upload_grant_id:artifact.upload.grant_id,budget_ms:120000});
   }else if(q.command==='import'){
    const columns=[['Id','integer'],['Category','string'],['Code','integer'],['Amount','real'],['Keep','string']].map(([name,type])=>({name,label:name,type,data_kind:type==='real'?'Непрерывный':'Дискретный',used:true}));source=await runtime.runNodeApply({...base(),operation_id:'new-live-import',mode:'delimited',target:{kind:'new',type:'imports.text',label:'ExactInput',position:{x:120,y:100}},parameters:{source:{artifact_id:artifact.artifact_id,upload_operation_id:'new-live-source:upload'},settings:{source:{source_path:artifact.upload.destination,encoding:'UTF-8',rows_to_skip:0,first_line_as_title:true},format:{delimiter:';',decimal_separator:'.',null_marker:'NULL',text_qualifier:'"',multiple_delimiters:false},columns}}});r=source;
   }else if(q.command==='replace'){
    const v=value=>({type:'string',value});r=await runtime.runNodeApply({...base(),operation_id:'new-live-replacement',mode:'exact',target:{kind:'new',type:'transform.replace_columns',label:'NullDiagnostic',position:{x:420,y:100}},inputs:[{source:source.output.node,input:0,output:0}],parameters:{output_mode:'add',rules:[{field:{kind:'input_field',name:'Category'},type:'string',case_sensitive:true,pairs:[{from:v(null),to:v('Missing')},{from:v(''),to:v('Empty')},{from:v('null'),to:v('Literal')},{from:v('Null'),to:v('CapitalLiteral')}],other:{mode:'keep'}}]}});result=r;
   }else if(q.command==='status'){r={inventory:await inventory(),unsettled:runtime.hasUnsettledWork(),snapshot:await snapshot('explicit status')};
   }else if(q.command==='inspect'){r=await runtime.inspect({operationId:q.operation});
   }else if(q.command==='cleanup'){need(!runtime.hasUnsettledWork(),'DIAGNOSTIC_PENDING_OPERATION_PRESERVED');lines.close();return {cleanup_requested:true};
   }else throw Error('UNKNOWN_COMMAND');
   await save('command-'+(++step)+'-'+q.command,r);if(prepared?.status==='READY'&&prepared.package_ref?.path===packagePath)await bindPrepared(prepared);if(r?.status==='AMBIGUOUS')throw Error('DIAGNOSTIC_OPERATION_AMBIGUOUS',{cause:r});console.log(JSON.stringify({command:q.command,result:r}));
  }catch(e){try{await save('failure-'+(++step),{command:q.command,error:redact(e?.message??'DIAGNOSTIC_REJECTION'),at:new Date().toISOString()});}catch{}console.log(JSON.stringify({command:q.command,error:redact(e?.message??'DIAGNOSTIC_REJECTION')}));throw e;}
 }
 }finally{lines.close();}
 throw Error('DIAGNOSTIC_STDIN_EOF_BEFORE_CLEANUP');
});
}catch(error){owner.failed=true;owner.error=error;return owner;}
}
