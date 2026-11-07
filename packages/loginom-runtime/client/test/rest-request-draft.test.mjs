import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {restRequestCapability} from '../lib/rest-request.mjs';

function fixture(foreign=null,manual=false,duplicate=null,options={}){
 const root='MF;TF-1;WizrdMCF',base=root+';RESTRequestWizard;'+(options.nestedParam?'MessageBody;':'')+'ParamLinks';
 const node={document_id:'doc',workflow_id:'flow',node_id:'rest'};
 const advanced=root+';AdditionalParamsWizard',values={pedTimeout:options.timeout??-1,pedFailedRequestRepeat:options.retries??0},writes=[];
 const inputs=Object.fromEntries(Object.keys(values).map(k=>[k,{id:k,value:String(values[k]),readOnly:false,disabled:false}]));
 const advancedElement={contains:e=>Object.values(inputs).includes(e)};
 const fields=Object.fromEntries(Object.keys(values).map(k=>[k,{el:{dom:inputs[k]},inputEl:{dom:inputs[k]},getXType:()=>"numberfield",getValue:()=>values[k]}]));
 const names=options.empty?[]:['RequestId','Key'],columnRows=[...names,...(options.method?['Body']:[])].map((Name,i)=>({id:Name,data:{Index:[17,0,3][i],Name,DataType:options.bodyType??5}})),parameterRows=names.map(Name=>({data:{Name:manual?Name.toLowerCase():Name,DataType:5}}));
 let stage=options.inputPage?-1:0,lastSelector='',autoLinks=0,nextClicks=0,drags=0;
 const points=[];
 const store=rows=>({loading:false,getRange:()=>rows});
 const columns=store(columnRows),parameters=store(parameterRows),saved=store([]);
 saved.complete=true;
 const columnTid=root+';TuneDataSourceInputPortWizard;colTargetDelete';
 const owner={id:'columnheader-1032',getAttribute:()=>columnTid};
 const mask={parentElement:owner,matches:s=>s==='.x-mask',getBoundingClientRect:()=>({x:1214,y:168,width:30,height:27})};
 const loading={matches:()=>false};
 const rootElement={contains:e=>e===owner},paramElement={getAttribute:()=>base},card={contains:e=>e===paramElement||(stage===-1&&e===owner&&options.mask!=='foreign-card')};
 const component={disabled:options.mask!=='enabled',getXType:()=>options.mask==='wrong-type'?'gridcolumn':'actioncolumn',el:{dom:options.mask==='foreign-dom'?{}:owner}};
 const grid={},draw={FOwner:grid,FLinks:{}};grid.FLinkDrawContainer=draw;
 const p={FView:{el:{dom:paramElement}},FColumnsStore:columns,FParamStore:parameters,FGrdParamStore:parameters,FRequestParamLinks:saved,
  FItems:{grdFields:{getStore:()=>columns},grdParams:{getStore:()=>parameters},pnlLinkGrid:grid}};
 const sourceColumns={Store:columns};
 class RESTRequestWizard{constructor(){this.FColumns=sourceColumns;this.FVerb=['GET','POST','PUT','DELETE','PATCH'].indexOf(options.method??'GET');
  this.FRequestConfig=[1,2,4].includes(this.FVerb)?{FColumns:sourceColumns,FParamLinks:p}:p;}}
 const controller={FView:{el:{dom:rootElement}},FWizardItems:[{FWizard:new RESTRequestWizard()}],FCardLayout:{getActiveItem:()=>({id:'card-'+stage,el:{dom:stage===2?advancedElement:card}})}};
 const element={getBoundingClientRect:()=>({x:10,y:10,width:100,height:20}),contains:()=>false,closest:()=>null};
 const document={querySelectorAll:s=>s==='[data-tid='+JSON.stringify(advanced)+']'?[advancedElement]:Object.keys(values).some(k=>s==='[data-tid='+JSON.stringify(advanced+';'+k+';ValueControl')+']')?[inputs[Object.keys(values).find(k=>s.includes(k))]]:s==='[data-tid='+JSON.stringify(root)+']'?[rootElement]:s==='[data-tid='+JSON.stringify(base)+']'?[paramElement]:s==='[data-tid='+JSON.stringify(columnTid)+']'?(options.mask==='duplicate'?[owner,{}]:[owner]):[],elementFromPoint:()=>options.mask==='covered-next'?mask:element};
 const Workspace={getActiveTab:()=>({Controller:{FController:controller}})};
 const app={Version:'7.4.2',Application:{FInstance:{FMainForm:{Items:{Workspace}}}}};
 const scope=vm.createContext({document,location:{origin:'http://loginom.test'},bg:{app,TBGHTTPVerb:{httpGET:0,httpPOST:1,httpPUT:2,httpDELETE:3,httpPATCH:4}},Ext:{getCmp:id=>fields[id]??component}});
 const evaluate=(fn,arg)=>structuredClone(vm.runInContext('('+fn.toString()+')',scope)(arg));
 const captions=['Настройка запроса','Настройка пользовательских заголовков','Дополнительные параметры','Описание узла'];
 let body='',bodyPickerOpen=false;
 const page={evaluate,waitForTimeout:async ms=>options.tick?.(ms),locator:selector=>({
  locator:()=>({inputValue:async()=>body,fill:async value=>{const k=Object.keys(values).find(k=>selector.includes(k));assert.ok(k);values[k]=Number(value);inputs[k].value=value;writes.push([k,Number(value)]);},press:async()=>{}}),
  count:async()=>{
   if(selector.includes(';edtMessageBodyColumn;boundlist;Body'))return bodyPickerOpen?1:0;
   if(selector.startsWith('.x-mask'))return options.stall==='loading'||stage===-1?1:0;
   if(selector.includes(';btnError'))return 0;
   if(selector.includes(';colColumnName_'))return columnRows.some(r=>selector==='[data-tid='+JSON.stringify(base+';colColumnName_'+r.data.Index)+']')?(duplicate==='column'?2:1):0;
   if(selector.includes(';colParam_'))return parameterRows.some(r=>selector==='[data-tid='+JSON.stringify(base+';colParam_'+r.data.Name)+']')?(duplicate==='parameter'?2:1):0;
   return 1;
  },
  evaluateAll:async(fn,arg)=>vm.runInContext('('+fn.toString()+')',scope)(options.stall==='loading'?[loading]:stage===-1?(options.mask==='real-loading'?[mask,loading]:[mask]):[],arg),
  isVisible:async()=>stage>=0&&!(options.hiddenQuery&&selector.includes(';ParamLinks')),innerText:async()=>stage===-1?'Настройка входных столбцов':captions[stage],
  evaluate:async fn=>{lastSelector=selector;points.push(selector);return evaluate(fn,element);},
 }),mouse:{click:async()=>{
  if(lastSelector.includes(';btnAutoLink')){
   autoLinks++;if(options.stall!=='bindings')draw.FLinks=Object.fromEntries(columnRows.map((c,i)=>[i,[foreign==='column'?{data:{...c.data}}:c,foreign==='parameter'?{data:{...parameterRows[i].data}}:parameterRows[i]]]));
  }else if(lastSelector.includes(';edtMessageBodyColumn;trg_picker')){bodyPickerOpen=true;}
  else if(lastSelector.includes(';boundlist;Body')){body='Body';bodyPickerOpen=false;}
  else if(lastSelector.includes(';btnNext')){if(options.stall!=='transition')stage++;nextClicks++;}
 },move:async()=>{},down:async()=>{drags++;},up:async()=>{
  const [source,target]=points.slice(-2),column=columnRows.find(r=>source==='[data-tid='+JSON.stringify(base+';colColumnName_'+r.data.Index)+']'),parameter=parameterRows.find(r=>target==='[data-tid='+JSON.stringify(base+';colParam_'+r.data.Name)+']');
  assert.ok(column&&parameter,'the drag must use the owned native records');
  draw.FLinks[parameter.data.Name]=[column,parameter];
 }}};
 return {values,writes,saved,drags:()=>drags,counts:()=>({autoLinks,nextClicks}),run:()=>restRequestCapability(page,{deadline:Date.now()+600000,document_id:'doc',origin:'http://loginom.test',build:'7.4.2',workflow_ref:{prefix:'MF;TF-1'},node,
  new_node:options.new_node===true,...(options.method?{connection:{method:options.method},...(['POST','PUT','PATCH'].includes(options.method)?{body_field:'Body'}:{})}:{}),query_parameters:options.query??names.map((field,i)=>({name:parameterRows[i].data.Name,field}))},async()=>({...node,verified:true,surface:'wizard'}))};
}

for(const method of ['POST','PUT','PATCH','DELETE'])test('C1 configures native '+method+' and reads body binding',async()=>{
 const f=fixture(null,false,null,{method,empty:true}),r=await f.run();
 assert.equal(r.verified,true,r.error);
 assert.equal(r.configuration.method,method);
 assert.equal(r.configuration.body_field,method==='DELETE'?undefined:'Body');
});
test('C1 recognizes the owned request page when the empty query panel is hidden',async()=>{
 const f=fixture(null,false,null,{method:'POST',empty:true,hiddenQuery:true}),r=await f.run();
 assert.equal(r.verified,true,r.error);assert.equal(r.configuration.body_field,'Body');
});
test('C1 uses the owned nested MessageBody query data-tid for manual bindings',async()=>{
 const f=fixture(null,true,null,{method:'POST',nestedParam:true}),r=await f.run();
 assert.equal(r.verified,true,r.error);assert.equal(f.drags(),2);
 assert.deepEqual(r.configuration.query_parameters,[{name:'requestid',field:'RequestId'},{name:'key',field:'Key'}]);
});
test('C1 rejects a non-string body column before a body gesture',async()=>{
 const f=fixture(null,false,null,{method:'POST',empty:true,bodyType:1}),r=await f.run();
 assert.equal(r.verified,false);assert.equal(r.effect_possible,false);
 assert.match(r.error,/string input field/);
});

test('plain GET commits an empty parameter inventory without AutoLink or a data table',async()=>{
 const f=fixture(null,false,null,{empty:true}),result=await f.run();
 assert.equal(result.verified,true,result.error);
 assert.deepEqual(result.configuration.query_parameters,[]);
 assert.deepEqual(result.configuration.input_fields,[]);
 assert.deepEqual(f.counts(),{autoLinks:0,nextClicks:3});
});
test('observed 30 by 27 disabled input delete-column mask permits the reachable Next button',async t=>{
 let clock=1000;t.mock.method(Date,'now',()=>clock);
 const f=fixture(null,false,null,{empty:true,inputPage:true,tick:ms=>{clock+=ms;}}),result=await f.run();
 assert.equal(result.verified,true,result.error);
 assert.deepEqual(f.counts(),{autoLinks:0,nextClicks:4});
 assert.equal(clock,1000,'the disabled-column overlay must not consume the loading deadline');
});
for(const mask of ['enabled','wrong-type','foreign-dom','foreign-card','duplicate','real-loading'])test('input mask remains blocking for '+mask,async t=>{
 let clock=1000;t.mock.method(Date,'now',()=>clock);
 const f=fixture(null,false,null,{empty:true,inputPage:true,mask,tick:ms=>{clock+=ms;}}),result=await f.run();
 assert.equal(result.verified,false);
 assert.equal(result.failure?.code,'REST_CONFIGURE_STEP_TIMEOUT');
 assert.equal(result.failure.step,'wizard loading');
 assert.equal(clock,31000);
 assert.deepEqual(f.counts(),{autoLinks:0,nextClicks:0});
});
test('disabled-column exception preserves the Next button hit-test',async t=>{
 let clock=1000;t.mock.method(Date,'now',()=>clock);
 const f=fixture(null,false,null,{empty:true,inputPage:true,mask:'covered-next',tick:ms=>{clock+=ms;}}),result=await f.run();
 assert.equal(result.verified,false);
 assert.match(result.error,/control is not reachable/);
 assert.deepEqual(f.counts(),{autoLinks:0,nextClicks:0});
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

for(const new_node of [true,false])test('REST timeout defaults apply only to new nodes: '+new_node,async()=>{
 const f=fixture(null,false,null,{empty:true,new_node,timeout:new_node?-1:75,retries:new_node?0:4});
 const result=await f.run();assert.equal(result.verified,true,result.error);
 assert.deepEqual(f.values,new_node?{pedTimeout:30,pedFailedRequestRepeat:0}:{pedTimeout:75,pedFailedRequestRepeat:4});
 assert.deepEqual(f.writes,new_node?[["pedTimeout",30]]:[]);
});
