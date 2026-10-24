import test from 'node:test';
import assert from 'node:assert/strict';
import {restConnectionCapability,makeRestConnectionCode} from '../lib/rest-connection.mjs';
import vm from 'node:vm';
import {nodePlacementViewport,nodePlacementPoint,nodePlacementOverflow,samePlacementGraph} from '../lib/node-placement.mjs';

const cases={render_wait:'REST waits for the created connection port to render without repeating the drag',wrongref:'REST rejects a rendered port belonging to another node type',refresh:'REST refreshes its loaded empty palette once, then waits for rows before one drag',refresh_foreign:'REST refuses refreshing a palette after its workflow owner changes',refresh_populated:'REST does not refresh a palette that already contains tree rows',mime:'REST explicitly writes and rereads the saved allowed response Content-Type',mime_stale:'REST refuses an allowed response Content-Type that did not persist',input:'a retained visible REST container cannot authorize filling its zero-sized input',parameter:'REST waits for the added parameter type before checking string bindings',palette:'REST waits for the newly expanded palette item before its single drag',animation:'REST does not start a drag from a hit-testable row inside its native tree animation',expander:'REST expands the moving connection tree with one stable locator click',confirm:'REST confirms one owned active-connection deactivation',foreign:'REST refuses a deactivation question belonging to another connection tree'};
Object.assign(cases,{placement_below:'REST finds a free visible drop when its preferred row is below the canvas',placement_scrolled:'REST places one connection inside a zoomed translated and scrolled canvas',placement_full:'REST refuses an unconfirmed crowded-canvas reveal without starting a drag'});
Object.assign(cases,{placement_native:'serialized REST capability reveals real free space using bounded native outline zoom',placement_crowded:'REST reveals bounded model space on a crowded canvas before its sole connection drag',placement_changed:'REST refuses a changed graph after connection placement navigation',placement_unknown:'REST retains uncertainty after an unconfirmed viewport gesture',placement_still_full:'REST bounds settled viewport passes and never drags onto a still crowded canvas',placement_late_changed:'REST rechecks the graph after waiting for its connection palette item',placement_hidden:'REST refuses a connection drop when navigation cannot reveal model space'});
for(const [stage,title]of Object.entries(cases))test(title,async()=>{
 const prefix='MF;TF-1',fields=prefix+';WizardModelConnectionForm;ConnectionWizard;';
 const item=prefix+';ModelForm;pnlConnections;headercontainer;text_Root>Текущий_модуль>Echo;TreeText';
 let urlPoints=0,tileReads=0,fills=0,visibleChecks=0,parameterReads=0,queryFills=0,palettePoints=0,added=false,label='REST-сервис',url='',paramName='param0',lastSelector='';
 let held=false,dragMoves=0,downCount=0,upCount=0,expanded=stage!=='expander',expansions=0;
 let opening=false,confirmations=0,responseType='application/json',responseFills=0,wizardCloses=0,referenceReads=0;
 let refreshes=0,paletteReads=0,navigationCalls=0,navigated=false,nativeScale=1,outline=false,zoomClicks=0;
 const placementGraph={complete:true,interaction_ready:true,document_id:'doc',nodes:[{ref:{node_id:'existing'},position:{x:64,y:1500},dom_epoch:1}],links:[]};
 const recoveryWorkflow={},recoveryTree={id:'palette',isConnected:true,getBoundingClientRect:()=>({width:270,height:597}),querySelector:()=>stage==='refresh_populated'?{}:null};
 const recoveryForm={contains:e=>e===recoveryTree};
 const recoveryDocument={querySelectorAll:selector=>selector==='[data-tid='+JSON.stringify(prefix+';ModelForm')+']'?[recoveryForm]:selector==='[data-tid='+JSON.stringify(prefix+';ModelForm;pnlConnections;tree')+']'?[recoveryTree]:[]};
 const recoveryPreparation={document:recoveryDocument,id:'doc'};
 class ModelForm{}
 const recoveryScope={document:recoveryDocument,__loginomDockPreparationV1:recoveryPreparation,
  bg:{app:{Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{Node:{data:{node:stage==='refresh_foreign'?{}:recoveryWorkflow}},FController:new ModelForm()}})}}}}}}},
  Ext:{getCmp:()=>({el:{dom:recoveryTree},getStore:()=>({getRoot:()=>({data:{loaded:true,expanded:true},childNodes:[{}]})}),refresh:()=>{refreshes++;}})}};
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
  click:async()=>{if(selector.includes('btnShowOutline')){outline=!outline;return;}if(selector.includes('bg-workflow-outline-toolbar')){nativeScale/=1.1;zoomClicks++;return;}assert.ok(selector.includes(';TreeExpander'));expanded=true;expansions++;},
  getAttribute:async()=> 'Уменьшить масштаб',waitFor:async()=>{},
  locator:child=>child==='input'?locator(selector,true):locator(selector+' '+child),
  // This is the observed Ext failure: its container claims visibility before
  // the actual input has a usable rectangle. Neither may cause a fill.
  isVisible:async()=>{visibleChecks++;if(selector.includes('bg-workflow-outline-toolbar'))return outline;if(stage.startsWith('refresh')&&selector==='[data-tid='+JSON.stringify(prefix+';ModelForm;pnlConnections;headercontainer;text_Root>Текущий_модуль;TreeText')+']')return refreshes>0&&++paletteReads>=3;return !(input&&selector.includes('pedURL')&&opening&&!confirmations);},
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
   if(stage==='placement_late_changed'&&navigated&&selector.includes(item))placementGraph.nodes[0].position.x++;
   if(selector.includes('cmpDiagram')){
    if(!stage.startsWith('placement_'))return {x:500,y:400};
    const box={x:300,y:100,right:850,bottom:400,width:550,height:300};
    const occupied=stage==='placement_native'?[{left:300,right:300+550*nativeScale,top:100,bottom:100+300*nativeScale,width:550*nativeScale,height:300*nativeScale}]:(stage==='placement_full'||stage==='placement_still_full'||['placement_crowded','placement_changed','placement_unknown','placement_hidden','placement_late_changed'].includes(stage)&&!navigated)?[{left:300,right:850,top:100,bottom:400,width:550,height:300}]:[];
    const element={scrollLeft:stage==='placement_scrolled'?180:0,scrollTop:stage==='placement_scrolled'?350:0,getBoundingClientRect:()=>box,querySelectorAll:()=>occupied.map(r=>({getBoundingClientRect:()=>r})),contains:()=>false};
    const graph={container:element,view:{scale:stage==='placement_native'?nativeScale:stage==='placement_scrolled'?0.75:1,translate:{x:-40,y:-20}}};
    const result=vm.runInNewContext('('+fn.toString()+')',{innerWidth:1280,innerHeight:800,document:{elementFromPoint:()=>element},bg:{app:{Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{FController:{FDiagram:{FmxGraph:graph}}}})}}}}}}}})(element,arg);
    if(result&&!Array.isArray(result)&&result.viewportWidth===undefined)assert.ok(result.x>=box.x+8&&result.x<box.right-8&&result.y>=box.y+8&&result.y<box.bottom-8);
    return result;
   }
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
  up:async()=>{held=false;upCount++;}},waitForTimeout:async()=>{if(stage==='refresh_populated')throw Error('fixture stopped while waiting for existing rows');},
  evaluate:async(fn,arg)=>{
   const code=fn.toString();if(code.includes('Prepared graph document changed'))return structuredClone(placementGraph);if(code.includes('FNodes.FCollection.map'))return [{id:'existing',y:stage.startsWith('placement_')?1500:100}];
   if(code.includes('connection palette owner changed'))return vm.runInNewContext('('+code+')',recoveryScope)(arg);
   if(code.includes('q.dialog.isConnected'))return nativeRead(fn,arg);
   if(code.includes('Unexpected graph additions')){assert.equal(dragMoves,1);assert.equal(downCount,1);assert.equal(upCount,1);if(['render_wait','wrongref'].includes(stage)){
    const graph={FNodes:{FCollection:[{FGuid:'existing'},{FGuid:'rest-reference',FPorts:[{FCollection:[{FCell:{}}]}]}]},FmxGraph:{view:{getState:()=>++referenceReads<3?null:{shape:{node:{getAttribute:()=>stage==='wrongref'?'node;Output_Table-0':'node;Output_Connection-0'}}}}}};
    return vm.runInNewContext('('+code+')',{bg:{app:{Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{FController:{FDiagram:graph}}})}}}}}}}})(arg);
   }return {node_id:'rest-reference'};}
   return true;
  },evaluateHandle:async(fn,arg)=>{
   if(stage.startsWith('refresh')&&fn.toString().includes('Prepared workflow is unavailable'))return {p:recoveryPreparation,workflow:recoveryWorkflow,dispose:async()=>{}};
   if(!['confirm','foreign'].includes(stage)||!fn.toString().includes('Connection list owner differs')&&!fn.toString().includes('Connection deactivation question differs'))return {dispose:async()=>{}};
   return Object.assign(nativeRead(fn,arg),{dispose:async()=>{}});
  }};
 try{
  const task={deadline:Date.now()+10000,document_id:'doc',origin:'http://example.test',build:'7.4.2',
   workflow_ref:{workflow_id:'flow',tab_tid:'tab',prefix,navigation_path:[{tid:'module'},{label:'Сценарий'}]},
   connection:{name:'Echo',base_url:'https://httpbin.org/anything',...(['mime','mime_stale'].includes(stage)?{response_content_type:'text/html'}:{})},query_parameters:[{name:'Key',field:'Key'}]};
  const result=stage==='placement_native'?await vm.runInNewContext('('+makeRestConnectionCode(task)+')',{get document(){return globalThis.document;},innerWidth:1280,innerHeight:800})(page):await restConnectionCapability(page,task,async()=>structuredClone(placementGraph),async args=>{
   navigationCalls++;assert.ok(args.position.x>=64&&args.position.y>=64&&args.position.x<=10000&&args.position.y<=10000);
   assert.equal(downCount,0);await args.guard();
   if(stage==='placement_full')throw Error('REST connection: no free visible connection position');
   if(stage==='placement_unknown'){const e=Error('Lost viewport reply');e.placement_navigation_unverified=true;throw e;}
   navigated=true;placementGraph.nodes[0].dom_epoch++;
   if(stage==='placement_changed')placementGraph.nodes[0].position.x++;
   await args.guard();return {fully_visible:stage!=='placement_hidden',zoom_steps:3,navigation_steps:[]};
  },nodePlacementViewport,nodePlacementPoint,nodePlacementOverflow,samePlacementGraph,{});
  assert.equal(result.verified,['animation','expander','confirm','mime','refresh','render_wait','placement_below','placement_scrolled','placement_crowded','placement_native'].includes(stage),result.error);
  if(['animation','expander','confirm','mime','refresh','render_wait','placement_below','placement_scrolled','placement_crowded','placement_native'].includes(stage)){assert.equal(result.connection.reference_node_id,'rest-reference');assert.equal(result.cleanup_complete,true);}
  else if(['placement_changed','placement_unknown','placement_hidden','placement_late_changed'].includes(stage)){
   assert.match(result.error,['placement_changed','placement_late_changed'].includes(stage)?/Graph changed/:stage==='placement_unknown'?/Lost viewport reply/:/not fully visible/);
   assert.equal(navigationCalls,1);assert.equal(downCount,0);assert.equal(upCount,0);assert.equal(result.effect_possible,true);
   assert.equal(result.cleanup_complete,stage==='placement_hidden');
   if(stage==='placement_hidden'){
    assert.deepEqual(result.pre_target_checkpoint.graph,placementGraph);
    assert.equal(result.pre_target_checkpoint.connection.name,'Echo');
    assert.equal(result.pre_target_checkpoint.connection.base_url,'https://httpbin.org/anything');
   }else assert.equal(result.pre_target_checkpoint,undefined);
   return;
  }
  else if(stage==='placement_still_full'){assert.match(result.error,/no free visible connection position after navigation/);assert.equal(navigationCalls,3);assert.equal(downCount,0);assert.equal(upCount,0);assert.equal(result.effect_possible,true);assert.equal(result.cleanup_complete,false);return;}
  else if(stage==='placement_full'){assert.match(result.error,/no free visible connection position/);assert.equal(downCount,0);assert.equal(upCount,0);return;}
  else if(stage==='wrongref'){assert.match(result.error,/New node is not a connection reference/);assert.equal(referenceReads,3);return;}
  else if(stage==='mime_stale'){assert.match(result.error,/saved connection readback differs/);assert.equal(responseFills,1);assert.equal(wizardCloses,1);return;}
  else if(stage==='refresh_foreign'){assert.match(result.error,/connection palette owner changed/);assert.equal(refreshes,0);assert.equal(downCount,0);return;}
  else if(stage==='refresh_populated'){assert.match(result.error,/fixture stopped while waiting for existing rows/);assert.equal(refreshes,0);assert.equal(downCount,0);return;}
  else if(stage==='foreign'){assert.match(result.error,/Pending connection wizard owner differs/);assert.equal(confirmations,0);return;}
  else assert.equal(result.error,stage==='input'?'fixture stopped after the sole reachable fill':stage==='parameter'?'fixture stopped after the typed parameter editor':'fixture stopped before the sole palette drag');
  if(stage==='placement_native'){assert.ok(zoomClicks>0&&zoomClicks<=12);assert.equal(outline,false);assert.equal(downCount,1);assert.equal(upCount,1);}
  if(stage==='placement_crowded'){assert.equal(navigationCalls,1);assert.equal(downCount,1);assert.equal(upCount,1);}
  if(stage==='render_wait')assert.equal(referenceReads,3);
  if(stage==='expander')assert.equal(expansions,1);
  assert.equal(fills,1);assert.equal(urlPoints,['palette','animation','expander','confirm','mime','refresh','render_wait','placement_below','placement_scrolled','placement_crowded','placement_native'].includes(stage)?6:4);assert.ok(visibleChecks>0);
  if(stage==='refresh'){assert.equal(refreshes,1);assert.equal(paletteReads,3);assert.equal(downCount,1);assert.equal(upCount,1);}
  if(stage==='confirm')assert.equal(confirmations,1);
  if(stage==='mime'){assert.equal(responseFills,1);assert.equal(wizardCloses,2);assert.equal(result.connection.response_content_type,'text/html');}
  if(!['mime','mime_stale'].includes(stage)){assert.equal(responseFills,0);assert.equal(Object.hasOwn(result.connection??{},'response_content_type'),false);}
  if(stage==='parameter'){assert.equal(parameterReads,2);assert.equal(queryFills,1);}
  if(['palette','animation','expander'].includes(stage)){assert.equal(palettePoints,2);assert.equal(queryFills,1);}
 }finally{
  for(const [key,value]of Object.entries(previous))if(value===undefined)delete globalThis[key];else globalThis[key]=value;
 }
});
