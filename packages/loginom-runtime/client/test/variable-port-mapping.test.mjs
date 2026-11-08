import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {Document,Element,fixtureClock} from './support/workspace-ui-fixture.mjs';
import {validateNodeApplyRequest} from '../lib/node-apply.mjs';
import {makeVariablePortMappingCode,configureVariablePortMapping} from '../lib/variable-port-mapping.mjs';
import {decodePortCell} from '../lib/node-port-output.mjs';
import {chromium} from 'playwright-core';
const ref={document_id:'doc',workflow_id:'wf',node_id:'node'};
const workflow={workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'Scenario'}]};
const request=()=>({operation_id:'map',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,target:{kind:'existing',type:'transform.calculator',ref},inputs:[],mode:'expression',parameters:{},
 mappings:[],finish:'done',read:{ports:[],sample_rows:0,require_exact_numbers:true},budgets:{configure_ms:1000,execute_ms:1000,total_ms:5000}});
test('W1 mapping kind has an independent ordinal namespace and table handlers receive only their table mappings',()=>{
 const r=request(),table={direction:'input',port:0},variables={direction:'input',port:0,kind:'variables'},control={direction:'input',port:0,kind:'control'};
 let seen;
 const handlers=new Map([['transform.calculator',{revision:'1',modes:['expression'],configure:()=>{},validate:(_p,_m,request)=>{seen=request.mappings;}}]]);
 r.mappings=[table,variables,control];const before=structuredClone(r);validateNodeApplyRequest(r,handlers);assert.deepEqual(seen,[table]);assert.deepEqual(r,before);
 for(const mapping of [{...variables},{...control,port:1},{...variables,direction:'output'},{...variables,kind:'table'},
  {...variables,fields:[{source:{kind:'configured_field',name:'limit'},excluded:true}]},{...variables,fields:[{source:{schema_id:'s',field_id:'f'}}]}]){
  const invalid=structuredClone(r);invalid.mappings.push(mapping);assert.throws(()=>validateNodeApplyRequest(invalid,handlers));
 }
 r.mappings=[{...variables,changes:[{source:{kind:'configured_field',name:'limit'},name:'renamed'}]}];assert.doesNotThrow(()=>validateNodeApplyRequest(r,handlers));
 r.finish='close';assert.throws(()=>validateNodeApplyRequest(r,handlers));
});

// Execute the serialized production reader against native UI records. The old
// journals identify the two failures but contain no intermediate inventories;
// delayed updates below are explicit timing hypotheses, not recorded snapshots.
function mappingFixture({delay=240,cover=null,drift=false,readback=false,unstable=false,graphDelay=0,type=4,value=7,isNull=false,name='Amount'}={}){
 const clock=fixtureClock(),document=new Document(),components=new Map(),clicks=[];
 document.querySelector=selector=>document.querySelectorAll(selector)[0]??null;
 const root=workflow.prefix+';WizrdMCF',form=root+';TuneVariablesMappingWizard';
 const add=(tid,parent=document.body,cls='')=>{
  const e=parent.append(new Element('div',{'data-tid':tid,class:cls},'',{x:20,y:20+components.size*30,width:100,height:20}));
  e.id='cmp-'+components.size;e.checkVisibility=()=>e.style.display!=='none'&&(!e.parentElement||e.parentElement===document.body||e.parentElement.checkVisibility());
  components.set(e.id,{el:{dom:e},disabled:false});return e;
 };
 const wizard=add(root),panel=add(form,wizard),gridEl=add(form+';grdTargetColumns',panel);
 const source={data:{ID:1,Name:name,DisplayName:name,DataType:type}};
 const record={isModel:true,data:{ID:1,Index:0,Name:name,DisplayName:name,DataType:type,OriginType:0,UsageType:0,Description:'',DisplayValue:value,ValueIsNull:isNull,ConnectedRecord:source}};
 const records=[record],store={isLoading:()=>false,getData:()=>({items:records}),getCount:()=>records.length};
 const grid=components.get(gridEl.id);grid.getStore=()=>store;
 const auto=add(form+';btnAutoSyncThroughColumns',panel),button=components.get(auto.id);button.pressed=true;
 const done=add(root+';btnDone',wizard),close=add(root+';btnClose',wizard);
 const header=cover==='disabled-header'?add(form+';colTargetDelete',panel):null;
 if(header)Object.assign(components.get(header.id),{$className:'Ext.grid.column.Action',disabled:true});
 const mask=cover==='owned-root'?wizard:cover?add('mask',cover==='foreign'?document.body:header??panel,'x-mask'):null;
 if(cover==='owned-root')wizard.attrs.class='bg-mask-message';
 if(mask)mask.box=header?.box??auto.box;
 const graphEl=add(workflow.prefix+';ModelForm'),diagram=add(workflow.prefix+';ModelForm;cmpDiagram',graphEl);
 graphEl.style.display='none';
 const nodeData={},portData={},node={FGuid:'node',FIconCls:'bg-vendor-icon-calcdata',data:nodeData},port={FSubType:3,data:portData};
 const nodeTree={FModelNode:nodeData},portTree={FModelNodePort:portData},owner={FView:{el:{dom:wizard}},FModelSocket:{}};
 const receipt={phase:'verified',operation_id:'map:port',workflow:'wf-native',node_id:'node',portIndex:0,wizard:owner,enginePort:owner.FModelSocket,port,node,nodeData,portData,nodeTree,portTree,nativeIndex:1,portGuid:'port'};
 const graphModel={FView:{el:{dom:graphEl}},FDiagram:{FmxGraph:{container:diagram},FNodes:{FCollection:[node]}}};
 receipt.graph=graphModel;port.parent=node;
 const preparation={document,id:'doc',receipts:new Map([['node',{phase:'verified',workflowId:'wf',nodeTargetWorkflowNode:'wf-native'}]]),inputPortOpenReceipts:new Map([['port',receipt]])};
 const card={Controller:{FController:owner,Node:{data:{node:{ParentNode:portTree}}}}};
 const app={Version:'7.4.2',Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>card}}}}}};
 const context=vm.createContext({document,Date:clock.Date,location:{origin:'https://loginom.test'},Ext:{getCmp:id=>components.get(id)},__loginomDockPreparationV1:preparation,
  bg:{app}});
 let pending=null,closed=null;
 const advance=ms=>{clock.advance(ms);if(cover==='owned-root'&&clock.Date.now()>=delay)wizard.attrs.class='';if(mask&&cover==='owned'&&clock.Date.now()>=delay)mask.style.display='none';if(pending&&clock.Date.now()>=pending){button.pressed=false;if(drift)record.data.DisplayValue=8;pending=null;}
  if(unstable&&clock.Date.now()>=delay)button.pressed=clock.Date.now()<delay+240&&Math.floor(clock.Date.now()/80)%2===1;
  if(closed!==null&&graphDelay)graphEl.attrs.class=clock.Date.now()>=closed+40&&clock.Date.now()<closed+graphDelay?'bg-mask-message':'';
 };
 if(readback)pending=delay;
 const page={evaluate:async(fn,arg)=>{context.arg=arg;return vm.runInContext('('+fn.toString()+')(arg)',context);},
  waitForTimeout:async ms=>advance(ms),
  waitForFunction:async(fn,arg,{timeout})=>{const end=clock.Date.now()+timeout;while(!await page.evaluate(fn,arg)){if(clock.Date.now()>=end)throw Error('Timeout');advance(40);}},
  locator:()=>({count:async()=>0}),mouse:{click:async(x,y)=>{
   const e=document.elementFromPoint(x,y);clicks.push(e?.getAttribute('data-tid'));
   if(e===auto)pending=clock.Date.now()+delay;
   if(e===done||e===close){wizard.style.display='none';graphEl.style.display='';card.Controller.FController=graphModel;closed=clock.Date.now();}
  }}};
 const task={binding:{document_id:'doc',workflow_ref:workflow,node:ref},mapping:{direction:'input',kind:'variables',port:0,autosync:false},origin:'https://loginom.test',build:'7.4.2',operation_id:'map',deadline:10000,read_only:readback};
 const graph=async()=>({verified:true,surface:'graph',locked:false});
 const open=async()=>({status:'SUCCEEDED',effect_possible:true});
 const run=async()=>{context.page=page;context.task=task;context.read=graph;context.open=open;context.decode=decodePortCell;return vm.runInContext('('+configureVariablePortMapping.toString()+')(page,task,read,open,decode)',context);};
 return {run,clicks,task,clock,node,port,wizard,record,source,preparation,closed:()=>closed};
}

test('variable mapping retains ownership across coherent existing-workflow receipts and refuses conflicts',async()=>{
 for(const conflict of [null,'tab','packageNode','nodeTargetWorkflowNode']){
  const f=mappingFixture(),first=f.preparation.receipts.get('node');
  Object.assign(first,{tab:{},packageNode:{}});
  const second={...first};if(conflict)second[conflict]={};
  f.preparation.receipts.set('existing-workflow',second);
  const result=await f.run();
  assert.equal(result.status,conflict?'AMBIGUOUS':'SUCCEEDED',result.error);
  if(conflict){assert.match(result.error,/Owned complete variable mapping required/);assert.deepEqual(f.clicks,[]);}
 }
});

// LAB-899 settings-rate-calc source receipt: real rate=92.5. Live mapping
// inventory also observes native datetime=2 and real=3 with NULL defaults.
for(const [type,value,isNull] of [[3,92.5,false],[3,null,true],[2,null,true],[4,7,false],[1,false,false],[5,'',false]])
test('W1 preserves scalar mapping value/type/NULL: '+JSON.stringify([type,value,isNull]),async()=>{
 const f=mappingFixture({type,value,isNull,name:type===3?'rate':'Amount'}),r=await f.run();
 assert.equal(r.status,'SUCCEEDED',r.error);assert.equal(r.mapping.fields[0].type,type);
 assert.equal(r.mapping.fields[0].value,value);assert.equal(r.mapping.fields[0].is_null,isNull);
 assert.equal(f.record.data.DisplayValue,value);assert.equal(f.record.data.DataType,f.source.data.DataType);
});
for(const fault of ['unknown','source-type','index','null-flag','real-precision','real-value'])test('W1 scalar extension still refuses '+fault,async()=>{
 const f=mappingFixture({type:3,value:92.5});
 if(fault==='unknown')f.record.data.DataType=f.source.data.DataType=6;
 if(fault==='source-type')f.source.data.DataType=4;
 if(fault==='index')f.record.data.Index=1;
 if(fault==='null-flag')f.record.data.ValueIsNull=undefined;
 if(fault==='real-precision')f.record.data.DisplayValue=Infinity;
 if(fault==='real-value')f.record.data.DisplayValue='92.5';
 const r=await f.run();assert.equal(r.status,'AMBIGUOUS');assert.equal(f.clicks.length,0);
});

test('W1 serializes native Date through the W2 civil decoder in the browser timezone',{
 skip:!process.env.LOGINOM_DOCK_TEST_BROWSER&&'Pinned Chromium required',timeout:30000,
},async()=>{
 const browser=await chromium.launch({executablePath:process.env.LOGINOM_DOCK_TEST_BROWSER,headless:true,chromiumSandbox:true,args:['--no-proxy-server']});
 try{
  const context=await browser.newContext({timezoneId:'Europe/Moscow'}),page=await context.newPage();
  await page.evaluate(({workflow,ref})=>{
   const root=workflow.prefix+';WizrdMCF',form=root+';TuneVariablesMappingWizard',components=new Map();
   const add=(tid,parent,top)=>{const e=document.createElement('div');e.id='cmp-'+components.size;e.setAttribute('data-tid',tid);
    e.style.cssText='position:absolute;left:10px;top:'+top+'px;width:200px;height:25px';parent.appendChild(e);components.set(e.id,{el:{dom:e},disabled:false});return e;};
   const wizard=add(root,document.body,0);wizard.style.height='200px';
   const grid=add(form+';grdTargetColumns',wizard,0),auto=add(form+';btnAutoSyncThroughColumns',wizard,40),done=add(root+';btnDone',wizard,80);
   const graph=add(workflow.prefix+';ModelForm',document.body,250),diagram=add(workflow.prefix+';ModelForm;cmpDiagram',graph,0);graph.style.display='none';
   const row={isModel:true,data:{ID:1,Index:0,Name:'Moment',DisplayName:'Moment',DataType:2,OriginType:0,UsageType:0,Description:'',
    ValueIsNull:false,DisplayValue:new Date(2026,0,2,3,4,5,6),ConnectedRecord:{data:{ID:1,Name:'Moment',DisplayName:'Moment',DataType:2}}}};
   const store={isLoading:()=>false,getData:()=>({items:[row]}),getCount:()=>1};components.get(grid.id).getStore=()=>store;
   const button=components.get(auto.id);button.pressed=true;auto.onclick=()=>{button.pressed=false;};
   const node={FGuid:ref.node_id,data:{}},port={FSubType:3,data:{},parent:node},portTree={FModelNodePort:port.data},nodeTree={FModelNode:node.data};
   const owner={FView:{el:{dom:wizard}},FModelSocket:{}},graphModel={FView:{el:{dom:graph}},FDiagram:{FmxGraph:{container:diagram}}};
   const card={Controller:{FController:owner,Node:{data:{node:{ParentNode:portTree}}}}};
   done.onclick=()=>{wizard.style.display='none';graph.style.display='';card.Controller.FController=graphModel;};
   globalThis.Ext={getCmp:id=>components.get(id)};
   globalThis.bg={app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>card}}}}}}};
   globalThis.__loginomDockPreparationV1={document,id:'doc',receipts:new Map([['node',{phase:'verified',workflowId:'wf',nodeTargetWorkflowNode:'native'}]]),
    inputPortOpenReceipts:new Map([['port',{phase:'verified',operation_id:'map:port',workflow:'native',node_id:ref.node_id,portIndex:0,nativeIndex:1,portGuid:'port',
     wizard:owner,enginePort:owner.FModelSocket,port,node,nodeData:node.data,portData:port.data,nodeTree,portTree,graph:graphModel}]])};
  },{workflow,ref});
  const r=await configureVariablePortMapping(page,{binding:{document_id:'doc',workflow_ref:workflow,node:ref},mapping:{direction:'input',kind:'variables',port:0,autosync:false},
   origin:'null',build:'7.4.2',operation_id:'map',deadline:Date.now()+15000},async()=>({verified:true,surface:'graph',locked:false}),async()=>({status:'SUCCEEDED',effect_possible:true}));
  assert.equal(r.status,'SUCCEEDED',r.error);assert.equal(r.mapping.fields[0].value,'2026-01-02T03:04:05.006');
  assert.equal(r.mapping.fields[0].type,2);assert.equal(r.mapping.fields[0].is_null,false);
 }finally{await browser.close();}
});

test('Calculator waits for the native loading class on its exact wizard root; foreign/Ext/modal masks still refuse',async()=>{
 const f=mappingFixture({cover:'owned-root'}),result=await f.run();
 assert.equal(result.status,'SUCCEEDED',result.error);assert.ok(f.clock.Date.now()>=240);
 for(const fault of ['other-node','ext-mask','dialog']){
  const x=mappingFixture({cover:'owned-root'});
  if(fault==='other-node')x.node.FIconCls='bg-vendor-icon-sortdata';
  if(fault==='ext-mask')x.wizard.attrs.class+=' x-mask';
  if(fault==='dialog')x.wizard.attrs.role='dialog';
  const r=await x.run();assert.equal(r.status,'AMBIGUOUS',fault);assert.equal(x.clicks.length,0,fault);
 }
});

test('mapping waits for delayed autosync application without clicking twice',async()=>{
 const f=mappingFixture(),result=await f.run();
 assert.equal(result.status,'SUCCEEDED',result.error);assert.equal(result.mapping.autosync,false);
 assert.equal(f.clicks.filter(t=>t.endsWith(';btnAutoSyncThroughColumns')).length,1);
 assert.equal(f.clicks.filter(t=>t.endsWith(';btnDone')).length,1);
});
test('mapping waits out its owned mask and refuses a foreign overlay',async()=>{
 for(const cover of ['owned','foreign']){
  const f=mappingFixture({cover}),result=await f.run();
  assert.equal(result.status,cover==='owned'?'SUCCEEDED':'AMBIGUOUS',result.error);
  if(cover==='foreign')assert.equal(f.clicks.length,0);
 }
});
test('Calculator foreign-mask refusal identifies the blocker without text, values or actionable refs',async()=>{
 const r=await mappingFixture({cover:'foreign'}).run();
 assert.match(r.error,/Foreign variable mapping mask: /);assert.match(r.error,/"root_tid":"MF;TF-1;WizrdMCF"/);
 assert.match(r.error,/"parent_tid":null/);assert.ok(!r.error.includes('Amount'));
});
test('delayed mapping application cannot hide collateral value drift',async()=>{
 const f=mappingFixture({drift:true}),result=await f.run();
 assert.equal(result.status,'AMBIGUOUS');assert.ok(!f.clicks.some(t=>t.endsWith(';btnDone')));
});
test('independent readback waits for the committed mapping without another mutation',async()=>{
 const configured=await mappingFixture().run(),f=mappingFixture({readback:true,delay:400,unstable:true});
 f.task.expected_mapping=configured.mapping;
 const result=await f.run();assert.equal(result.status,'SUCCEEDED',result.error);
 assert.equal(result.mapping.autosync,false);assert.ok(f.clock.Date.now()>=800);
 assert.equal(f.clicks.length,1);assert.ok(f.clicks[0].endsWith(';btnClose'));
});
test('a permanent mismatch or owned mask stops within the local settling bound',async()=>{
 for(const options of [{delay:20000},{cover:'owned',delay:20000}]){
  const f=mappingFixture(options),result=await f.run();
  assert.equal(result.status,'AMBIGUOUS');assert.ok(f.clock.Date.now()<10000);
  assert.ok(!f.clicks.some(t=>t.endsWith(';btnDone')));
  assert.ok(f.clicks.filter(t=>t.endsWith(';btnAutoSyncThroughColumns')).length<=1);
 }
});
test('the native disabled delete header mask is not a loading or foreign overlay',async()=>{
 const f=mappingFixture({cover:'disabled-header'}),result=await f.run();
 assert.equal(result.status,'SUCCEEDED',result.error);
});
test('a graph mask appearing after Done must settle before independent readback',async()=>{
 const f=mappingFixture({graphDelay:400}),result=await f.run();
 assert.equal(result.status,'SUCCEEDED',result.error);
 assert.ok(f.clock.Date.now()>=f.closed()+560);
 assert.equal(f.clicks.filter(t=>t.endsWith(';btnDone')).length,1);
});
test('mapping writer stops before opening a port on a foreign or locked graph',async()=>{
 const binding={document_id:'doc',workflow_ref:workflow,node:ref},mapping={direction:'input',port:0,kind:'variables'};
 assert.doesNotThrow(()=>makeVariablePortMappingCode(binding,{mapping}));
 for(const graph of [{verified:false},{verified:true,surface:'wizard'},{verified:true,surface:'graph',locked:true}]){
  const r=await configureVariablePortMapping({waitForTimeout:async()=>{}},{binding,mapping,deadline:Date.now()+1},async()=>graph,()=>assert.fail('No port opening'));
  assert.equal(r.status,'NOT_APPLIED');assert.equal(r.cleanup_complete,true);assert.equal(r.effect_possible,false);
 }
});

test('serialized control W1 readback Cancels without Done or changing native values and identity',async()=>{
 const f=mappingFixture({readback:true});f.task.mapping.kind='control';f.port.FSubType=4;
 const before=JSON.stringify(f.record);
 const r=await f.run();assert.equal(r.status,'SUCCEEDED',r.error);
 assert.equal(r.verified,true);assert.equal(r.cleanup_complete,true);
 assert.equal(r.mapping.kind,'control');assert.equal(r.mapping.port_guid,'port');
 assert.deepEqual(f.clicks,['MF;TF-1;WizrdMCF;btnClose']);assert.equal(JSON.stringify(f.record),before);assert.notEqual(f.closed(),null);
});
