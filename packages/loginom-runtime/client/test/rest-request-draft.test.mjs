import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {restRequestCapability} from '../lib/rest-request.mjs';

function fixture(foreign=null){
 const root='MF;TF-1;WizrdMCF',base=root+';RESTRequestWizard;ParamLinks';
 const node={document_id:'doc',workflow_id:'flow',node_id:'rest'};
 const names=['RequestId','Key'],columnRows=names.map(Name=>({data:{Name,DataType:5}})),parameterRows=names.map(Name=>({data:{Name,DataType:5}}));
 let stage=0,lastSelector='',autoLinks=0,nextClicks=0;
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
 const page={evaluate,waitForTimeout:async()=>{},locator:selector=>({
  count:async()=>selector.startsWith('.x-mask')||selector.includes(';btnError')?0:1,
  isVisible:async()=>true,innerText:async()=>captions[stage],
  evaluate:async fn=>{lastSelector=selector;return evaluate(fn,element);},
 }),mouse:{click:async()=>{
  if(lastSelector.includes(';btnAutoLink')){
   autoLinks++;draw.FLinks=Object.fromEntries(columnRows.map((c,i)=>[i,[foreign==='column'?{data:{...c.data}}:c,foreign==='parameter'?{data:{...parameterRows[i].data}}:parameterRows[i]]]));
  }else if(lastSelector.includes(';btnNext')){stage++;nextClicks++;}
 }}};
 return {saved,counts:()=>({autoLinks,nextClicks}),run:()=>restRequestCapability(page,{deadline:Date.now()+2000,document_id:'doc',origin:'http://loginom.test',build:'7.4.2',workflow_ref:{prefix:'MF;TF-1'},node,
  query_parameters:names.map(name=>({name,field:name}))},async()=>({...node,verified:true,surface:'wizard'}))};
}

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
