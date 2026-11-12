import test from 'node:test';
import assert from 'node:assert/strict';
import {findNativeStorageRow,readNativeExportFile} from '../lib/text-export-output.mjs';
function fixture({start=0,at=1500,end=3000,stuck=false,changeFolder=false,changeOwner=false}={}){
 let top=start,moves=0;const trace=[];
 const workflow_ref={prefix:'MF;TF-1',tab_tid:'tab'},tid=workflow_ref.prefix+';FileStorageForm;colName_wanted.csv';
 const snapshot=elements=>({workflow_ref,file_storage:{status:'observed',directory:changeFolder&&moves?'/other':'/test-2'},ui:{elements,dialogs:[],masks:[]}});
 const anchor=()=>({ref:'anchor',tid:workflow_ref.prefix+';FileStorageForm;colName_anchor',scroll:{ref:changeOwner&&moves?'other':'owner',top,max_top:end},allowed_actions:['scroll'],interaction:{state:'point_observed'}});
 const target=()=>({ref:'target',tid,label:'wanted.csv'});
 const read=async o=>o.discover_roots?snapshot(top>=at?[{...target(),label:''}]:[]):snapshot(o.root_ref==='target'?[target()]:[anchor()]);
 return {trace,args:{name:'wanted.csv',read,roots:async()=>snapshot([{ref:'table',tid:workflow_ref.prefix+';FileStorageForm;pnlFileStorage;tbl'}]),ready:async fn=>fn(),guard:()=>{},act:async(s,e,v,extra)=>{assert.equal(v,'scroll');assert.ok(Math.abs(extra.delta_y)<=1000);trace.push(extra.delta_y);moves++;if(!stuck)top+=extra.delta_y;}}};
}
test('virtual file search renders a missing row with bounded scrolling',async()=>{const f=fixture();const r=await findNativeStorageRow(f.args);assert.equal(r.ui.elements[0].label,'wanted.csv');assert.deepEqual(f.trace,[1000,1000]);});
test('already rendered exact file needs no gesture',async()=>{const f=fixture({at:0});await findNativeStorageRow(f.args);assert.deepEqual(f.trace,[]);});
test('search resets an existing scroll before traversing',async()=>{const f=fixture({start:500,at:1500});await findNativeStorageRow(f.args);assert.deepEqual(f.trace,[-500,1000,1000]);});
for(const [label,options,error] of [['stuck',{stuck:true},/did not advance/],['folder',{changeFolder:true},/folder changed/],['owner',{changeOwner:true},/owner changed/],['end',{at:4000},{code:'STORAGE_ENTRY_UNAVAILABLE',storage_entry:{name:'wanted.csv',directory:'/test-2',reason:'folder_end'}}],['budget',{at:50000,end:50000},/budget exhausted/]])test('virtual search refuses '+label,async()=>{const f=fixture(options);await assert.rejects(findNativeStorageRow(f.args),error);assert.ok(f.trace.length<=40);});
test('a file deep in a grown shared folder is still found',async()=>{const f=fixture({at:19000,end:19700});const r=await findNativeStorageRow(f.args);assert.equal(r.ui.elements[0].label,'wanted.csv');assert.equal(f.trace.length,19);});
test('cancelled search performs no gesture',async()=>{const f=fixture();f.args.guard=()=>{throw Error('cancelled');};await assert.rejects(findNativeStorageRow(f.args),/cancelled/);assert.deepEqual(f.trace,[]);});

// Exercise the production act closure, not a replacement search gesture.
for(const code of ['UI_SCAN_LIMIT','UI_SCROLL_NOT_CONFIRMED'])for(const fault of ['none','folder','tab','workflow','package','document','root','mask','unclean','other_code'])test('export observes an ambiguous scroll without replay: '+code+' / '+fault,async()=>{
 const workflow={prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',workflow_id:'workflow',navigation_path:[{tid:'path',label:'Scenario'}]},node={document_id:'doc',workflow_id:'workflow',node_id:'node'};
 const targetOrigin='https://export.test',records=[],reads=[],gestures=[];
 let files=false,moved=false,downloaded=false,retained=false;
 const ref=tid=>'ui-'+tid.replace(/[^a-zA-Z0-9-]/g,'-');
 const element=(tid,extra={})=>({ref:ref(tid),tid,allowed_actions:['click'],...extra});
 const snapshot=task=>{
  const prefix=files?'MF;TF-2':workflow.prefix;
  return {authenticated:true,origin:targetOrigin,loginom_build:'7.4',dom_epoch:{document:'browser'},
   workflow_ref:{prefix,tab_tid:files?'files-tab':workflow.tab_tid},active_tab_ref:files?'files-tab':workflow.tab_tid,package_identity:null,
   observation_root:{ref:task.root_ref},observation_kind:task.discover_roots?'roots':'region',wizard:{status:'absent'},
   prepared_node_context:{...node,verified:true,surface:'graph',locked:false},file_storage:files?{status:'observed',directory:'/user'}:undefined,
   ui:{dialogs:[],masks:[],truncated:{dialogs:false,masks:false},elements:[
    element('MF;cntMain;tlbMainToolbar'),element('MF;cntMain;tlbMainToolbar;btnFilestorage'),
    element('MF;cntMain;cntWorkspace;Workspace;t.br'),element(workflow.tab_tid),element('files-tab'),
    element(workflow.prefix+';ModelForm;cmpDiagram'),element(prefix+';NavigationBar;NavigationPanel'),
    element(prefix+';FileStorageForm;btnRefresh'),element(prefix+';FileStorageForm;pnlFileStorage;tbl'),
    element(prefix+';FileStorageForm;colName_anchor',{label:'anchor',allowed_actions:['scroll'],interaction:{state:'point_observed'},scroll:{ref:'owner',top:moved?1000:0,max_top:3000}}),
    ...(moved?[element(prefix+';FileStorageForm;colName_wanted.csv',{label:'wanted.csv',allowed_actions:['click','double_click'],storage_entry:{kind:'file',bytes:12}})]:[])]}};
 };
 const options={operation:{id:'export'},targetOrigin,targetBuild:'7.4',storageDirectories:{packages:'/user',inputs:'/user',exports:'/user'},
  receiptOptions:()=>({}),onRecord:async e=>{records.push(e);return e;},
  artifactStore:{outputSessionId:'session',stageOutput:async()=>({artifact_id:'artifact',path:'/private/wanted.csv',release:async()=>{},
   verify:async()=>({artifact_id:'artifact',bytes:12,sha256:'abc'}),retain:async()=>{retained=true;}})},
  execute:async source=>{
   if(source.startsWith('async page=>('))return {...node,verified:!files,surface:'graph',locked:false};
   if(source.includes('async function browserArtifactDownload')){
    downloaded=true;return {operation_id:'export:export-download',action_key:'artifact.download',status:'SUCCEEDED',cleanup_complete:true,
     output:{destination:'/user/wanted.csv',artifact_id:'artifact',download_completed:true,output_binding:{execution_id:'exec'},suggested_name:'wanted.csv'}};
   }
   const match=source.match(/\)\(page, (\{"mode":[\s\S]*?\}), (?:async )?function readPreparedNodeContext/);
   assert.ok(match,'production observation or gesture');const task=JSON.parse(match[1]);
   if(task.mode==='act'){
    gestures.push(task.action);
    if(task.action.ref.endsWith('btnFilestorage'))files=true;
    if(task.action.ref===ref(workflow.tab_tid))files=false;
    if(task.action.verb==='scroll'){
     assert.equal(moved,false,'scroll must not replay');moved=true;
     return {status:'AMBIGUOUS',action_key:'ui.act',operation_id:task.operation_id,effect_possible:true,cleanup_complete:fault!=='unclean',error:{code:fault==='other_code'?'UI_CONTEXT_CHANGED':code}};
    }
    return {status:'SUCCEEDED',cleanup_complete:true};
   }
   reads.push(task);const output=snapshot(task);
   if(files&&moved&&!downloaded){
    if(fault==='folder')output.file_storage.directory='/other';
    if(fault==='tab')output.active_tab_ref='other';
    if(fault==='workflow')output.workflow_ref.prefix='other';
    if(fault==='package')output.package_identity={name:'other'};
    if(fault==='document')output.dom_epoch.document='other';
    if(fault==='root')output.observation_root.ref='other';
    if(fault==='mask')output.ui.masks=[{kind:'loading'}];
   }
   return {status:'SUCCEEDED',output};
  }};
 const ctx={...node,node,workflow_ref:workflow,execution:{execution_id:'exec'},deadline:Date.now()+10000};
 const run=()=>readNativeExportFile(options,ctx,{destination:'/user/wanted.csv',configured:{destination_check:{verified:true,destination:'/user/wanted.csv',existed:false}}},
  {verified:true,owner_verified:true,status:'completed',execution_id:'exec'});
 if(fault==='none'){
  const result=await run();assert.equal(result.artifact_id,'artifact');assert.equal(retained,true);
  const completed=records.findIndex(e=>e.phase==='export_file_step_completed'&&e.outcome.status==='AMBIGUOUS');assert.ok(completed>=0);
  assert.ok(reads.filter(t=>t.root_ref===ref('MF;TF-2;FileStorageForm;pnlFileStorage;tbl')).length>=3);
 }else{
  // The public refusal is generic after a restored navigation; its journal
  // keeps the allowlisted cause, so pin both instead of accepting any rejection.
  await assert.rejects(run(),{document:/Export observation document changed/,mask:/Export file read did not return to its workflow/}[fault]??/downloading was not confirmed/);
  const failure=records.find(e=>e.phase==='export_file_read_refused_restored')?.proof.failure;
  if(!['document','mask'].includes(fault))assert.deepEqual(failure,{step:'storage_navigation',code:null,kind:'Error',reason:['unclean','other_code'].includes(fault)?'Export storage gesture requires inspection':null});
  assert.equal(downloaded,false);assert.equal(retained,false);
 }
 assert.equal(gestures.filter(a=>a.verb==='scroll').length,1);
});
