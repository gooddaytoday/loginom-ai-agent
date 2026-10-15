import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=process.env.CALCULATOR_RUNTIME??new URL('..',import.meta.url).pathname;
const lib=p=>pathToFileURL(root+'/client/lib/'+p).href;
let state;
const originals={};
for(const p of ['node-target-browser.mjs','node-graph-selection.mjs','node-procedure.mjs','port-mapping-procedure.mjs','node-wizard-close.mjs','node-context.mjs'])originals[p]=await import(lib(p));
mock.module(lib('node-context.mjs'),{namedExports:{...originals['node-context.mjs'],readPreparedNodeContext:async page=>page.nodeContext}});
// Explicit offline substitutes for guarded executor procedures; the actual
// harness, transport wrapper and in-page raw collector are NOT replaced.
mock.module(lib('node-target-browser.mjs'),{namedExports:{...originals['node-target-browser.mjs'],readGraph:async page=>page.graph}});
mock.module(lib('node-graph-selection.mjs'),{namedExports:{...originals['node-graph-selection.mjs'],selectPreparedGraphNode:async()=>{state.events.push('select');}}});
mock.module(lib('node-procedure.mjs'),{namedExports:{...originals['node-procedure.mjs'],createNodeProcedure:()=>({
 observe:async()=>state.snapshot(),openOutputPort:async()=>{state.events.push('open-output');state.open=true;},
 perform:async spec=>{const s=state.snapshot();assert.ok(spec.ready(s));const action=spec.resolve(s);assert.equal(action.verb,'click');state.events.push(action.ref);if(action.ref==='links')state.links=true;else {assert.equal(action.ref,'fetch');if(state.scenario==='fetch-unknown')throw Error('unknown fetch');state.fetched=true;}}
})}});
mock.module(lib('port-mapping-procedure.mjs'),{namedExports:{...originals['port-mapping-procedure.mjs'],excludeOutputField:async()=>{
 state.events.push('exclude');state.edited=true;return {verified:true,cleanup_complete:true,settings_applied:false};
}}});
mock.module(lib('node-wizard-close.mjs'),{namedExports:{...originals['node-wizard-close.mjs'],closePreparedWizard:async()=>{
 state.events.push('cancel');return {verified:true,cleanup_complete:true,draft_discarded:true,
 settings_applied:false,execution_started:false,node_context:{document_id:'doc',node_id:'node',workflow_id:'flow'}};
}}});
const {captureCalculator}=await import(pathToFileURL(root+'/src/acceptance/calculator-grouped-before-done-v1.mjs'));
function pageDouble(scenario){
 const events=[];
 const element=(tid,id)=>({id,tagName:'DIV',children:[],parentElement:null,
  isConnected:true,getAttribute:k=>k==='data-tid'?tid:k==='id'?id:null,
  getBoundingClientRect:()=>({x:0,y:0,width:50,height:20}),clientWidth:50,clientHeight:20,scrollWidth:50,scrollHeight:20,scrollLeft:0,scrollTop:0,
  classList:{contains:()=>true}});
 const tab=element('MF;cntMain;cntWorkspace;Workspace;t.br;tb','tab');
 const grids=[element('root;grdSourceColumns;tbl','source-grid'),element('root;grdTargetColumns;tbl','target-grid')];
 const root=element('root','root');root.children=grids;grids.forEach(e=>e.parentElement=root);
 grids.forEach((g,i)=>{const r=element('row-'+i,'row-'+i);r.parentElement=g;r.getAttribute=k=>({'data-recordindex':'0','data-recordid':state.edited?'after':'before','data-boundview':g.id}[k]??null);g.children=[r];g.querySelectorAll=()=>[r];});
 root.querySelectorAll=selector=>[grids[selector.includes('Source')?0:1]];
 const document={querySelectorAll:selector=>selector.includes('t.br;tb')?[tab]:selector.includes('root')?[root]:[]};
 const records=()=>[{internalId:state.edited?'after':'before',data:{Name:'Region',ID:20,Index:0,GroupField:state.edited?'Исключенные':''}}];
 const view=e=>({el:{dom:e},getStore:()=>{
  const items=records();return {$className:'Ext.data.Store',isBufferedStore:false,currentPage:1,loading:false,getCount:()=>items.length,getTotalCount:()=>items.length,isLoading:()=>false,getRemoteFilter:()=>scenario==='filter',getRemoteSort:()=>false,getData:()=>({items,getSource:()=>({items})}),getProxy:()=>({$className:'bg.ext.CollectionProxy',pendingOperations:{}})};
 }});
 state={events,scenario,links:false,fetched:false,open:false,edited:false,snapshot:()=>({prepared_node_context:{verified:true,surface:state.open?'wizard':'graph',document_id:'doc',workflow_id:'flow',node_id:scenario==='node'?'foreign':'node',tid:scenario==='node-root'?'foreign':'root'},
  wizard:state.open?{status:'observed',stage:'output_mapping',root_tid:'root',root_ref:'ref',owner_context:{status:'observed',node_id:'node'}}:{status:'absent'},
  ui:{elements:[{tid:'root;DerivedDataSourceOutputSocketWizard;rbLinks;DisplayEl',ref:'links',check_state:{checked:state.links},allowed_actions:['click']},{tid:'root;DerivedDataSourceOutputSocketWizard;btnGetSourceColumns',ref:'fetch',visible:state.links,enabled:true,allowed_actions:['click']}]},
  node_mapping:{node_context:{output_port:{port_guid:scenario==='port'?'foreign':'4ba0e2c2-69ad-3a32-bbdc-75714efe7a51'}},verified:true,inventory_complete:true,source_identity_verified:state.fetched,mapping_wizard:'DerivedDataSourceOutputSocketWizard',
   target_fields:[{name:'Region',label:scenario==='label'?'wrong':'Region display',record_id:state.edited?'after':'before',excluded:state.edited,
    ...(state.edited?{exclusion_source:{record_id:'source',field_id:'20',name:scenario==='source-name'?'wrong':'Region'}}:{source:{record_id:'source',field_id:'20',name:scenario==='source-name'?'wrong':'Region'}})}]}})};
 globalThis.document=document;globalThis.location={origin:'https://loginom.invalid'};
 globalThis.bg={app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:{UserName:'account'}}}}}}};
 globalThis.Ext={getCmp:id=>view(grids.find(e=>e.id===id))};
 globalThis[Symbol.for('loginom-dock.workspace-ui.identity.v1')]={document,refs:new Map([['ref',new WeakRef(root)]])};
 if(scenario==='root-ref')globalThis[Symbol.for('loginom-dock.workspace-ui.identity.v1')].refs.clear();
 if(scenario==='partial')grids[1].querySelectorAll=()=>[];
 if(scenario==='store')globalThis.Ext={getCmp:()=>({el:{dom:root}})};
 globalThis.__loginomDockPreparationV1={document,id:scenario==='document'?'foreign':'doc',receipts:new Map([['r',{phase:'verified',tab,packageNode:{},workflowId:'flow',crumbs:[]}]])};
 const page={get nodeContext(){return state.snapshot().prepared_node_context;},graph:{complete:true,nodes:[{type:'transform.calculator',label:'LAB66CaptureCalculator',ref:{document_id:'doc',workflow_id:'flow',node_id:'node'}}]},evaluate:async(fn,arg)=>fn(arg)};
 const browser={callTool:async({arguments:{code}})=>{
  events.push('browser');const result=await new Function('page','return ('+code+')(page)')(page);
  return {content:[{type:'text',text:JSON.stringify(result)}]};
 }};
 return {events,browser,root,grids,page};
}
for(const scenario of ['success','document','node','node-root','root-ref','partial','filter','store'])test('actual collector to harness with labelled Page/Ext/executor doubles: '+scenario,async()=>{
 const {events,browser}=pageDouble(scenario),binding={revision:1,harness:'calculator-grouped-before-done-v1',owner:'owner',run:'run',lease:'owner:run',admission:'admission',chat:'chat',account:'account',session:'session',generation:1,expires:Date.now()+60000,packagePath:'/account/draft.lgp'};
 const identity={session_id:'session',document_id:'doc',account:'account',package_path:binding.packagePath,tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb',loginom_build:'7.4.2'};
 if(scenario==='lease')binding.lease='foreign';if(scenario==='run')binding.run='foreign';if(scenario==='session')binding.session='foreign';
 try{
  if(scenario==='success'){
   const result=await captureCalculator({binding,identity,browser,record:async()=>{}});
   assert.equal(result.cancel_verified,true);assert.equal(result.capture_complete,false);assert.equal(result.native_verified,false);assert.equal(result.before.collector_revision,1);assert.ok(result.before.predicates.cached_windows.every(p=>p.value===true));
   assert.equal(result.before.dom.length,5);assert.equal(result.before.stores[1].records[0].internalId,'before');
   assert.equal(result.after.stores[1].records[0].data.GroupField,'Исключенные');
   assert.deepEqual(events.filter(e=>e!=='browser'),['select','open-output','links','fetch','exclude','cancel']);
  }else {await assert.rejects(captureCalculator({binding,identity,browser,record:async()=>{}}));assert.equal(events.includes('exclude'),false);}
 }finally{for(const k of ['document','location','bg','Ext','__loginomDockPreparationV1'])delete globalThis[k];delete globalThis[Symbol.for('loginom-dock.workspace-ui.identity.v1')];}
});

const {makeCalculatorCaptureCode}=await import(pathToFileURL(root+'/src/acceptance/calculator-capture-adapter.mjs'));
const {CAPTURE_LIMITS}=await import(pathToFileURL(root+'/src/acceptance/calculator-grouped-before-done-v1.mjs'));
const identity={session_id:'session',document_id:'doc',account:'account',package_path:'/account/draft.lgp',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb',loginom_build:'7.4.2'};
const owner={...identity,workflow_id:'flow',node_id:'node'};
const binding=()=>({revision:1,harness:'calculator-grouped-before-done-v1',owner:'owner',run:'run',lease:'owner:run',admission:'admission',chat:'chat',account:'account',session:'session',generation:1,expires:Date.now()+60000,packagePath:identity.package_path});
const reset=()=>{for(const k of ['document','location','bg','Ext','__loginomDockPreparationV1'])delete globalThis[k];delete globalThis[Symbol.for('loginom-dock.workspace-ui.identity.v1')];};
for(const fault of ['dom','cache','geometry','unknown','accessor','workflow','account'])test('actual serialized collector bound/unavailable controls: '+fault,async()=>{
 const f=pageDouble('success');state.open=true;
 try{
  const native=globalThis.Ext.getCmp;
  if(fault==='cache')globalThis.Ext.getCmp=id=>{const v=native(id);return {...v,getStore:()=>({...v.getStore(),getData:()=>({items:new Array(1001).fill({data:{}})})})};};
  if(fault==='unknown')globalThis.Ext.getCmp=id=>{const v=native(id);return {...v,getStore:()=>({...v.getStore(),getRemoteFilter:()=>undefined})};};
  if(fault==='accessor')globalThis.Ext.getCmp=id=>{const v=native(id);return {...v,getStore:()=>{const st=v.getStore(),get=st.getData;st.getData=()=>{const d=get();Object.defineProperty(d.items[0].data,'DataType',{get(){throw Error('must not read accessor')}});return d;};return st;}};};
  if(fault==='dom')f.root.children=new Array(4097).fill(f.root);
  if(fault==='geometry')f.root.getBoundingClientRect=()=>({x:NaN,y:0,width:1,height:1});
  if(fault==='workflow')globalThis.__loginomDockPreparationV1.receipts.get('r').workflowId='foreign';
  if(fault==='account')globalThis.bg.app.Application.FInstance.FMainForm.FMapTree.FServerConnection.UserName='foreign';
  const read=()=>new Function('page','return ('+makeCalculatorCaptureCode({owner,root_tid:'root',root_ref:'ref',limits:CAPTURE_LIMITS})+')(page)')(f.page);
  if(['dom','cache','geometry','workflow','account'].includes(fault))await assert.rejects(read());
  else {const r=await read();assert.equal(r.predicates.evaluated,false);if(fault==='unknown')assert.equal(r.predicates.cached_windows[0].evaluated,false);if(fault==='accessor')assert.deepEqual(r.stores[0].records[0].data.DataType,{accessor_not_read:true});}
 }finally{reset();}
});
for(const rejection of [Error('collector refusal'),null,false,0,'',undefined])test('actual collector transport Error/falsy preserved; no exclusion: '+String(rejection),async()=>{
 const {browser,events}=pageDouble('success'),original=browser.callTool;
 browser.callTool=async(...a)=>{if(a[0].arguments.code.includes('collector_revision'))throw rejection;return original(...a);};
 let failed=false,caught;
 try{try{await captureCalculator({binding:binding(),identity,browser,record:async()=>{}});}catch(e){failed=true;caught=e;}
 assert.equal(failed,true);assert.equal(caught,rejection);assert.equal(events.includes('exclude'),false);assert.equal(events.includes('cancel'),true);
 }finally{reset();}
});
test('new connection preserves original deadline refusal before any browser read',async()=>{
 const {browser,events}=pageDouble('success'),b=binding();b.expires=Date.now()-1;
 try{await assert.rejects(captureCalculator({binding:b,identity,browser,record:async()=>{}}),/OWNER/);assert.deepEqual(events,[]);}finally{reset();}
});
test('bounded per-store rows cannot bypass the final UTF-8 byte bound',async()=>{
 const f=pageDouble('success'),native=globalThis.Ext.getCmp;
 try{
  globalThis.Ext.getCmp=id=>{const v=native(id);return {...v,getStore:()=>{const items=Array.from({length:500},(_,i)=>({internalId:String(i),data:{Name:'a'.repeat(512),DisplayName:'b'.repeat(512)}}));return {$className:'Ext.data.Store',isBufferedStore:false,currentPage:1,getData:()=>({items,getSource:()=>({items})}),getProxy:()=>({$className:'bg.ext.CollectionProxy',pendingOperations:{}})};}};};
  await assert.rejects(new Function('page','return ('+makeCalculatorCaptureCode({owner,root_tid:'root',root_ref:'ref',limits:CAPTURE_LIMITS})+')(page)')(f.page),/BYTE_BOUND/);
 }finally{reset();}
});

const {captureWindowDiagnostic}=await import(pathToFileURL(root+'/src/acceptance/calculator-grouped-before-done-v1.mjs'));
for(const key of ['count','loading','remoteFilter','remoteSort','source_membership','pendingKeys','isBufferedStore'])test('actual collector exposes bounded unavailable input type: '+key,async()=>{
 const f=pageDouble('success'),native=globalThis.Ext.getCmp;
 try{
  globalThis.Ext.getCmp=id=>{const v=native(id);return {...v,getStore:()=>{
   const st=v.getStore();
   const methods={count:'getCount',loading:'isLoading',remoteFilter:'getRemoteFilter',remoteSort:'getRemoteSort'};
   if(methods[key])st[methods[key]]=()=>undefined;
   if(key==='isBufferedStore')delete st.isBufferedStore;
   if(key==='source_membership'){const get=st.getData;st.getData=()=>({...get(),getSource:()=>null});}
   if(key==='pendingKeys')st.getProxy=()=>({$className:'bg.ext.CollectionProxy'});
   return st;
  }};};
  const r=await new Function('page','return ('+makeCalculatorCaptureCode({owner,root_tid:'root',root_ref:'ref',limits:CAPTURE_LIMITS})+')(page)')(f.page);
  const d=captureWindowDiagnostic(r);assert.equal(d.length,2);
  for(const w of d.windows){
   assert.equal(w.evaluated,false);assert.equal(w.reason,'cached_flags_unavailable');
   assert.deepEqual(Object.keys(w.available_inputs),['count','loading','remoteFilter','remoteSort','source_membership','pendingKeys','isBufferedStore']);
   assert.deepEqual(w.available_inputs[key],{type:['source_membership','pendingKeys'].includes(key)?'null':'object',isArray:false,length:null});
   for(const array of ['source_membership','pendingKeys'].filter(k=>k!==key))assert.deepEqual(w.available_inputs[array],{type:'object',isArray:true,length:array==='pendingKeys'?0:1});
  }
  assert.ok(!JSON.stringify(d).includes('before'));assert.ok(!JSON.stringify(d).includes('record_id'));
 }finally{reset();}
});
