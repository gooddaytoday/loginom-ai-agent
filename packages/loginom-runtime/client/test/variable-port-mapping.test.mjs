import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {Document,Element,fixtureClock} from './support/workspace-ui-fixture.mjs';
import {validateNodeApplyRequest} from '../lib/node-apply.mjs';
import {makeVariablePortMappingCode,configureVariablePortMapping} from '../lib/variable-port-mapping.mjs';
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
function mappingFixture({delay=240,cover=null,drift=false,readback=false,unstable=false,graphDelay=0}={}){
 const clock=fixtureClock(),document=new Document(),components=new Map(),clicks=[];
 document.querySelector=selector=>document.querySelectorAll(selector)[0]??null;
 const root=workflow.prefix+';WizrdMCF',form=root+';TuneVariablesMappingWizard';
 const add=(tid,parent=document.body,cls='')=>{
  const e=parent.append(new Element('div',{'data-tid':tid,class:cls},'',{x:20,y:20+components.size*30,width:100,height:20}));
  e.id='cmp-'+components.size;e.checkVisibility=()=>e.style.display!=='none'&&(!e.parentElement||e.parentElement===document.body||e.parentElement.checkVisibility());
  components.set(e.id,{el:{dom:e},disabled:false});return e;
 };
 const wizard=add(root),panel=add(form,wizard),gridEl=add(form+';grdTargetColumns',panel);
 const source={data:{ID:1,Name:'Amount',DisplayName:'Amount',DataType:4}};
 const record={isModel:true,data:{ID:1,Index:0,Name:'Amount',DisplayName:'Amount',DataType:4,OriginType:0,UsageType:0,Description:'',DisplayValue:7,ValueIsNull:false,ConnectedRecord:source}};
 const records=[record],store={isLoading:()=>false,getData:()=>({items:records}),getCount:()=>records.length};
 const grid=components.get(gridEl.id);grid.getStore=()=>store;
 const auto=add(form+';btnAutoSyncThroughColumns',panel),button=components.get(auto.id);button.pressed=true;
 const done=add(root+';btnDone',wizard),close=add(root+';btnClose',wizard);
 const header=cover==='disabled-header'?add(form+';colTargetDelete',panel):null;
 if(header)Object.assign(components.get(header.id),{$className:'Ext.grid.column.Action',disabled:true});
 const mask=cover?add('mask',cover==='foreign'?document.body:header??panel,'x-mask'):null;
 if(mask)mask.box=header?.box??auto.box;
 const graphEl=add(workflow.prefix+';ModelForm'),diagram=add(workflow.prefix+';ModelForm;cmpDiagram',graphEl);
 graphEl.style.display='none';
 const nodeData={},portData={},node={FGuid:'node',data:nodeData},port={FSubType:3,data:portData};
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
 const advance=ms=>{clock.advance(ms);if(mask&&cover==='owned'&&clock.Date.now()>=delay)mask.style.display='none';if(pending&&clock.Date.now()>=pending){button.pressed=false;if(drift)record.data.DisplayValue=8;pending=null;}
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
 const run=async()=>{context.page=page;context.task=task;context.read=graph;context.open=open;return vm.runInContext('('+configureVariablePortMapping.toString()+')(page,task,read,open)',context);};
 return {run,clicks,task,clock,closed:()=>closed};
}

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
