import test from 'node:test';
import assert from 'node:assert/strict';
import {findNativeStorageRow,readNativeExportFile} from '../lib/text-export-output.mjs';
function fixture({start=0,at=1500,end=3000,stuck=false,changeFolder=false,changeOwner=false,visible,above=false}={}){
 let top=start,moves=0;const trace=[];
 const workflow_ref={prefix:'MF;TF-1',tab_tid:'tab'},tid=workflow_ref.prefix+';FileStorageForm;colName_wanted.csv';
 const snapshot=elements=>({workflow_ref,file_storage:{status:'observed',directory:changeFolder&&moves?'/other':'/test-2'},ui:{elements,dialogs:[],masks:[]}});
 const anchor=()=>({ref:'anchor',tid:workflow_ref.prefix+';FileStorageForm;colName_anchor',...(visible?{label:visible,storage_entry:{kind:'file'}}:{}),scroll:{ref:changeOwner&&moves?'other':'owner',top,max_top:end},allowed_actions:['scroll'],interaction:{state:'point_observed'}});
 const target=()=>({ref:'target',tid,label:'wanted.csv'});
 const reached=()=>above?top<=at:top>=at;
 const read=async o=>o.discover_roots?snapshot(reached()?[{...target(),label:''}]:[]):snapshot(o.root_ref==='target'?[target()]:[anchor(),...(reached()?[target()]:[])]);
 return {trace,args:{name:'wanted.csv',read,roots:async()=>snapshot([{ref:'table',tid:workflow_ref.prefix+';FileStorageForm;pnlFileStorage;tbl'}]),ready:async fn=>fn(),guard:()=>{},act:async(s,e,v,extra)=>{assert.equal(v,'scroll');assert.ok(Math.abs(extra.delta_y)<=1000);trace.push(extra.delta_y);moves++;if(!stuck)top+=extra.delta_y;}}};
}
test('virtual file search renders a missing row with bounded scrolling',async()=>{const f=fixture();const r=await findNativeStorageRow(f.args);assert.equal(r.ui.elements[0].label,'wanted.csv');assert.deepEqual(f.trace,[1000,1000]);});
test('already rendered exact file needs no gesture',async()=>{const f=fixture({at:0});await findNativeStorageRow(f.args);assert.deepEqual(f.trace,[]);});
test('search resets an existing scroll before traversing',async()=>{const f=fixture({start:500,at:1500});await findNativeStorageRow(f.args);assert.deepEqual(f.trace,[-500,1000,1000]);});
for(const [label,options,error] of [['stuck',{stuck:true},/did not advance/],['folder',{changeFolder:true},/folder changed/],['owner',{changeOwner:true},/owner changed/],['end',{at:4000},{code:'STORAGE_ENTRY_UNAVAILABLE',storage_entry:{name:'wanted.csv',directory:'/test-2',reason:'folder_end'}}],['budget',{at:10000000,end:10000000},{code:'EXPORT_SEARCH_BUDGET_EXHAUSTED',message:'Export file search scroll budget exhausted'}]])test('virtual search refuses '+label,async()=>{const f=fixture(options);await assert.rejects(findNativeStorageRow(f.args),error);assert.ok(f.trace.length<=(label==='budget'?964:40),String(f.trace.length));});
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
// LAB-1843: Files keeps its scroll position between lookups. Native rows are
// ordered by name; a deeper target must not first rewind the whole folder.
test('search continues down from a kept position when the target sorts below the observed rows',async()=>{const f=fixture({start:20000,at:21500,end:24000,visible:'lab1824-r10a-typed.csv'});const r=await findNativeStorageRow(f.args);assert.equal(r.ui.elements[0].label,'wanted.csv');assert.deepEqual(f.trace,[1000,1000]);});
test('native order keeps numeric name runs: sales_2026-10 sorts below sales_2026-9',async()=>{const f=fixture({start:2000,at:3000,end:4000,visible:'sales_2026-9.csv'});f.args.name='sales_2026-10.csv';const r=await findNativeStorageRow({...f.args,read:async o=>{const s=await f.args.read(o);for(const e of s.ui.elements)if(e.ref==='target')Object.assign(e,{tid:e.tid.replace('wanted.csv','sales_2026-10.csv'),label:'sales_2026-10.csv'});return s;}});assert.equal(r.ui.elements[0].label,'sales_2026-10.csv');assert.deepEqual(f.trace,[1000]);});
test('a target sorting above the observed rows still rewinds first',async()=>{const f=fixture({start:2500,at:500,end:4000,visible:'zz-last.csv',above:true});await findNativeStorageRow(f.args);assert.deepEqual(f.trace,[-1000,-1000]);});
test('an absent file is refused only after both directions from a kept position',async()=>{const f=fixture({start:2000,at:99999,end:4000,visible:'a.csv'});await assert.rejects(findNativeStorageRow(f.args),{code:'STORAGE_ENTRY_UNAVAILABLE',storage_entry:{name:'wanted.csv',directory:'/test-2',reason:'folder_end'}});assert.deepEqual(f.trace,[1000,1000,-1000,-1000,-1000,-1000]);});
// LAB-1872: Loginom 7.4.2 Files has no name filter. Each scroll gesture
// returns its own post-scroll table observation; the search chains gestures
// on it toward the target's native place and reads only there.
function orderedFolder({count=1500,start=0,wanted=1200,observed=true,unsettled=false,changeFolder=false,stuckAt=null}={}){
 const row=24,view=600,buffer=40,max_top=count*row-view,trace=[],reads=[];let top=start;
 const workflow_ref={prefix:'MF;TF-1',tab_tid:'tab'},name=i=>'f'+String(i).padStart(4,'0')+'.csv';
 const folder=()=>changeFolder&&trace.length>2?'/other':'/test-2';
 const snapshot=elements=>({workflow_ref,file_storage:{status:'observed',directory:folder()},ui:{elements,dialogs:[],masks:[]}});
 const first=()=>Math.floor(top/row),rendered=i=>i>=first()&&i<first()+buffer&&i<count;
 const rows=(settled=true)=>{const out=[];for(let i=first();rendered(i);i++)out.push({ref:'r'+i,tid:workflow_ref.prefix+';FileStorageForm;colName_'+name(i),label:name(i),
  storage_entry:{kind:'file',directory_entries:count},scroll:{ref:'owner',top,max_top},allowed_actions:settled?['click','scroll']:['click'],interaction:{state:settled?'point_observed':'point_not_observed'}});return out;};
 const target=typeof wanted==='number'?name(wanted):wanted,index=typeof wanted==='number'?wanted:-1;
 const read=async o=>{reads.push(o.discover_roots?'roots':o.root_ref);
  if(o.discover_roots)return snapshot(index>=0&&rendered(index)?[{ref:'target',tid:workflow_ref.prefix+';FileStorageForm;colName_'+target,label:''}]:[]);
  return snapshot(o.root_ref==='target'?[{ref:'target',tid:workflow_ref.prefix+';FileStorageForm;colName_'+target,label:target}]:rows());};
 const act=async(s,e,v,extra)=>{assert.equal(v,'scroll');assert.ok(Math.abs(extra.delta_y)<=1000);assert.equal(e.scroll.top,top);trace.push(extra.delta_y);
  if(stuckAt===null||trace.length<stuckAt)top=Math.max(0,Math.min(max_top,top+extra.delta_y));return observed?snapshot(rows(!unsettled)):undefined;};
 return {trace,reads,max_top,args:{name:target,read,roots:async()=>{reads.push('table-roots');return snapshot([{ref:'table',tid:workflow_ref.prefix+';FileStorageForm;pnlFileStorage;tbl'}]);},ready:async fn=>fn(),guard:()=>{},act}};
}
test('a file deep in a 1500-entry folder is reached by chained gestures with reads only at its place',async()=>{
 const f=orderedFolder();const r=await findNativeStorageRow(f.args);assert.equal(r.ui.elements[0].label,'f1200.csv');
 assert.ok(f.trace.length<=29,String(f.trace.length));assert.ok(f.reads.length<=6,JSON.stringify(f.reads));
});
for(const [label,options] of [['unsettled',{unsettled:true}],['missing',{observed:false}]])
 test('a post-scroll observation that is '+label+' falls back to one roots and table read per gesture',async()=>{
  const f=orderedFolder({count:300,wanted:200,...options});const r=await findNativeStorageRow(f.args);assert.equal(r.ui.elements[0].label,'f0200.csv');
  // No per-step row lookup on the approach: only the initial and the final one.
  assert.equal(f.reads.filter(x=>x==='roots').length,2,JSON.stringify(f.reads));
  assert.equal(f.reads.filter(x=>x==='table-roots').length,f.trace.length+1,JSON.stringify(f.reads));
 });
test('a file above a kept position is reached upward by chained gestures',async()=>{
 const f=orderedFolder({start:30000,wanted:100});const r=await findNativeStorageRow(f.args);assert.equal(r.ui.elements[0].label,'f0100.csv');
 assert.ok(f.trace.every(d=>d<0));assert.ok(f.reads.length<=6,JSON.stringify(f.reads));
});
test('an absent name after a chained jump is refused only after both directions',async()=>{
 const f=orderedFolder({count:300,wanted:'f0200x.csv'});const steps=[0];let top=0;const act=f.args.act;
 f.args.act=async(s,e,v,extra)=>{top=e.scroll.top+extra.delta_y;steps.push(Math.max(0,Math.min(f.max_top,top)));return act(s,e,v,extra);};
 await assert.rejects(findNativeStorageRow(f.args),{code:'STORAGE_ENTRY_UNAVAILABLE',storage_entry:{name:'f0200x.csv',directory:'/test-2',reason:'folder_end'}});
 assert.ok(steps.includes(0)&&steps.includes(f.max_top),JSON.stringify(steps));
});
for(const [label,options,error] of [['folder',{changeFolder:true},/folder changed/],['stuck',{stuckAt:3},/did not advance/]])
 test('a chained jump refuses '+label,async()=>{const f=orderedFolder(options);await assert.rejects(findNativeStorageRow(f.args),error);assert.ok(f.trace.length<=40);});
// LAB-1872 lab1872-b1 text-file-info :242: a settled Files scroll had 29
// anchors, but its paged observation delivered only the 8 buffer and
// header-covered rows above them. Storage navigation retains it whole.
test('a storage scroll retained whole delivers the anchors that issue the next gesture; the public page does not',async()=>{
 const {createActionRuntime}=await import('../lib/executor.mjs');
 const {actions,selectors,build}=await import('./support/executor-fixture.mjs');
 const prefix='MF;TF-2',owner='ui-owner';let top=0;
 const row=(i,state)=>({ref:'ui-r'+i,tid:prefix+';FileStorageForm;colName_f'+i+'.csv',kind:'control',role:'gridcell',label:'f'+i+'.csv',scope:'workspace',
  storage_entry:{kind:'file',directory_entries:58,path:'/w/'+'x'.repeat(1200)+i},scroll:{ref:owner,top,max_top:24000},enabled:true,visible:true,
  interaction:{state},bounding_box:{x:0,y:i*24,width:400,height:23},allowed_actions:state==='point_observed'?['click','scroll']:['click']});
 const snapshot=()=>({origin:'https://loginom.invalid',authenticated:true,loginom_build:build,workflow_ref:{prefix,tab_tid:'tab'},active_tab_ref:'tab',
  file_storage:{status:'observed',directory:'/w'},dom_epoch:{document:'doc'},observation_root:{ref:'ui-tbl',identity:{anchor_tid:prefix+';FileStorageForm;pnlFileStorage;tbl',path:[]}},
  ui:{elements:Array.from({length:58},(_,i)=>row(i,i<5?'outside_viewport':i<8?'point_not_observed':i<37?'point_observed':'outside_viewport')),dialogs:[],masks:[],messages:[],table_cells:[]}});
 const execute=async code=>{const act=code.includes('"mode":"act"');if(act)top+=1000;
  return {status:'SUCCEEDED',action_key:act?'ui.act':'workspace.observe',action_revision:'1',operation_id:null,phase:act?'completed':'observed',
   effect_possible:act,cleanup_complete:true,output:snapshot(),error:null,trace:[]};};
 const runtime=createActionRuntime({pinned:{actions,selectors,pins:{},compatibility:{loginom_build:build}},allowCandidate:true,execute,now:()=>Date.now(),targetOrigin:'https://loginom.invalid'});
 const anchors=output=>output.ui.elements.filter(e=>e.allowed_actions?.includes('scroll')&&e.interaction?.state==='point_observed');
 for(const whole of [false,true]){
  const s=await runtime.observe({whole:true}),a=anchors(s.output)[0];
  const r=await runtime.uiAct({verb:'scroll',ref:a.ref,delta_y:1000},{observationId:s.output.observation_id,operationId:'scroll-'+whole,...(whole?{whole}:{})});
  assert.equal(r.status,'SUCCEEDED',JSON.stringify(r.error));
  if(!whole){assert.equal(anchors(r.output).length,0);continue;}
  const next=anchors(r.output);assert.equal(next.length,29);assert.equal(next[0].scroll.top,top);
  const second=await runtime.uiAct({verb:'scroll',ref:next[0].ref,delta_y:1000},{observationId:r.output.observation_id,operationId:'scroll-next',whole:true});
  assert.equal(second.status,'SUCCEEDED',JSON.stringify(second.error));
 }
});
// LAB-1897: a grown shared folder (1794-1802 entries) put the exported
// file last; a fixed 40-gesture budget stopped at top=40000. Search reaches
// any position of the 10000-entry FileStore inventory, and absence is still
// refused only after both directions. Gestures stay within 1000 px.
for(const count of [2000,10000])for(const [where,wanted] of [['end',count-1],['start',0],['absent','zz-absent.csv']])
 test('a '+count+'-entry folder: target '+where,async()=>{
  const f=orderedFolder({count,wanted}),length=Math.ceil(f.max_top/1000);
  if(where==='absent'){
   const steps=[0],act=f.args.act;f.args.act=async(s,e,v,extra)=>{steps.push(Math.max(0,Math.min(f.max_top,e.scroll.top+extra.delta_y)));return act(s,e,v,extra);};
   await assert.rejects(findNativeStorageRow(f.args),{code:'STORAGE_ENTRY_UNAVAILABLE',storage_entry:{name:'zz-absent.csv',directory:'/test-2',reason:'folder_end'}});
   assert.ok(steps.includes(f.max_top)&&steps.at(-1)===0,JSON.stringify(steps.slice(-3)));
   assert.ok(f.trace.length<=2*length+2,String(f.trace.length));return;
  }
  const r=await findNativeStorageRow(f.args);assert.equal(r.ui.elements[0].label,typeof wanted==='number'?'f'+String(wanted).padStart(4,'0')+'.csv':wanted);
  // The approach chains on post-scroll observations: one read pair at the place.
  assert.ok(f.trace.length<=(where==='end'?length:0),String(f.trace.length));assert.ok(f.reads.length<=6,JSON.stringify(f.reads.slice(-8)));
 });
test('a 10000-entry folder: a target at the start is reached upward from a kept end position',async()=>{
 const f=orderedFolder({count:10000,wanted:0,start:10000*24-600});const r=await findNativeStorageRow(f.args);assert.equal(r.ui.elements[0].label,'f0000.csv');
 assert.ok(f.trace.every(d=>d<0)&&f.trace.length<=Math.ceil(f.max_top/1000),String(f.trace.length));
});
