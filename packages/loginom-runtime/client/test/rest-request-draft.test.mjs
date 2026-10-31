import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {restRequestCapability} from '../lib/rest-request.mjs';

function fixture(foreign=null,manual=false,duplicate=null,options={}){
 const root='MF;TF-1;WizrdMCF',base=root+';RESTRequestWizard;ParamLinks';
 const node={document_id:'doc',workflow_id:'flow',node_id:'rest'};
 const names=options.empty?[]:['RequestId','Key'],columnRows=names.map((Name,i)=>({id:Name,data:{Index:[17,0][i],Name,DataType:5}})),parameterRows=names.map(Name=>({data:{Name:manual?Name.toLowerCase():Name,DataType:5}}));
 let stage=0,lastSelector='',autoLinks=0,nextClicks=0,drags=0;
 const points=[];
 const store=rows=>({loading:false,getRange:()=>rows});
 const columns=store(columnRows),parameters=store(parameterRows),saved=store([]);
 saved.complete=true;
 const rootElement={},paramElement={},card={contains:e=>e===paramElement};
 const grid={},draw={FOwner:grid,FLinks:{}};grid.FLinkDrawContainer=draw;
 const p={FView:{el:{dom:paramElement}},FColumnsStore:columns,FParamStore:parameters,FGrdParamStore:parameters,FRequestParamLinks:saved,
  FItems:{grdFields:{getStore:()=>columns},grdParams:{getStore:()=>parameters},pnlLinkGrid:grid}};
 class RESTRequestWizard{constructor(){this.FRequestConfig=p;this.FVerb=0;}}
 const controller={FView:{el:{dom:rootElement}},FWizardItems:[{FWizard:new RESTRequestWizard()}],FCardLayout:{getActiveItem:()=>({id:'card-'+stage,el:{dom:card}})}};
 const element={getBoundingClientRect:()=>({x:10,y:10,width:100,height:20}),contains:()=>false,closest:()=>null};
 const document={querySelectorAll:s=>s==='[data-tid='+JSON.stringify(root)+']'?[rootElement]:s==='[data-tid='+JSON.stringify(base)+']'?[paramElement]:[],elementFromPoint:()=>element};
 const Workspace={getActiveTab:()=>({Controller:{FController:controller}})};
 const app={Version:'7.4.2',Application:{FInstance:{FMainForm:{Items:{Workspace}}}}};
 const scope=vm.createContext({document,location:{origin:'http://loginom.test'},bg:{app}});
 const evaluate=(fn,arg)=>structuredClone(vm.runInContext('('+fn.toString()+')',scope)(arg));
 const captions=['Настройка запроса','Настройка пользовательских заголовков','Дополнительные параметры','Описание узла'];
 const page={evaluate,waitForTimeout:async ms=>options.tick?.(ms),locator:selector=>({
  count:async()=>{
   if(selector.startsWith('.x-mask'))return options.stall==='loading'?1:0;
   if(selector.includes(';btnError'))return 0;
   if(selector.includes(';colColumnName_'))return columnRows.some(r=>selector==='[data-tid='+JSON.stringify(base+';colColumnName_'+r.data.Index)+']')?(duplicate==='column'?2:1):0;
   if(selector.includes(';colParam_'))return parameterRows.some(r=>selector==='[data-tid='+JSON.stringify(base+';colParam_'+r.data.Name)+']')?(duplicate==='parameter'?2:1):0;
   return 1;
  },
  isVisible:async()=>true,innerText:async()=>captions[stage],
  evaluate:async fn=>{lastSelector=selector;points.push(selector);return evaluate(fn,element);},
 }),mouse:{click:async()=>{
  if(lastSelector.includes(';btnAutoLink')){
   autoLinks++;if(options.stall!=='bindings')draw.FLinks=Object.fromEntries(columnRows.map((c,i)=>[i,[foreign==='column'?{data:{...c.data}}:c,foreign==='parameter'?{data:{...parameterRows[i].data}}:parameterRows[i]]]));
  }else if(lastSelector.includes(';btnNext')){if(options.stall!=='transition')stage++;nextClicks++;}
 },move:async()=>{},down:async()=>{drags++;},up:async()=>{
  const [source,target]=points.slice(-2),column=columnRows.find(r=>source==='[data-tid='+JSON.stringify(base+';colColumnName_'+r.data.Index)+']'),parameter=parameterRows.find(r=>target==='[data-tid='+JSON.stringify(base+';colParam_'+r.data.Name)+']');
  assert.ok(column&&parameter,'the drag must use the owned native records');
  draw.FLinks[parameter.data.Name]=[column,parameter];
 }}};
 return {saved,drags:()=>drags,counts:()=>({autoLinks,nextClicks}),run:()=>restRequestCapability(page,{deadline:Date.now()+600000,document_id:'doc',origin:'http://loginom.test',build:'7.4.2',workflow_ref:{prefix:'MF;TF-1'},node,
  query_parameters:options.query??names.map((field,i)=>({name:parameterRows[i].data.Name,field}))},async()=>({...node,verified:true,surface:'wizard'}))};
}

test('plain GET commits an empty parameter inventory without AutoLink or a data table',async()=>{
 const f=fixture(null,false,null,{empty:true}),result=await f.run();
 assert.equal(result.verified,true,result.error);
 assert.deepEqual(result.configuration.query_parameters,[]);
 assert.deepEqual(result.configuration.input_fields,[]);
 assert.deepEqual(f.counts(),{autoLinks:0,nextClicks:3});
});
test('plain GET refuses saved nonempty query definitions before changing bindings',async()=>{
 const f=fixture(null,false,null,{query:[]}),result=await f.run();
 assert.equal(result.verified,false);
 assert.match(result.error,/query parameter definitions differ/);
 assert.deepEqual(f.counts(),{autoLinks:0,nextClicks:0});
});

for(const [stall,step] of [['loading','wizard loading'],['bindings','requested query bindings'],['transition','wizard page transition']])test('REST '+step+' has its own deadline and never repeats the pending gesture',async t=>{
 let clock=1000;t.mock.method(Date,'now',()=>clock);
 const f=fixture(null,false,null,{stall,tick:ms=>{clock+=ms;}}),r=await f.run();
 assert.equal(r.verified,false);
 assert.equal(r.failure?.code,'REST_CONFIGURE_STEP_TIMEOUT',JSON.stringify(r));
 assert.equal(r.failure.step,step);
 assert.ok(clock<=31080,'refusal must not consume the ten minute operation deadline');
 assert.match(r.error,new RegExp(step));
 assert.equal(f.counts().autoLinks,stall==='loading'?0:1);
 assert.equal(f.counts().nextClicks,stall==='transition'?1:0);
});

test('REST configure accepts the live AutoLink draft while the saved binding store remains empty',async()=>{
 const f=fixture(),result=await f.run();
 assert.equal(result.verified,true,result.error);
 assert.deepEqual(result.configuration.query_parameters,[{name:'RequestId',field:'RequestId'},{name:'Key',field:'Key'}]);
 assert.deepEqual(f.saved.getRange(),[]);
 assert.deepEqual(f.counts(),{autoLinks:1,nextClicks:3});
});
for(const foreign of ['column','parameter'])test('REST draft refuses a '+foreign+' record from a different inventory',async()=>{
 const f=fixture(foreign),result=await f.run();
 assert.equal(result.verified,false);
 assert.match(result.error,/draft link records differ/);
 assert.deepEqual(f.counts(),{autoLinks:1,nextClicks:0});
});

test('REST manual bindings use native column Index values, including zero, rather than record IDs, field names or row positions',async()=>{
 const f=fixture(null,true),result=await f.run();
 assert.equal(result.verified,true,result.error);
 assert.deepEqual(result.configuration.query_parameters,[{name:'requestid',field:'RequestId'},{name:'key',field:'Key'}]);
 assert.deepEqual(f.counts(),{autoLinks:0,nextClicks:3});
 assert.equal(f.drags(),2);
});
for(const duplicate of ['column','parameter'])test('REST refuses duplicate '+duplicate+' controls before starting a manual drag',async()=>{
 const f=fixture(null,true,duplicate),result=await f.run();
 assert.equal(result.verified,false);
 assert.match(result.error,/control is ambiguous/);
 assert.equal(result.effect_possible,false);
 assert.equal(result.cleanup_complete,true);
 assert.equal(f.drags(),0);
 assert.deepEqual(f.counts(),{autoLinks:0,nextClicks:0});
});
