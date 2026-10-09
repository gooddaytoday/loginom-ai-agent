import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const need=(v,m)=>{if(!v)throw Error('COLD_SOURCE:'+m);};
const one=(xs,m)=>{need(xs.length===1,m);return xs[0];};
const pick=(f,ks)=>Object.fromEntries(ks.map(k=>[k,f[k]]));
export async function verifyStaticSourceBytes({load,runtime,execute,sources,allowed,account,origin,output}){
 const {findNativeStorageRow}=await load('client/lib/text-export-output.mjs');
 const {makeArtifactDownloadCode}=await load('client/lib/executor.mjs');
 const read=async options=>{
  const r=await runtime.observe(options);need(r.status==='SUCCEEDED','storage observation');
  const s=structuredClone(r.output);let cursor=s.page?.next_cursor,pages=0;
  while(cursor){need(++pages<=32,'storage page bound');const n=await runtime.observe({cursor});need(n.status==='SUCCEEDED'&&n.output.observation_id===s.observation_id,'storage observation changed');for(const k of ['elements','dialogs','masks'])s.ui[k].push(...n.output.ui[k]);cursor=n.output.page?.next_cursor;}
  return s;
 };
 const act=async(s,e,verb='click',extra={})=>{const r=await runtime.uiAct({verb,ref:e.ref,...extra},{operationId:'cold-source-nav-'+randomId(),observationId:s.observation_id});need(r.status==='SUCCEEDED'&&r.cleanup_complete,'storage navigation uncertain');};
 const ready=async(fn,predicate)=>{const deadline=Date.now()+15000;for(;;){const s=await fn();if(s&&predicate(s))return s;need(Date.now()<deadline,'storage readiness timeout');await new Promise(r=>setTimeout(r,100));}};
 const roots=async()=>{
  // Storage navigation may finish while observation pages are being read.
  // Restart from fresh roots only; never reuse a cursor or scoped stale ref.
  for(let attempt=0;attempt<3;attempt++)try{return await read({scope:'roots'});}
  catch(error){if(!String(error.message).startsWith('Workspace changed between observation pages;')||attempt===2)throw error;}
 };
 const detail=(s,e)=>read({rootRef:e.ref,observationId:s.observation_id});
 const directory=()=>ready(async()=>{const s=await roots(),bar=s.ui.elements.find(e=>e.tid===s.workflow_ref.prefix+';NavigationBar;NavigationPanel');return bar?detail(s,bar):null;},s=>s.file_storage?.status==='observed');
 const row=async(name,parent)=>{
  let last;const observed=async options=>{const s=await read(options.root_ref?{rootRef:options.root_ref,observationId:last?.observation_id}:{scope:'roots',...(options.storage_name?{storageName:options.storage_name}:{})});need(s.dom_epoch.document===parent.dom_epoch.document&&JSON.stringify(s.workflow_ref)===JSON.stringify(parent.workflow_ref),'storage owner changed');last=s;return s;};
  return findNativeStorageRow({name,roots:()=>observed({discover_roots:true}),read:observed,ready,act,guard:()=>{}});
 };
 let s=await roots();
 if(!s.ui.elements.some(e=>e.tid?.includes(';FileStorageForm;'))){const toolbar=one(s.ui.elements.filter(e=>e.tid==='MF;cntMain;tlbMainToolbar'),'toolbar');s=await detail(s,toolbar);await act(s,one(s.ui.elements.filter(e=>e.tid==='MF;cntMain;tlbMainToolbar;btnFilestorage'&&e.allowed_actions.includes('click')),'files button'));}
 s=await directory();
 const own='/'+account;
 if(s.file_storage.directory!==own){
  if(s.file_storage.directory!=='/'){await act(s,one(s.ui.elements.filter(e=>e.tid===s.workflow_ref.prefix+';cnrNaviMode;b.s_Сервер>Файлы'&&e.allowed_actions.includes('click')),'storage root'));s=await directory();need(s.file_storage.directory==='/','storage root changed');}
  const r=await row(account,s);await act(r,one(r.ui.elements.filter(e=>e.label===account&&e.storage_entry?.kind==='folder'&&e.allowed_actions.includes('double_click')),'own source folder'),'double_click');s=await directory();
 }
 need(s.file_storage.directory===own,'own storage required');
 const proofs=new Map();
 for(const source of sources.imports){
  const path=source.configuration.source.source_path;
  if(!proofs.has(path)){
   const name=path.split('/').at(-1),r=await row(name,s),e=one(r.ui.elements.filter(e=>e.label===name&&e.storage_entry?.kind!=='folder'&&e.storage_entry?.bytes_source==='native_file_store'),'exact source file');
   need(allowed.some(f=>f.bytes===e.storage_entry.bytes),'source size differs before download');
   const downloadPath=join(output,'source-'+proofs.size+'.csv'),artifact={artifact_id:'cold-source-'+proofs.size,name,upload:{directory:own,destination:path,grant_id:'cold-source-readonly'}};
   const result=await execute(makeArtifactDownloadCode({artifact,snapshot:r,file_ref:e.ref,operation_id:artifact.artifact_id,expected_origin:origin,expected_build:'7.4.2',download_path:downloadPath}));
   need(result.status==='SUCCEEDED'&&result.cleanup_complete&&result.output.download_completed,'source download unconfirmed');
   const bytes=await readFile(downloadPath);need(bytes.length<=16777216,'source byte bound');const sha256=createHash('sha256').update(bytes).digest('hex');
   const fixture=one(allowed.filter(f=>f.sha256===sha256&&f.bytes===bytes.length),'source fixture mismatch');
   proofs.set(path,{destination:path,bytes:bytes.length,sha256,bytes_verified:true,download_completion_verified:true,provenance:'independent_server_file_download',fixture});
  }
  source.source=proofs.get(path);
  const observed=JSON.stringify(source.configuration.output_mapping.fields.map(f=>pick(f,['name','label','type'])));
  need([source.source.fixture.columns,...(source.source.fixture.output_orders??[])].some(cols=>observed===JSON.stringify(cols)),'source fixture schema differs');
 }
 return proofs;
}
let id=0;const randomId=()=>String(++id);

