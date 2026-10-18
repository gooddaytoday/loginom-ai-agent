import test from 'node:test';
import assert from 'node:assert/strict';
import {restConnectionCapability} from '../lib/rest-connection.mjs';

const cases={input:'a retained visible REST container cannot authorize filling its zero-sized input',parameter:'REST waits for the added parameter type before checking string bindings',palette:'REST waits for the newly expanded palette item before its single drag',animation:'REST does not start a drag from a hit-testable row inside its native tree animation'};
for(const [stage,title]of Object.entries(cases))test(title,async()=>{
 const prefix='MF;TF-1',fields=prefix+';WizardModelConnectionForm;ConnectionWizard;';
 const item=prefix+';ModelForm;pnlConnections;headercontainer;text_Root>Текущий_модуль>Echo;TreeText';
 let urlPoints=0,tileReads=0,fills=0,visibleChecks=0,parameterReads=0,queryFills=0,palettePoints=0,added=false,label='REST-сервис',url='',paramName='param0',lastSelector='';
 let held=false,dragMoves=0,downCount=0,upCount=0;
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
   if(selector.includes('pedURL'))return url;
   if(selector.includes('pedVerb'))return 'GET';
   if(selector.includes('pedFieldType'))return 'Строка запроса';
   if(selector.includes('txtAuth'))return 'Не требуется';
   throw Error('Unexpected input value read');
  },
  evaluateAll:async()=>{
   if(selector.includes('ListViewForm'))return [prefix+';ListViewForm;cntTile;ListView;headercontainer;title_1'];
   if(selector.includes('ConnectionsViewWizard')&&selector.includes('title_'))return ++tileReads===1?[]:[{tid:prefix+';ConnectionsViewWizard;cntTile;ListView;headercontainer;title_0',name:label}];
   if(selector.includes('pnlConnections'))return [item];
   if(selector.includes('colName_')){
    if(!added)return [];
    assert.ok(selector.includes('grdParams;tbl'));
    return ++parameterReads===1?[{name:'1',tid:fields+'colName_1',type:'not materialized'}]:[{name:paramName,tid:fields+'colName_'+paramName,type:'Строковый'}];
   }
   throw Error('Unexpected inventory');
  },
  evaluate:async fn=>{
   lastSelector=selector;
   if(selector.includes('cmpDiagram'))return {x:500,y:400};
   const zero=input&&selector.includes('pedURL')&&++urlPoints%2===1||selector.includes(item)&&++palettePoints===1&&stage!=='animation';
   const element={getBoundingClientRect:()=>({x:100,y:100,width:zero?0:100,height:zero?0:24}),
    closest:selector=>selector==='.x-tree-animator-wrap'&&stage==='animation'&&lastSelector.includes(item)&&palettePoints===1?{}:null,contains:()=>false,classList:{contains:()=>false}};
   globalThis.document={elementFromPoint:()=>element};
   return fn(element);
  },
  fill:async value=>{
   if(selector.includes('pedURL')){assert.equal(urlPoints,4);url=value;fills++;if(stage==='input')throw Error('fixture stopped after the sole reachable fill');return;}
   if(selector.includes('fldLabel')){label=value;return;}
   assert.ok(selector.includes('celleditor'));queryFills++;if(stage==='parameter')throw Error('fixture stopped after the typed parameter editor');paramName=value;
  },
  press:async()=>{},
 });
 const page={locator,mouse:{click:async()=>{if(lastSelector.includes('btnAdd'))added=true;},dblclick:async()=>{},
  move:async()=>{if(held){dragMoves++;}},
  down:async()=>{assert.equal(palettePoints,2);if(stage==='palette')throw Error('fixture stopped before the sole palette drag');held=true;downCount++;},
  up:async()=>{held=false;upCount++;}},waitForTimeout:async()=>{},
  evaluate:async fn=>{
   const code=fn.toString();if(code.includes('FNodes.FCollection.map'))return [{id:'existing',y:100}];
   if(code.includes('Unexpected graph additions')){assert.equal(dragMoves,1);assert.equal(downCount,1);assert.equal(upCount,1);return {node_id:'rest-reference'};}
   return true;
  },evaluateHandle:async()=>({dispose:async()=>{}})};
 try{
  const result=await restConnectionCapability(page,{deadline:Date.now()+10000,document_id:'doc',origin:'http://example.test',build:'7.4.2',
   workflow_ref:{workflow_id:'flow',tab_tid:'tab',prefix,navigation_path:[{tid:'module'},{label:'Сценарий'}]},
   connection:{name:'Echo',base_url:'https://httpbin.org/anything'},query_parameters:[{name:'Key',field:'Key'}]});
  assert.equal(result.verified,stage==='animation');
  if(stage==='animation'){assert.equal(result.connection.reference_node_id,'rest-reference');assert.equal(result.cleanup_complete,true);}
  else assert.equal(result.error,stage==='input'?'fixture stopped after the sole reachable fill':stage==='parameter'?'fixture stopped after the typed parameter editor':'fixture stopped before the sole palette drag');
  assert.equal(fills,1);assert.equal(urlPoints,['palette','animation'].includes(stage)?6:4);assert.ok(visibleChecks>0);
  if(stage==='parameter'){assert.equal(parameterReads,2);assert.equal(queryFills,1);}
  if(['palette','animation'].includes(stage)){assert.equal(palettePoints,2);assert.equal(queryFills,1);}
 }finally{
  for(const [key,value]of Object.entries(previous))if(value===undefined)delete globalThis[key];else globalThis[key]=value;
 }
});
