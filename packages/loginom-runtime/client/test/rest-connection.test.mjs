import test from 'node:test';
import assert from 'node:assert/strict';
import {restConnectionCapability} from '../lib/rest-connection.mjs';
import vm from 'node:vm';

const cases={render_wait:'REST waits for the created connection port to render without repeating the drag',wrongref:'REST rejects a rendered port belonging to another node type',mime:'REST explicitly writes and rereads the saved allowed response Content-Type',mime_stale:'REST refuses an allowed response Content-Type that did not persist',input:'a retained visible REST container cannot authorize filling its zero-sized input',parameter:'REST waits for the added parameter type before checking string bindings',palette:'REST waits for the newly expanded palette item before its single drag',animation:'REST does not start a drag from a hit-testable row inside its native tree animation',expander:'REST expands the moving connection tree with one stable locator click',confirm:'REST confirms one owned active-connection deactivation',foreign:'REST refuses a deactivation question belonging to another connection tree'};
for(const [stage,title]of Object.entries(cases))test(title,async()=>{
 const prefix='MF;TF-1',fields=prefix+';WizardModelConnectionForm;ConnectionWizard;';
 const item=prefix+';ModelForm;pnlConnections;headercontainer;text_Root>Текущий_модуль>Echo;TreeText';
 let urlPoints=0,tileReads=0,fills=0,visibleChecks=0,parameterReads=0,queryFills=0,palettePoints=0,added=false,label='REST-сервис',url='',paramName='param0',lastSelector='';
 let held=false,dragMoves=0,downCount=0,upCount=0,expanded=stage!=='expander',expansions=0;
 let opening=false,confirmations=0,responseType='application/json',responseFills=0,wizardCloses=0,referenceReads=0;
 const form=prefix+';ConnectionsViewWizard',root={isConnected:true},tree={},connection={ParentNode:stage==='foreign'?{}:tree},wizardNode={ParentNode:connection};
 const controls=Object.fromEntries(Object.entries({yes:'Да',no:'Да, больше не спрашивать',cancel:'Нет'}).map(([key,textContent])=>['msgbox;tlb;'+key,{id:key,textContent,checkVisibility:()=>true,isConnected:true}]));
 const nodeElement={id:'connection',textContent:'Echo'},wizardElement={id:'wizard',textContent:'Настройка'};
 const dialog={id:'question',isConnected:true,checkVisibility:()=>true,innerText:'Loginom 7.4.2 Настройка узла приведет к его деактивации. Вы действительно хотите начать настраивать узел? Да Да, больше не спрашивать Нет',contains:e=>Object.values(controls).includes(e)};
 class ConnectionsViewWizard{constructor(){this.FView={el:{dom:root}};}}
 const controller={FController:new ConnectionsViewWizard(),Node:{data:{node:tree}}};
 const native=new Map([[dialog.id,{el:{dom:dialog}}],[nodeElement.id,{el:{dom:nodeElement},_node:{data:{node:connection}}}],[wizardElement.id,{el:{dom:wizardElement},_node:{data:{node:wizardNode}}}],...Object.values(controls).map(e=>[e.id,{el:{dom:e},disabled:false}])]);
 const scope=vm.createContext({bg:{app:{Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:controller})}}}}}}},Ext:{getCmp:id=>native.get(id)},document:{querySelectorAll:s=>s==='.x-window'?[dialog]:s.startsWith('[data-tid^=')?[nodeElement,wizardElement]:s==='[data-tid='+JSON.stringify(form)+']'?[root]:Object.entries(controls).filter(([tid])=>s==='[data-tid='+JSON.stringify(tid)+']').map(([,e])=>e)}});
 const nativeRead=(fn,arg)=>vm.runInContext('('+fn.toString()+')',scope)(arg);
 const previous={document:globalThis.document,innerWidth:globalThis.innerWidth,innerHeight:globalThis.innerHeight};
 globalThis.innerWidth=1280;globalThis.innerHeight=800;
 const locator=(selector,input=false)=>({
  count:async()=>selector.startsWith('.x-mask')?0:selector==='.x-window:visible'?(opening&&!confirmations?1:0):selector.includes('pnlConnections;headercontainer;text_Root>Текущий_модуль>')&&!expanded?0:1,
  click:async()=>{assert.ok(selector.includes(';TreeExpander'));expanded=true;expansions++;},
  locator:child=>child==='input'?locator(selector,true):locator(selector+' '+child),
  // This is the observed Ext failure: its container claims visibility before
  // the actual input has a usable rectangle. Neither may cause a fill.
  isVisible:async()=>{visibleChecks++;return !(input&&selector.includes('pedURL')&&opening&&!confirmations);},
  inputValue:async()=>{
   if(selector.includes('fldLabel'))return label;
   if(selector.includes('pedURL'))return url;
   if(selector.includes('pedVerb'))return 'GET';
   if(selector.includes('pedResponseContentType'))return stage==='mime_stale'&&wizardCloses>0?'application/json':responseType;
   if(selector.includes('pedFieldType'))return 'Строка запроса';
   if(selector.includes('txtAuth'))return 'Не требуется';
   throw Error('Unexpected input value read');
  },
  evaluateAll:async()=>{
   if(selector.includes('ListViewForm'))return [prefix+';ListViewForm;cntTile;ListView;headercontainer;title_1'];
   if(selector.includes('ConnectionsViewWizard')&&selector.includes('title_'))return ++tileReads===1?[]:[{tid:prefix+';ConnectionsViewWizard;cntTile;ListView;headercontainer;title_0',name:label}];
   if(selector.includes('pnlConnections'))return expanded?[item]:[];
   if(selector.includes('colName_')){
    if(!added)return [];
    assert.ok(selector.includes('grdParams;tbl'));
    return ++parameterReads===1?[{name:'1',tid:fields+'colName_1',type:'not materialized'}]:[{name:paramName,tid:fields+'colName_'+paramName,type:'Строковый'}];
   }
   throw Error('Unexpected inventory');
  },
  evaluate:async(fn,arg)=>{
   lastSelector=selector;
   if(selector.includes('cmpDiagram'))return {x:500,y:400};
   const zero=input&&selector.includes('pedURL')&&++urlPoints%2===1||selector.includes(item)&&++palettePoints===1&&stage!=='animation';
   const element={getBoundingClientRect:()=>({x:100,y:100,width:zero?0:100,height:zero?0:24}),
    closest:selector=>selector==='.x-tree-animator-wrap'&&stage==='animation'&&lastSelector.includes(item)&&palettePoints===1?{}:null,contains:()=>false,classList:{contains:()=>false}};
   globalThis.document={elementFromPoint:()=>element};
   return fn(element);
  },
  fill:async value=>{
   if(selector.includes('pedResponseContentType')){responseFills++;responseType=value;return;}
   if(selector.includes('pedURL')){assert.equal(urlPoints,4);url=value;fills++;if(stage==='input')throw Error('fixture stopped after the sole reachable fill');return;}
   if(selector.includes('fldLabel')){label=value;return;}
   assert.ok(selector.includes('celleditor'));queryFills++;if(stage==='parameter')throw Error('fixture stopped after the typed parameter editor');paramName=value;
  },
  press:async()=>{},
 });
 const page={locator,mouse:{click:async()=>{if(lastSelector.includes(';WizardModelConnectionForm;btnDone'))wizardCloses++;if(lastSelector.includes('btnAdd'))added=true;if(lastSelector.includes('btnConfigConnection')&&['confirm','foreign'].includes(stage))opening=true;if(lastSelector.includes('msgbox;tlb;yes')){confirmations++;assert.equal(confirmations,1);}},dblclick:async()=>{},
  move:async()=>{if(held){dragMoves++;}},
  down:async()=>{assert.equal(palettePoints,2);if(stage==='palette')throw Error('fixture stopped before the sole palette drag');held=true;downCount++;},
  up:async()=>{held=false;upCount++;}},waitForTimeout:async()=>{},
  evaluate:async(fn,arg)=>{
   const code=fn.toString();if(code.includes('FNodes.FCollection.map'))return [{id:'existing',y:100}];
   if(code.includes('q.dialog.isConnected'))return nativeRead(fn,arg);
   if(code.includes('Unexpected graph additions')){assert.equal(dragMoves,1);assert.equal(downCount,1);assert.equal(upCount,1);if(['render_wait','wrongref'].includes(stage)){
    const graph={FNodes:{FCollection:[{FGuid:'existing'},{FGuid:'rest-reference',FPorts:[{FCollection:[{FCell:{}}]}]}]},FmxGraph:{view:{getState:()=>++referenceReads<3?null:{shape:{node:{getAttribute:()=>stage==='wrongref'?'node;Output_Table-0':'node;Output_Connection-0'}}}}}};
    return vm.runInNewContext('('+code+')',{bg:{app:{Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{FController:{FDiagram:graph}}})}}}}}}}})(arg);
   }return {node_id:'rest-reference'};}
   return true;
  },evaluateHandle:async(fn,arg)=>{
   if(!['confirm','foreign'].includes(stage)||!fn.toString().includes('Connection list owner differs')&&!fn.toString().includes('Connection deactivation question differs'))return {dispose:async()=>{}};
   return Object.assign(nativeRead(fn,arg),{dispose:async()=>{}});
  }};
 try{
  const result=await restConnectionCapability(page,{deadline:Date.now()+10000,document_id:'doc',origin:'http://example.test',build:'7.4.2',
   workflow_ref:{workflow_id:'flow',tab_tid:'tab',prefix,navigation_path:[{tid:'module'},{label:'Сценарий'}]},
   connection:{name:'Echo',base_url:'https://httpbin.org/anything',...(['mime','mime_stale'].includes(stage)?{response_content_type:'text/html'}:{})},query_parameters:[{name:'Key',field:'Key'}]});
  assert.equal(result.verified,['animation','expander','confirm','mime','render_wait'].includes(stage),result.error);
  if(['animation','expander','confirm','mime','render_wait'].includes(stage)){assert.equal(result.connection.reference_node_id,'rest-reference');assert.equal(result.cleanup_complete,true);}
  else if(stage==='wrongref'){assert.match(result.error,/New node is not a connection reference/);assert.equal(referenceReads,3);return;}
  else if(stage==='mime_stale'){assert.match(result.error,/saved connection readback differs/);assert.equal(responseFills,1);assert.equal(wizardCloses,1);return;}
  else if(stage==='foreign'){assert.match(result.error,/Pending connection wizard owner differs/);assert.equal(confirmations,0);return;}
  else assert.equal(result.error,stage==='input'?'fixture stopped after the sole reachable fill':stage==='parameter'?'fixture stopped after the typed parameter editor':'fixture stopped before the sole palette drag');
  if(stage==='render_wait')assert.equal(referenceReads,3);
  if(stage==='expander')assert.equal(expansions,1);
  assert.equal(fills,1);assert.equal(urlPoints,['palette','animation','expander','confirm','mime','render_wait'].includes(stage)?6:4);assert.ok(visibleChecks>0);
  if(stage==='confirm')assert.equal(confirmations,1);
  if(stage==='mime'){assert.equal(responseFills,1);assert.equal(wizardCloses,2);assert.equal(result.connection.response_content_type,'text/html');}
  if(!['mime','mime_stale'].includes(stage)){assert.equal(responseFills,0);assert.equal(Object.hasOwn(result.connection??{},'response_content_type'),false);}
  if(stage==='parameter'){assert.equal(parameterReads,2);assert.equal(queryFills,1);}
  if(['palette','animation','expander'].includes(stage)){assert.equal(palettePoints,2);assert.equal(queryFills,1);}
 }finally{
  for(const [key,value]of Object.entries(previous))if(value===undefined)delete globalThis[key];else globalThis[key]=value;
 }
});
