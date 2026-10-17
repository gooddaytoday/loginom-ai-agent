import test from 'node:test';
import assert from 'node:assert/strict';
import {restConnectionCapability} from '../lib/rest-connection.mjs';

for(const query of [false,true])test(query?'REST waits for the added parameter type before checking string bindings':'a retained visible REST container cannot authorize filling its zero-sized input',async()=>{
 const prefix='MF;TF-1',fields=prefix+';WizardModelConnectionForm;ConnectionWizard;';
 let urlPoints=0,tileReads=0,fills=0,visibleChecks=0,parameterReads=0,queryFills=0,added=false,label='REST-сервис',lastSelector='';
 const previous={document:globalThis.document,innerWidth:globalThis.innerWidth,innerHeight:globalThis.innerHeight};
 globalThis.innerWidth=1280;globalThis.innerHeight=800;
 const locator=(selector,input=false)=>({
  count:async()=>selector.startsWith('.x-mask')?0:1,
  locator:child=>child==='input'?locator(selector,true):locator(selector+' '+child),
  // This is the observed Ext failure: its container claims visibility before
  // the actual input has a usable rectangle. Neither may cause a fill.
  isVisible:async()=>{visibleChecks++;return true;},
  inputValue:async()=>{
   if(selector.includes('fldLabel'))return label;
   if(selector.includes('pedURL'))return '';
   if(selector.includes('pedVerb'))return 'GET';
   if(selector.includes('pedFieldType'))return 'Строка запроса';
   if(selector.includes('txtAuth'))return 'Не требуется';
   throw Error('Unexpected input value read');
  },
  evaluateAll:async()=>{
   if(selector.includes('ListViewForm'))return [prefix+';ListViewForm;cntTile;ListView;headercontainer;title_1'];
   if(selector.includes('ConnectionsViewWizard')&&selector.includes('title_'))return ++tileReads===1?[]:[{tid:prefix+';ConnectionsViewWizard;cntTile;ListView;headercontainer;title_0',name:'REST-сервис'}];
   if(selector.includes('colName_')){
    if(!added)return [];
    assert.ok(selector.includes('grdParams;tbl'));
    return ++parameterReads===1?[{name:'1',tid:fields+'colName_1'}]:[{name:'param0',tid:fields+'colName_param0',type:'Строковый'}];
   }
   throw Error('Unexpected inventory');
  },
  evaluate:async fn=>{
   lastSelector=selector;
   const zero=input&&selector.includes('pedURL')&&++urlPoints%2===1;
   const element={getBoundingClientRect:()=>({x:100,y:100,width:zero?0:100,height:zero?0:24}),
    closest:()=>null,contains:()=>false,classList:{contains:()=>false}};
   globalThis.document={elementFromPoint:()=>element};
   return fn(element);
  },
  fill:async value=>{
   if(selector.includes('pedURL')){assert.equal(urlPoints,4);fills++;if(!query)throw Error('fixture stopped after the sole reachable fill');return;}
   if(selector.includes('fldLabel')){label=value;return;}
   assert.ok(selector.includes('celleditor'));queryFills++;throw Error('fixture stopped after the typed parameter editor');
  },
  press:async()=>{},
 });
 const page={locator,mouse:{click:async()=>{if(lastSelector.includes('btnAdd'))added=true;},dblclick:async()=>{}},waitForTimeout:async()=>{},
  evaluate:async()=>true,evaluateHandle:async()=>({dispose:async()=>{}})};
 try{
  const result=await restConnectionCapability(page,{deadline:Date.now()+10000,document_id:'doc',origin:'http://example.test',build:'7.4.2',
   workflow_ref:{workflow_id:'flow',tab_tid:'tab',prefix,navigation_path:[{tid:'module'},{label:'Сценарий'}]},
   connection:{name:'Echo',base_url:'https://httpbin.org/anything'},query_parameters:[{name:'Key',field:'Key'}]});
  assert.equal(result.verified,false);
  assert.equal(result.error,query?'fixture stopped after the typed parameter editor':'fixture stopped after the sole reachable fill');
  assert.equal(fills,1);assert.equal(urlPoints,4);assert.ok(visibleChecks>0);
  if(query){assert.equal(parameterReads,2);assert.equal(queryFills,1);}
 }finally{
  for(const [key,value]of Object.entries(previous))if(value===undefined)delete globalThis[key];else globalThis[key]=value;
 }
});
