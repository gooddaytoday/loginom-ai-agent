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
  const items=records();return {$className:'Ext.data.Store',isBufferedStore:false,currentPage:1,loading:false,getCount:()=>items.length,getTotalCount:()=>items.length,isLoading:()=>false,getRemoteFilter:()=>false,getRemoteSort:()=>false,getData:()=>({items,getSource:()=>({items})}),getProxy:()=>({$className:'bg.ext.CollectionProxy',pendingOperations:{}})};
 }});
 state={events,scenario,links:false,fetched:false,open:false,edited:false,snapshot:()=>({prepared_node_context:{verified:true,surface:state.open?'wizard':'graph',document_id:'doc',workflow_id:'flow',node_id:'node',tid:'root'},
  wizard:state.open?{status:'observed',stage:'output_mapping',root_tid:'root',root_ref:'ref',owner_context:{status:'observed',node_id:'node'}}:{status:'absent'},
  ui:{elements:[{tid:'root;DerivedDataSourceOutputSocketWizard;rbLinks;DisplayEl',ref:'links',check_state:{checked:state.links},allowed_actions:['click']},{tid:'root;DerivedDataSourceOutputSocketWizard;btnGetSourceColumns',ref:'fetch',visible:state.links,enabled:true,allowed_actions:['click']}]},
  node_mapping:{node_context:{output_port:{port_guid:scenario==='port'?'foreign':'4ba0e2c2-69ad-3a32-bbdc-75714efe7a51'}},verified:true,inventory_complete:true,source_identity_verified:state.fetched&&scenario!=='missing-source',mapping_wizard:'DerivedDataSourceOutputSocketWizard',
   target_fields:[{name:'Region',label:scenario==='label'?'wrong':'Region display',record_id:state.edited?'after':'before',excluded:state.edited,
    ...(state.edited?{exclusion_source:{record_id:'source',field_id:'20',name:scenario==='source-name'?'wrong':'Region'}}:{source:{record_id:'source',field_id:'20',name:scenario==='source-name'?'wrong':'Region'}})}]}})};
 globalThis.document=document;globalThis.location={origin:'https://loginom.invalid'};
 globalThis.bg={app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:{UserName:'account'}}}}}}};
 globalThis.Ext={getCmp:id=>view(grids.find(e=>e.id===id))};
 globalThis[Symbol.for('loginom-dock.workspace-ui.identity.v1')]={document,refs:new Map([['ref',new WeakRef(root)]])};
 globalThis.__loginomDockPreparationV1={document,id:scenario==='document'?'foreign':'doc',receipts:new Map([['r',{phase:'verified',tab,packageNode:{},workflowId:'flow',crumbs:[]}]])};
 const page={get nodeContext(){return state.snapshot().prepared_node_context;},graph:{complete:true,nodes:[{type:'transform.calculator',label:'LAB66CaptureCalculator',ref:{document_id:'doc',workflow_id:'flow',node_id:'node'}}]},evaluate:async(fn,arg)=>fn(arg)};
 const browser={callTool:async({arguments:{code}})=>{
  events.push('browser');const result=await new Function('page','return ('+code+')(page)')(page);
  return {content:[{type:'text',text:JSON.stringify(result)}]};
 }};
 return {events,browser};
}
for(const scenario of ['success','document','lease','run','session','missing-source','label','source-name','port','fetch-unknown'])test('fixed resource entry with labelled Page/Ext/executor doubles: '+scenario,async()=>{
 const {events,browser}=pageDouble(scenario),binding={revision:1,harness:'calculator-grouped-before-done-v1',owner:'owner',run:'run',lease:'owner:run',admission:'admission',chat:'chat',account:'account',session:'session',generation:1,expires:Date.now()+60000,packagePath:'/account/draft.lgp'};
 const identity={session_id:'session',document_id:'doc',account:'account',package_path:binding.packagePath,tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb',loginom_build:'7.4.2'};
 if(scenario==='lease')binding.lease='foreign';if(scenario==='run')binding.run='foreign';if(scenario==='session')binding.session='foreign';
 try{
  if(scenario==='success'){
   const result=await captureCalculator({binding,identity,browser,record:async()=>{}});
   assert.equal(result.cancel_verified,true);assert.equal(result.capture_complete,false);
   assert.equal(result.before.dom.length,5);assert.equal(result.before.stores[1].records[0].internalId,'before');
   assert.equal(result.after.stores[1].records[0].data.GroupField,'Исключенные');
   assert.deepEqual(events.filter(e=>e!=='browser'),['select','open-output','links','fetch','exclude','cancel']);
  }else if(scenario==='missing-source'){
   await assert.rejects(captureCalculator({binding,identity,browser,record:async()=>{}}),{message:'LOGINOM_CAPTURE_MAPPING'});
   assert.deepEqual(events.filter(e=>e!=='browser'),['select','open-output','links','fetch','cancel']);
  }else {await assert.rejects(captureCalculator({binding,identity,browser,record:async()=>{}}));assert.equal(events.includes('exclude'),false);
   if(scenario==='fetch-unknown'){assert.equal(events.filter(x=>x==='fetch').length,1);assert.equal(events.includes('cancel'),false);}
   if(['label','source-name','port'].includes(scenario))assert.equal(events.includes('cancel'),true);}
 }finally{for(const k of ['document','location','bg','Ext','__loginomDockPreparationV1'])delete globalThis[k];delete globalThis[Symbol.for('loginom-dock.workspace-ui.identity.v1')];}
});
