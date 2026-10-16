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

for(const kind of ['own-data','own-object','own-accessor','inherited-data','inherited-accessor','absent','depth-bound'])test('actual collector descriptor diagnosis never invokes getters or changes gate: '+kind,async()=>{
 const f=pageDouble('success'),native=globalThis.Ext.getCmp;let getterCalls=0;
 try{
  globalThis.Ext.getCmp=id=>{const v=native(id);return {...v,getStore:()=>{
   const st=v.getStore();delete st.isBufferedStore;
   const accessor={get(){getterCalls++;throw Error('getter must not run');}};
   if(kind==='own-data')st.isBufferedStore=false;
   if(kind==='own-object')st.isBufferedStore={private:'never copy'};
   if(kind==='own-accessor')Object.defineProperty(st,'isBufferedStore',accessor);
   if(kind.startsWith('inherited-')){const proto={};Object.defineProperty(proto,'isBufferedStore',kind==='inherited-data'?{value:false}:accessor);Object.setPrototypeOf(st,proto);}
   if(kind==='depth-bound'){let proto={isBufferedStore:false};for(let i=0;i<8;i++)proto=Object.create(proto);Object.setPrototypeOf(st,proto);}
   return st;
  }};};
  const r=await new Function('page','return ('+makeCalculatorCaptureCode({owner,root_tid:'root',root_ref:'ref',limits:CAPTURE_LIMITS})+')(page)')(f.page);
  const d=captureWindowDiagnostic(r);assert.equal(getterCalls,0);
  const expected={own:kind.startsWith('own-')?(kind==='own-accessor'?'accessor':'data'):'absent',own_type:kind==='own-data'?'boolean':kind==='own-object'?'object':null,
   inherited:kind.startsWith('own-')?'not_checked':kind==='inherited-data'?'data':kind==='inherited-accessor'?'accessor':kind==='depth-bound'?'depth_bound':'absent',
   own_value:kind==='own-data'?false:null,inherited_value:kind==='inherited-data'?false:null,
   inherited_type:kind==='inherited-data'?'boolean':null,depth:kind.startsWith('inherited-')?1:null};
  for(const w of d.windows){assert.deepEqual(w.isBufferedStore_descriptor,expected);assert.equal(w.evaluated,kind==='own-data'||kind==='inherited-data');}
  assert.ok(!JSON.stringify(d).includes('never copy'));assert.ok(!JSON.stringify(d).includes('private'));
 }finally{reset();}
});

const {validateCapture}=await import(pathToFileURL(root+'/src/acceptance/calculator-grouped-before-done-v1.mjs'));
for(const kind of ['own-data','inherited-data','own-accessor','inherited-accessor','absent','depth-eight','depth-bound','long-strings','diagnostic-error'])test('bounded store provenance uses same cache, never grants missing buffered flag: '+kind,async()=>{
 const f=pageDouble('success'),native=globalThis.Ext.getCmp;let getters=0,storeReads=0;
 try{
  globalThis.Ext.getCmp=id=>{const v=native(id);return {...v,getStore:()=>{
   storeReads++;let st=v.getStore();delete st.isBufferedStore;
   const accessor={get(){getters++;throw Error('provenance getter must not run')}};
   if(kind==='own-data')st.buffered=false;
   if(kind==='inherited-data'){delete st.$className;Object.setPrototypeOf(st,{$className:'Ext.data.Store',buffered:false})}
   if(kind==='own-accessor'){Object.defineProperty(st,'$className',accessor);Object.defineProperty(st,'buffered',accessor)}
   if(kind==='inherited-accessor'){delete st.$className;const proto={};for(const key of ['$className','buffered'])Object.defineProperty(proto,key,accessor);Object.setPrototypeOf(st,proto)}
   if(kind==='absent')delete st.$className;
   if(['depth-eight','depth-bound'].includes(kind)){delete st.$className;let proto={$className:'Ext.data.Store',buffered:false};for(let i=0;i<(kind==='depth-eight'?7:8);i++)proto=Object.create(proto);Object.setPrototypeOf(st,proto)}
   if(kind==='long-strings'){st.$className='C'.repeat(300);st.buffered='false';const get=st.getProxy;st.getProxy=()=>({...get(),$className:'P'.repeat(300)})}
   if(kind==='diagnostic-error')st=new Proxy(st,{getOwnPropertyDescriptor(target,key){if(key==='buffered')throw 0;return Reflect.getOwnPropertyDescriptor(target,key)}});
   return st;
  }};};
  const r=await new Function('page','return ('+makeCalculatorCaptureCode({owner,root_tid:'root',root_ref:'ref',limits:CAPTURE_LIMITS})+')(page)')(f.page);
  const diagnostic=captureWindowDiagnostic(r);assert.equal(storeReads,2);assert.equal(getters,0);
  for(const w of diagnostic.windows){
   assert.equal(w.evaluated,false);assert.equal(w.value,null);assert.equal(w.reason,'cached_flags_unavailable');
   assert.equal(w.isBufferedStore_descriptor.own,'absent');assert.equal(w.isBufferedStore_descriptor.own_value,null);assert.equal(w.isBufferedStore_descriptor.inherited_value,null);
   const p=w.store_provenance,d=p.descriptors;assert.equal(p.currentPage.value,1);
   if(kind==='own-data'){assert.equal(d.buffered.own,'data');assert.equal(d.buffered.own_value,false);assert.equal(p.$className.value,'Ext.data.Store')}
   if(kind==='inherited-data'){assert.equal(d.buffered.inherited,'data');assert.equal(d.buffered.inherited_value,false);assert.equal(d.buffered.depth,1);assert.equal(d.$className.inherited_value,'Ext.data.Store');assert.equal(p.$className.value,'Ext.data.Store')}
   if(kind.endsWith('accessor'))for(const key of ['$className','buffered']){const where=kind.startsWith('own-')?'own':'inherited';assert.equal(d[key][where],'accessor');assert.equal(d[key][where+'_value'],null)}
   if(kind==='absent')for(const key of ['$className','buffered']){assert.equal(d[key].own,'absent');assert.equal(d[key].inherited,'absent');assert.equal(d[key].depth,null)}
   if(kind==='depth-eight')for(const key of ['$className','buffered']){assert.equal(d[key].inherited,'data');assert.equal(d[key].depth,8)}
   if(kind==='depth-bound')for(const key of ['$className','buffered']){assert.equal(d[key].inherited,'depth_bound');assert.equal(d[key].inherited_value,null);assert.equal(d[key].depth,null)}
   if(kind==='long-strings'){assert.equal(p.$className.value.length,128);assert.equal(p.$className.truncated,true);assert.equal(p.proxy_class.value.length,128);assert.equal(d.$className.own_value.length,128);assert.equal(d.$className.own_truncated,true);assert.equal(d.buffered.own_type,'string');assert.equal(d.buffered.own_value,null)}
   if(kind==='diagnostic-error'){assert.equal(d.buffered.diagnostic_error,true);assert.equal(d.buffered.own_value,null);assert.equal(d.buffered.inherited_value,null)}
  }
  assert.throws(()=>validateCapture(r,owner,{root_tid:'root',root_ref:'ref',region:{record_id:'before'}}),/LOGINOM_CAPTURE_CACHED_WINDOW/);
  assert.equal(f.events.includes('fetch'),false);assert.equal(f.events.includes('exclude'),false);
 }finally{reset();}
});

// Optional exact parent source provides a before-control without a second tree.
const parentClassSource=process.env.CALCULATOR_CAPTURE_CLASS_SOURCE
 ?await (await import('node:fs/promises')).readFile(process.env.CALCULATOR_CAPTURE_CLASS_SOURCE,'utf8'):null;
const classReader=parentClassSource
 ?new Function(parentClassSource.slice(parentClassSource.indexOf('export function readCalculatorCaptureSurface')).replace('export function','return function'))()
 :(await import(lib('workspace-ui.mjs'))).readCalculatorCaptureSurface;
for(const target of ['store','proxy'])for(const kind of ['inherited','own-shadow','own-accessor','inherited-accessor','wrong-type','inherited-wrong-type','absent','depth-eight','depth-nine','long-string','byte-bound','utf8-bound'])test('operative class lookup '+target+' '+kind,async()=>{
 const f=pageDouble('success'),native=globalThis.Ext.getCmp;let getters=0,storeReads=0,proxyReads=0;
 const expected=target==='store'?'Ext.data.Store':'bg.ext.CollectionProxy';
 try{
  globalThis.Ext.getCmp=id=>{const v=native(id);return {...v,getStore:()=>{
   storeReads++;const st=v.getStore(),getProxy=st.getProxy;let proxy=getProxy();
   st.getProxy=()=>{proxyReads++;return proxy;};
   const object=target==='store'?st:proxy;delete object.$className;
   let proto={$className:expected};
   if(kind==='depth-eight'||kind==='depth-nine')for(let i=0;i<(kind==='depth-eight'?7:8);i++)proto=Object.create(proto);
   Object.setPrototypeOf(object,proto);
   const accessor={get(){getters++;throw Error('class getter must not run')}};
   if(kind==='own-shadow')object.$className='OwnClass';
   if(kind==='own-accessor')Object.defineProperty(object,'$className',accessor);
   if(kind==='inherited-accessor')Object.defineProperty(proto,'$className',accessor);
   if(kind==='wrong-type')object.$className=false;
   if(kind==='inherited-wrong-type')Object.defineProperty(proto,'$className',{value:{$className:expected}});
   if(kind==='absent')Object.setPrototypeOf(object,null);
   if(kind==='long-string')object.$className='C'.repeat(300);
   if(kind==='byte-bound')object.$className='C'.repeat(513);
   if(kind==='utf8-bound')object.$className='я'.repeat(257);
   return st;
  }};};
  const read=()=>classReader({owner,root_tid:'root',root_ref:'ref',limits:CAPTURE_LIMITS});
  if(['byte-bound','utf8-bound'].includes(kind))assert.throws(read,/STRING_BOUND/);
  else {
   const result=read();assert.equal(result.stores.length,2);
   for(const st of result.stores){const value=target==='store'?st.flags.$className:st.proxy_class;
    if(['inherited','depth-eight'].includes(kind))assert.equal(value,expected);
    else if(kind==='own-shadow')assert.equal(value,'OwnClass');
    else if(kind==='long-string')assert.equal(value,'C'.repeat(300));
    else assert.equal(typeof value,'object');
   }
   if(['inherited','depth-eight'].includes(kind))assert.ok(result.predicates.cached_windows.every(w=>w.value===true));
   if(kind==='long-string')assert.ok(result.predicates.cached_windows.every(w=>w.value===false));
  }
  assert.equal(storeReads,['byte-bound','utf8-bound'].includes(kind)?1:2);assert.equal(proxyReads,storeReads);assert.equal(getters,0);
 }finally{reset();}
});
for(const target of ['store','proxy'])for(const phase of ['descriptor','prototype'])for(const failure of [Error('operative class failure'),null,false,0,'',undefined])test('operative class lookup preserves exact rejection '+target+' '+phase+' '+String(failure),()=>{
 const f=pageDouble('success'),native=globalThis.Ext.getCmp;
 try{
  globalThis.Ext.getCmp=id=>{const v=native(id);return {...v,getStore:()=>{
   let st=v.getStore();
   const trap={getOwnPropertyDescriptor(o,k){if(k==='$className'&&phase==='descriptor')throw failure;return Reflect.getOwnPropertyDescriptor(o,k)},getPrototypeOf(o){if(phase==='prototype')throw failure;return Reflect.getPrototypeOf(o)}};
   if(target==='store'){if(phase==='prototype')delete st.$className;st=new Proxy(st,trap);}
   else {const get=st.getProxy;st.getProxy=()=>{const p=get();if(phase==='prototype')delete p.$className;return new Proxy(p,trap)};}
   return st;
  }};};
  let threw=false,caught;try{classReader({owner,root_tid:'root',root_ref:'ref',limits:CAPTURE_LIMITS})}catch(e){threw=true;caught=e}
  assert.equal(threw,true);assert.equal(caught,failure);
 }finally{reset();}
});
test('operative inherited class metadata cannot admit actual b7 absent/null boolean windows',async()=>{
 const f=pageDouble('success'),native=globalThis.Ext.getCmp;
 try{
  globalThis.Ext.getCmp=id=>{const v=native(id);return {...v,getStore:()=>{
   const st=v.getStore();delete st.$className;delete st.isBufferedStore;Object.setPrototypeOf(st,{$className:'Ext.data.Store'});
   const get=st.getProxy;st.getProxy=()=>{const p=get();delete p.$className;Object.setPrototypeOf(p,{$className:'bg.ext.CollectionProxy'});return p};return st;
  }};};
  const result=classReader({owner,root_tid:'root',root_ref:'ref',limits:CAPTURE_LIMITS});
  for(const w of result.predicates.cached_windows){assert.equal(w.evaluated,false);assert.equal(w.value,null);assert.equal(w.isBufferedStore_descriptor.own_value,null);assert.equal(w.isBufferedStore_descriptor.inherited_value,null)}
  await assert.rejects(captureCalculator({binding:binding(),identity,browser:f.browser,record:async()=>{}}),/CACHED_WINDOW/);
  assert.equal(f.events.includes('exclude'),false);assert.equal(f.events.filter(e=>e==='cancel').length,1);
 }finally{reset();}
});

test('saved native b7 windows retain absent/null and strict refusal after class lookup fix',async()=>{
 const f=pageDouble('success');
 try{
  const {readFile}=await import('node:fs/promises');
  const factual=JSON.parse(await readFile(new URL('./fixtures/calculator-cached-windows-b7e68c0d.json',import.meta.url),'utf8'));
  const result=classReader({owner,root_tid:'root',root_ref:'ref',limits:CAPTURE_LIMITS});
  result.predicates.cached_windows=structuredClone(factual.windows);
  assert.deepEqual(captureWindowDiagnostic(result),factual);
  const {validateCapture}=await import(pathToFileURL(root+'/src/acceptance/calculator-grouped-before-done-v1.mjs'));
  assert.throws(()=>validateCapture(result,owner,{root_tid:'root',root_ref:'ref',region:{record_id:'before'}}),/LOGINOM_CAPTURE_CACHED_WINDOW/);
  for(const w of factual.windows){assert.equal(w.isBufferedStore_descriptor.own_value,null);assert.equal(w.isBufferedStore_descriptor.inherited_value,null);assert.equal(w.evaluated,false);assert.equal(w.value,null)}
 }finally{reset();}
});

function bufferingFixture(kind,guard){
 const f=pageDouble('success'),native=globalThis.Ext.getCmp;let getters=0,stores=0,proxies=0;
 globalThis.Ext.getCmp=id=>{const v=native(id);return {...v,getStore:()=>{
  stores++;const st=v.getStore();delete st.isBufferedStore;
  let proto={isBufferedStore:['inherited-true','own-false'].includes(kind)};
  if(kind==='depth-eight'||kind==='depth-nine')for(let i=0;i<(kind==='depth-eight'?7:8);i++)proto=Object.create(proto);
  Object.setPrototypeOf(st,proto);
  const accessor={get(){getters++;throw Error('buffering getter must not run')}};
  if(kind==='own-false')st.isBufferedStore=false;
  if(kind==='own-true')st.isBufferedStore=true;
  if(kind==='own-accessor')Object.defineProperty(st,'isBufferedStore',accessor);
  if(kind==='inherited-accessor'){const p=Object.create({isBufferedStore:false});Object.defineProperty(p,'isBufferedStore',accessor);Object.setPrototypeOf(st,p);}
  const wrong={'wrong-string':'false','wrong-number':0,'wrong-null':null,'wrong-undefined':undefined,'wrong-object':{}};
  if(Object.hasOwn(wrong,kind))st.isBufferedStore=wrong[kind];
  if(kind==='absent')Object.setPrototypeOf(st,null);
  const get=st.getProxy;st.getProxy=()=>{proxies++;return get()};
  if(guard==='class')st.$className='UnknownStore';
  if(guard==='loading')st.isLoading=()=>true;
  if(guard==='page')st.currentPage=2;
  if(guard==='filter')st.getRemoteFilter=()=>true;
  if(guard==='sort')st.getRemoteSort=()=>true;
  if(guard==='count')st.getCount=()=>2;
  if(guard==='proxy')st.getProxy=()=>{proxies++;return {$className:'OtherProxy',pendingOperations:{}}};
  if(guard==='pending')st.getProxy=()=>{proxies++;return {$className:'bg.ext.CollectionProxy',pendingOperations:{pending:true}}};
  if(guard==='membership'){const getData=st.getData;st.getData=()=>({...getData(),getSource:()=>({items:[]})});}
  return st;
 }};};
 if(guard==='rows')f.grids[1].querySelectorAll=()=>[];
 return {...f,counts:()=>({getters,stores,proxies})};
}
const bufferingRead=f=>{
 const input={owner,root_tid:'root',root_ref:'ref',limits:CAPTURE_LIMITS};
 const code=parentClassSource?`async page=>page.evaluate(${classReader.toString()},${JSON.stringify(input)})`:makeCalculatorCaptureCode(input);
 return new Function('page','return ('+code+')(page)')(f.page);
};
for(const kind of ['inherited-false','inherited-true','own-false','own-true','own-accessor','inherited-accessor','wrong-string','wrong-number','wrong-null','wrong-undefined','wrong-object','absent','depth-eight','depth-nine'])test('operative boolean serialized collector sanitizer validator '+kind,async()=>{
 const f=bufferingFixture(kind);
 try{
  const result=await bufferingRead(f),d=captureWindowDiagnostic(result);
  const known=['inherited-false','inherited-true','own-false','own-true','depth-eight'].includes(kind),pass=['inherited-false','own-false','depth-eight'].includes(kind);
  for(const w of d.windows){assert.equal(w.evaluated,known);assert.equal(w.value,known?pass:null)}
  for(const st of result.stores)assert.equal(typeof st.flags.isBufferedStore,known?'boolean':'object');
  const validate=()=>validateCapture(result,owner,{root_tid:'root',root_ref:'ref',region:{record_id:'before'}});
  if(pass)assert.match(validate(),/^[a-f0-9]{64}$/);else assert.throws(validate,/LOGINOM_CAPTURE_CACHED_WINDOW/);
  assert.deepEqual(f.counts(),{getters:0,stores:2,proxies:2});assert.equal(f.events.includes('exclude'),false);assert.equal(f.events.includes('fetch'),false);
 }finally{reset();}
});
for(const guard of ['class','loading','page','filter','sort','count','proxy','pending','membership','rows'])test('inherited false retains prior cache/row guard '+guard,async()=>{
 const f=bufferingFixture('inherited-false',guard);
 try{
  const r=await bufferingRead(f);assert.ok(captureWindowDiagnostic(r).windows.every(w=>w.evaluated));
  assert.throws(()=>validateCapture(r,owner,{root_tid:'root',root_ref:'ref',region:{record_id:'before'}}),/LOGINOM_CAPTURE_CACHED_WINDOW/);
  assert.deepEqual(f.counts(),{getters:0,stores:2,proxies:2});assert.equal(f.events.includes('exclude'),false);
 }finally{reset();}
});
for(const phase of ['descriptor','prototype'])for(const rejection of [Error('operative buffering failure'),null,false,0,'',undefined])test('operative boolean preserves exact '+phase+' '+String(rejection),async()=>{
 const f=pageDouble('success'),native=globalThis.Ext.getCmp;
 try{
  globalThis.Ext.getCmp=id=>{const v=native(id);return {...v,getStore:()=>{
   const st=v.getStore();delete st.isBufferedStore;
   return new Proxy(st,{getOwnPropertyDescriptor(o,k){if(k==='isBufferedStore'&&phase==='descriptor')throw rejection;return Reflect.getOwnPropertyDescriptor(o,k)},getPrototypeOf(o){if(phase==='prototype')throw rejection;return Reflect.getPrototypeOf(o)}});
  }};};
  let failed=false,caught;try{await bufferingRead(f)}catch(e){failed=true;caught=e}
  assert.equal(failed,true);assert.equal(caught,rejection);assert.equal(f.events.includes('exclude'),false);
  failed=false;caught=undefined;
  try{await captureCalculator({binding:binding(),identity,browser:f.browser,record:async()=>{}})}catch(e){failed=true;caught=e}
  assert.equal(failed,true);assert.equal(caught,rejection);assert.equal(f.events.includes('exclude'),false);assert.equal(f.events.filter(e=>e==='cancel').length,1);
 }finally{reset();}
});
for(const kind of ['inherited-false','inherited-true','absent'])test('operative boolean actual serialized harness before exclusion '+kind,async()=>{
 const f=bufferingFixture(kind);
 try{
  if(kind==='inherited-false'){
   const r=await captureCalculator({binding:binding(),identity,browser:f.browser,record:async()=>{}});
   assert.ok(r.before.predicates.cached_windows.every(w=>w.evaluated&&w.value));assert.equal(f.events.filter(e=>e==='exclude').length,1);
  }else{
   await assert.rejects(captureCalculator({binding:binding(),identity,browser:f.browser,record:async()=>{}}),/LOGINOM_CAPTURE_CACHED_WINDOW/);
   assert.equal(f.events.includes('exclude'),false);
  }
  assert.equal(f.counts().getters,0);assert.equal(f.events.filter(e=>e==='cancel').length,1);
 }finally{reset();}
});
