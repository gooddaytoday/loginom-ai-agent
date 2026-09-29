import {openJavascriptInitialWizard,requireJavascriptInitialOpeningCleanup} from './javascript-initial-opening.mjs';
import {javascriptExecutionIdentity} from './javascript-mismatch-probe.mjs';
import {withJavascriptWizardMasks} from './javascript-wizard-masks.mjs';
import {waitJavascriptWizardSettlement,inspectJavascriptWizardAddress,withJavascriptWizardAddress} from './javascript-wizard-settlement.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {observeJavascriptBrowserLifecycle} from './javascript-execution-evidence.mjs';
import {javascriptInputColumns,javascriptOutputColumns,javascriptInputRows,verifyJavascriptFixture,verifyJavascriptTable,javascriptSentinelOutcome,createJavascriptEffectJournal,verifyJavascriptInputMapping,javascriptInitialPages,compactJavascriptJournalRecord} from './javascript-execution-evidence.mjs';
import {javascriptInputRequest,waitJavascriptCleanupReady,selectJavascriptForSettings,javascriptWizardBinding,openJavascriptWizard,cleanupJavascriptWizardOpening,javascriptMappingUnlockReceipt,closeJavascriptPortMapping,inspectJavascriptExecutionNotifications,waitJavascriptExecutionNotifications,javascriptManualMappingRequest,configureJavascriptManualMapping} from './javascript-execution-runtime.mjs';
import {validateNodeApplyRequest} from '../../client/lib/node-apply.mjs';
import {createTextImportNodeSupport} from '../../client/lib/text-import-node.mjs';
import {createExecutionJournal} from '../../client/lib/execution-journal.mjs';
import {resolveConfiguredOutputMapping} from '../../client/lib/port-mapping-procedure.mjs';
import {NodeProcedureStepError} from '../../client/lib/node-procedure.mjs';
import {Element} from '../../client/test/support/workspace-ui-fixture.mjs';

function privateSelectionFixture(fault) {
  const node={id:'js-guid',tid:'MF;TF-1;Graph;JavaScript',allowed_actions:[]};
  const element=tid=>({isConnected:true,allowed_actions:[],getAttribute:k=>k==='data-tid'?tid:null,
    getBoundingClientRect:()=>({x:100,y:100,width:80,height:100}),closest(selector){return selector==='[data-tid]'?this:null;},contains(other){return other===this;}});
  const body=element(node.tid),setting=element(node.tid+';Setting');let shape=body,selected=['already','selected_no_setting'].includes(fault),clicks=0,disposed=0;
  const overlay=element(node.tid+';'+(fault?.startsWith('overlay_')?fault.slice(8):'Execute'));
  const icon={closest:selector=>selector==='[data-tid]'?body:null};
  body.contains=e=>e===body||e===overlay||e===icon;setting.contains=e=>e===setting||e===overlay;
  if(fault==='setting_overlay')selected=true;
  const native={FGuid:node.id,FIconCls:'js',FCell:{},data:{}};
  const diagram={FNodes:{FCollection:[native]},FmxGraph:{container:{contains:e=>e===shape||e===setting,
    querySelectorAll:()=>fault==='selected_no_setting'?[shape]:fault==='duplicate_after'&&selected?[shape,element(node.tid),setting]:selected?[shape,setting]:[shape]},getSelectionCells:()=>selected?[fault==='foreign_selected'?{}:native.FCell]:[],view:{getState:()=>({shape:{node:shape}})}}};
  const tab={Controller:{Node:{data:{node:{}}},FController:{FDiagram:diagram}}};
  const binding={tab,workflow:tab.Controller.Node.data.node,nodeData:native.data};
  const realm=vm.createContext({location:{origin:'http://logi-test-plan.bg.local'},innerWidth:1000,innerHeight:800,
    document:{querySelectorAll:()=>fault==='covered_after'&&selected?[{isConnected:true,getBoundingClientRect:()=>({width:20,height:20})}]:[],elementFromPoint:()=>fault==='cover'?{}:fault?.startsWith('overlay_')||fault==='setting_overlay'?overlay:selected?setting:fault==='icon'?icon:shape},getComputedStyle:()=>({visibility:'visible'}),
    bg:{app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>tab}}}}}}}});
  const invoke=(fn,arg)=>vm.runInContext('('+fn.toString()+')',realm)(arg);
  const page={evaluateHandle:async(fn,arg)=>Object.assign(invoke(fn,arg),{dispose:async()=>{disposed++;}}),evaluate:async(fn,arg)=>invoke(fn,arg),
    mouse:{click:async()=>{clicks++;if(fault==='lost'||fault==='lost_open'&&clicks===2)throw Error('lost click reply');selected=true;
      if(fault?.includes('replace')||['foreign_selected','duplicate_after','node_after','cell_after','covered_after'].includes(fault)){
        body.isConnected=fault==='replace_connected';shape=element(node.tid);
      }
      if(fault==='node_after')native.data={};if(fault==='cell_after')native.FCell={};if(fault==='controller_after')tab.Controller={...tab.Controller};
    }},
    waitForFunction:async(fn,arg,options)=>{assert.equal(typeof fn,'function');assert.ok(options.timeout>0&&options.timeout<=5000);
      assert.ok(invoke(fn,arg));if(['replace_twice','replace_thrice'].includes(fault)){shape.isConnected=false;shape=element(node.tid);}return {dispose:async()=>{}};}};
  const records=[];
  const record=async e=>{records.push(e);if(e.phase==='javascript_private_selection_dispatch'){
    if(fault==='node')native.data={};if(fault==='dom')shape=element(node.tid);if(fault==='journal')throw Error('journal failure');
  }else if(fault==='replace_thrice'&&e.phase==='javascript_private_selection_after'){
    shape.isConnected=false;shape=element(node.tid);
  }return e;};
  return {run:(deadline=Date.now()+5000,options={})=>selectJavascriptForSettings(page,{binding,node,icon:'js',deadline,record,...options}),node,records,page,binding,realm,record,tab,native,
    get clicks(){return clicks;},get disposed(){return disposed;}};
}
test('private JS selection works with observed generic deny and sends only one body gesture',async()=>{
  const f=privateSelectionFixture();assert.deepEqual(f.node.allowed_actions,[]);assert.equal((await f.run()).verified,true);assert.equal(f.clicks,1);
  assert.deepEqual(f.node.allowed_actions,[]);assert.equal(f.disposed,1);assert.equal(f.records.at(-1).ready,true);
  const ready=privateSelectionFixture('already');assert.equal((await ready.run()).selected,false);assert.equal(ready.clicks,0);
  const icon=privateSelectionFixture('icon');assert.equal((await icon.run()).verified,true);assert.equal(icon.clicks,1);
});
test('descendant Execute, Preview, ports or foreign Setting child never authorize body/Setting clicks',async()=>{
  for(const fault of ['overlay_Execute','overlay_Preview','overlay_Input_Data-0','overlay_Setting','setting_overlay']){
    const f=privateSelectionFixture(fault);await assert.rejects(f.run(),/covered/);assert.equal(f.clicks,0);assert.equal(f.disposed,1);
  }
});
test('private selection refuses changed node/DOM, cover, journal failure and deadline before click',async()=>{
  for(const fault of ['node','dom','cover','journal']){const f=privateSelectionFixture(fault);await assert.rejects(f.run());assert.equal(f.clicks,0);assert.equal(f.disposed,1);}
  const f=privateSelectionFixture();await assert.rejects(f.run(Date.now()-1),/deadline/);assert.equal(f.clicks,0);
});
test('private selection keeps a lost click ambiguous without replay',async()=>{
  const f=privateSelectionFixture('lost');await assert.rejects(f.run(),/lost click/);assert.equal(f.clicks,1);
  assert.equal(f.records.at(-1).phase,'javascript_private_selection_refused');assert.equal(f.records.at(-1).effect_possible,true);
});

test('selection admits two detached DOM redraws only after the returned gesture on the same selected cell',async()=>{
  const f=privateSelectionFixture('replace');const result=await f.run();
  assert.equal(result.dom_replacements,1);assert.equal(f.clicks,1);assert.equal(f.records.at(-1).node_selected,true);
  const twice=privateSelectionFixture('replace_twice');const twiceResult=await twice.run(undefined,{openSettings:true});
  assert.equal(twiceResult.dom_replacements,2);assert.equal(twiceResult.opening_dispatched,true);assert.equal(twice.clicks,2);
  for(const fault of ['replace_connected','foreign_selected','duplicate_after','node_after','cell_after','controller_after','covered_after']){
    const rejected=privateSelectionFixture(fault);await assert.rejects(rejected.run());assert.equal(rejected.clicks,1);
    assert.equal(rejected.records.at(-1).effect_possible,true);
  }
  const third=privateSelectionFixture('replace_thrice');await assert.rejects(third.run(undefined,{openSettings:true}),/Private selection DOM changed/);
  assert.equal(third.clicks,1);assert.equal(third.records.at(-1).opening_dispatched,false);
});

test('private Setting opening has one journaled click after selection and refuses a changed owner before dispatch',async()=>{
  const f=privateSelectionFixture('replace');const result=await f.run(undefined,{openSettings:true});
  assert.equal(result.opening_dispatched,true);assert.equal(f.clicks,2);
  assert.equal(f.records.filter(e=>e.phase==='javascript_private_open_dispatch').length,1);
  const changed=privateSelectionFixture();await assert.rejects(changed.run(undefined,{openSettings:true,beforeOpen:async()=>{changed.native.data={};}}));
  assert.equal(changed.clicks,1);assert.equal(changed.records.at(-1).opening_dispatched,false);
});

test('private execution preparation only selects the native cell and never clicks Setting or Execute',async()=>{
  const already=privateSelectionFixture('selected_no_setting');const result=await already.run(undefined,{requireSettings:false});
  assert.equal(result.verified,true);assert.equal(already.clicks,0);
  const select=privateSelectionFixture('replace');assert.equal((await select.run(undefined,{requireSettings:false})).verified,true);
  assert.equal(select.clicks,1);assert.equal(select.records.some(e=>e.phase==='javascript_private_open_dispatch'),false);
  const lost=privateSelectionFixture('lost_open');await assert.rejects(lost.run(undefined,{openSettings:true}),/lost click/);
  assert.equal(lost.clicks,2);assert.equal(lost.records.at(-1).opening_dispatched,true);assert.equal(lost.records.at(-1).effect_possible,true);
});

// Run the production closure in a separate realm and serialize evaluate results.
function selectionBlockerFixture({phase='pre_select_click',selector='.x-mask',count=1,clear=true,fault,diagnostic,ack}={}) {
  const f=privateSelectionFixture(fault),reads=[],waits=[];
  const graph=f.tab.Controller.FController.FDiagram.FmxGraph.container;
  const blockers=Array.from({length:count},(_,index)=>({isConnected:true,id:'foreign-'+index,parentElement:{getAttribute:()=> 'foreign-parent'},
    getAttribute:key=>({role:selector==='[role="dialog"]'?'dialog':null,'data-tid':'foreign-'+index,class:selector.slice(1)})[key]??null,
    matches:query=>query===selector,contains:()=>false,getBoundingClientRect:()=>({x:10,y:20,width:30,height:40}),
    get innerText(){throw Error('secret text must not be read');},get innerHTML(){throw Error('secret HTML must not be read');}}));
  if(diagnostic==='geometry')blockers[0].getBoundingClientRect=()=>({x:Infinity,y:NaN,width:30,height:40});
  if(diagnostic==='descriptor')blockers[0].getAttribute=()=>{throw Error('secret diagnostic error');};
  if(diagnostic==='visibility')blockers[0].getBoundingClientRect=()=>{throw Error('secret visibility error');};
  if(diagnostic==='long'){
    blockers[0].id='i'.repeat(400);blockers[0].getAttribute=()=> 'v'.repeat(400);
    blockers[0].parentElement.getAttribute=()=> 'p'.repeat(400);
  }
  if(diagnostic==='contained')graph.contains=()=>true;
  const query=f.realm.document.querySelectorAll,evaluate=f.page.evaluate,wait=f.page.waitForFunction;
  const enter=arg=>{
    if(arg?.inspectPhase)reads.push(arg.inspectPhase);
    if(arg?.inspectPhase===phase)f.realm.document.querySelectorAll=()=>blockers;
  };
  const leave=arg=>{if(arg?.inspectPhase===phase&&clear)f.realm.document.querySelectorAll=query;};
  f.page.evaluate=async(fn,arg)=>{enter(arg);try{return structuredClone(await evaluate(fn,arg));}finally{leave(arg);}};
  f.page.waitForFunction=async(fn,arg,options)=>{waits.push(options);enter(arg);try{return await wait(fn,arg,options);}finally{leave(arg);}};
  const record=async event=>{
    await f.record(event);
    if(event.phase==='javascript_private_selection_blocked'){
      assert.ok(Object.isFrozen(event));assert.ok(Object.isFrozen(event.snapshot));assert.ok(Object.isFrozen(event.snapshot.blockers));
      if(event.snapshot.blockers.length){assert.ok(Object.isFrozen(event.snapshot.blockers[0]));assert.ok(Object.isFrozen(event.snapshot.blockers[0].box));}
      if(ack==='throw')throw Error('journal unavailable');
      if(ack==='missing')return undefined;
      if(ack==='wrong')return {...event,snapshot:{...event.snapshot,blocker_count:0}};
      if(ack==='phase')return {...event,phase:'wrong'};
      if(ack==='mutate')event.snapshot.blocker_count=0;
      if(ack==='owner')f.native.data={};
    }
    return structuredClone({...event,recorded_at:'test journal metadata'});
  };
  return {f,reads,waits,blockers,record,run:(options={})=>selectJavascriptForSettings(f.page,{binding:f.binding,node:f.node,icon:'js',deadline:Date.now()+5000,record,...options})};
}

for(const selector of ['[role="dialog"]','.x-mask','.bg-mask-message','.x-mask-msg'])test('selection captures the actual pre-click blocker: '+selector,async()=>{
  const h=selectionBlockerFixture({selector});await assert.rejects(h.run(),/Private selection blocked/);
  assert.equal(h.f.clicks,0);assert.equal(h.f.disposed,1);assert.equal(h.waits.length,0);
  const receipt=h.f.records.find(e=>e.phase==='javascript_private_selection_blocked'),snapshot=receipt.snapshot;
  assert.equal(snapshot.inspect_phase,'pre_select_click');assert.equal(snapshot.blocker_count,1);
  assert.equal(snapshot.native_owner_verified,true);assert.equal(snapshot.held_dom_verified,true);assert.equal(snapshot.diagnostic_failed,false);
  assert.deepEqual(snapshot.blockers[0].selectors,[selector]);assert.equal(snapshot.blockers[0].tid,'foreign-0');
  assert.equal(snapshot.blockers[0].graph_contains_blocker,false);assert.equal(snapshot.blockers[0].blocker_contains_graph,false);
  assert.equal(receipt.effect_possible,false);assert.equal(receipt.opening_dispatched,false);
  const refused=h.f.records.at(-1);assert.equal(refused.blocker_snapshot,snapshot);
  assert.equal(refused.terminal_observation.blocked,undefined);assert.equal(refused.terminal_observation.native_selection_count,0);
  assert.equal(Object.hasOwn(refused,'owner_verified'),false);assert.equal(JSON.stringify(receipt).includes('secret'),false);
});

for(const phase of ['initial','pre_select_click','post_select_poll','final','pre_open','pre_open_click'])test('selection blocker refuses without replay in inspect phase '+phase,async()=>{
  const h=selectionBlockerFixture({phase});await assert.rejects(h.run({openSettings:true}),/Private selection blocked/);
  const clicked=['initial','pre_select_click'].includes(phase)?0:1;
  assert.equal(h.f.clicks,clicked);assert.equal(h.f.disposed,1);
  const event=h.f.records.find(e=>e.phase==='javascript_private_selection_blocked');
  assert.equal(event.snapshot.inspect_phase,phase);assert.equal(event.effect_possible,clicked===1);assert.equal(event.opening_dispatched,false);
  assert.equal(h.f.records.some(e=>e.phase==='javascript_private_open_gesture_returned'),false);
  assert.equal(h.reads.filter(p=>p===phase).length,1);
  if(phase==='post_select_poll')assert.equal(h.waits.length,1,'original wait throws without retry or truthy readiness');
});

test('terminal blocker remains separate from the original failure',async()=>{
  const h=selectionBlockerFixture({phase:'terminal',fault:'journal'});await assert.rejects(h.run(),/journal failure/);
  assert.equal(h.f.clicks,0);assert.equal(h.f.records.some(e=>e.phase==='javascript_private_selection_blocked'),false);
  const refused=h.f.records.at(-1);assert.equal(refused.blocker_snapshot,null);
  assert.equal(refused.terminal_observation.blocked,true);assert.equal(refused.terminal_observation.inspect_phase,'terminal');
});

test('terminal observation failure cannot erase the snapshot or claim owner mismatch',async()=>{
  const h=selectionBlockerFixture({ack:'owner'});await assert.rejects(h.run(),/Private selection blocked/);
  const refused=h.f.records.at(-1);assert.equal(refused.blocker_snapshot.inspect_phase,'pre_select_click');
  assert.deepEqual(refused.terminal_observation,{observation_status:'unavailable'});assert.equal(Object.hasOwn(refused,'owner_verified'),false);
});

test('bounded blocker descriptors never allow unknown or contained overlays',async()=>{
  for(const options of [{count:17},{diagnostic:'long'},{diagnostic:'contained'}]){
    const h=selectionBlockerFixture(options);await assert.rejects(h.run(),/Private selection blocked/);assert.equal(h.f.clicks,0);
    const s=h.f.records.find(e=>e.phase==='javascript_private_selection_blocked').snapshot;
    assert.equal(s.blocker_count,options.count??1);assert.equal(s.blockers.length,Math.min(options.count??1,12));
    assert.equal(s.descriptors_truncated,options.count>12);assert.equal(s.ready,false);
    if(options.diagnostic==='long')for(const k of ['id','tid','role','classes','parent_tid'])assert.equal(s.blockers[0][k].length,200);
    if(options.diagnostic==='contained')assert.equal(s.blockers[0].graph_contains_blocker,true);
  }
});

for(const diagnostic of ['geometry','descriptor','visibility'])test('selection diagnostic failure remains fail-closed: '+diagnostic,async()=>{
  const h=selectionBlockerFixture({diagnostic});await assert.rejects(h.run(),/Private selection blocked/);assert.equal(h.f.clicks,0);
  const s=h.f.records.find(e=>e.phase==='javascript_private_selection_blocked').snapshot;
  assert.equal(s.diagnostic_failed,true);assert.equal(s.blockers.length,0);assert.equal(s.ready,false);
  assert.equal(s.blocker_count,diagnostic==='visibility'?null:1);assert.equal(JSON.stringify(s).includes('secret'),false);
});

for(const ack of ['throw','missing','wrong','phase','mutate'])test('selection blocker requires immutable exact journal ACK: '+ack,async()=>{
  const h=selectionBlockerFixture({ack});await assert.rejects(h.run(),ack==='throw'?/journal unavailable/:ack==='mutate'?/read only/:/journal ACK differs/);
  assert.equal(h.f.clicks,0);assert.equal(h.f.disposed,1);assert.equal(h.waits.length,0);
  assert.equal(h.f.records.filter(e=>e.phase==='javascript_private_selection_blocked').length,1);
  assert.equal(h.f.records.find(e=>e.phase==='javascript_private_selection_blocked').snapshot.blocker_count,1);
});

test('selection preserves expired original deadline without a new wait or click',async()=>{
  const h=selectionBlockerFixture({phase:'initial'}),deadline=Date.now()-1;await assert.rejects(h.run({deadline}),/Private selection blocked/);
  assert.equal(h.f.records.find(e=>e.phase==='javascript_private_selection_blocked').snapshot.deadline,deadline);
  assert.equal(h.waits.length,0);assert.equal(h.f.clicks,0);
});


test('unchanged visibility predicate ignores only disconnected, zero-sized or hidden blockers',async()=>{
  for(const kind of ['disconnected','zero','hidden']){
    const h=selectionBlockerFixture({phase:'initial'});
    if(kind==='disconnected')h.blockers[0].isConnected=false;
    if(kind==='zero')h.blockers[0].getBoundingClientRect=()=>({x:0,y:0,width:0,height:40});
    if(kind==='hidden')h.f.realm.getComputedStyle=e=>({visibility:e===h.blockers[0]?'hidden':'visible'});
    assert.equal((await h.run()).verified,true);assert.equal(h.f.clicks,1);
    assert.equal(h.f.records.some(e=>e.phase==='javascript_private_selection_blocked'),false);
  }
});

test('a persistent terminal blocker cannot replace the original inspect phase',async()=>{
  const h=selectionBlockerFixture({clear:false});await assert.rejects(h.run(),/Private selection blocked/);
  const refused=h.f.records.at(-1);
  assert.equal(refused.blocker_snapshot.inspect_phase,'pre_select_click');assert.equal(refused.terminal_observation.inspect_phase,'terminal');
  assert.equal(refused.blocker_snapshot.blocker_count,1);assert.equal(h.f.clicks,0);
});

test('private wizard wrapper forwards the actual blocker journal ACK',async()=>{
  for(const ack of [undefined,'wrong']){
    const h=selectionBlockerFixture({phase:'initial',ack}),lifecycle={};
    await assert.rejects(openJavascriptWizard(h.f.page,{binding:h.f.binding,node:h.f.node,icon:'js',deadline:Date.now()+5000,
      record:h.record,lifecycle}),ack?/journal ACK differs/:/Private selection blocked/);
    assert.equal(h.f.clicks,0);assert.equal(lifecycle.openingDispatched,undefined);
    assert.equal(h.f.records.filter(e=>e.phase==='javascript_private_selection_blocked').length,1);
  }
});


test('already returned blocker snapshot survives a later transport failure',async()=>{
  const h=selectionBlockerFixture(),evaluate=h.f.page.evaluate;
  h.f.page.evaluate=async(fn,arg)=>{
    if(h.reads.includes('pre_select_click'))throw Error('later transport failure');
    return evaluate(fn,arg);
  };
  await assert.rejects(h.run(),/Private selection blocked/);assert.equal(h.f.clicks,0);
  const refused=h.f.records.at(-1);assert.equal(refused.blocker_snapshot.blocker_count,1);
  assert.equal(refused.snapshot_observation_available,true);assert.equal(refused.terminal_observation.observation_status,'unavailable');
});

test('lost gesture and unavailable diagnostic transport preserve uncertainty without replay',async()=>{
  const h=selectionBlockerFixture({phase:'unused',fault:'lost'}),evaluate=h.f.page.evaluate;
  h.f.page.evaluate=async(fn,arg)=>{if(h.f.clicks)throw Error('transport unavailable');return evaluate(fn,arg);};
  await assert.rejects(h.run(),/lost click/);assert.equal(h.f.clicks,1);
  const refused=h.f.records.at(-1);assert.equal(refused.effect_possible,true);assert.equal(refused.blocker_snapshot,null);
  assert.equal(refused.snapshot_observation_available,false);assert.equal(refused.terminal_observation.observation_status,'unavailable');
});

test('post-gesture blocked snapshot with invalid journal ACK cannot replay or open Setting',async()=>{
  const h=selectionBlockerFixture({phase:'post_select_poll',ack:'wrong'});
  await assert.rejects(h.run({openSettings:true}),/journal ACK differs/);assert.equal(h.f.clicks,1);
  const receipt=h.f.records.at(-1);assert.equal(receipt.phase,'javascript_private_selection_blocked');
  assert.equal(receipt.effect_possible,true);assert.equal(receipt.opening_dispatched,false);assert.equal(h.waits.length,1);
});

test('blocker snapshot passes the production fsync journal and exact ACK validation',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'js-selection-journal-'));
  try {
    const h=selectionBlockerFixture(),record=createExecutionJournal({directory,metadata:{sessionId:'test',clientRevision:'source76'}});
    await assert.rejects(h.run({record}),/Private selection blocked/);assert.equal(h.f.clicks,0);
    const events=(await readFile(join(directory,'execution-events.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));
    const blocked=events.find(e=>e.phase==='javascript_private_selection_blocked'),refused=events.at(-1);
    assert.equal(blocked.snapshot.inspect_phase,'pre_select_click');assert.equal(blocked.snapshot.blockers[0].tid,'foreign-0');
    assert.deepEqual(refused.blocker_snapshot,blocked.snapshot);assert.equal(refused.terminal_observation.blocked,undefined);
  }finally{await rm(directory,{recursive:true,force:true});}
});


function initialOpeningFixture({phase='pre_open_click',cover,ack,saveFailure,visibleFailure,fault='replace'}={}) {
  const f=privateSelectionFixture(fault),lifecycle={},report={effects:[]},steps=[],waits=[];
  const graph=f.tab.Controller.FController.FDiagram.FmxGraph.container;
  const originalPoint=f.realm.document.elementFromPoint,originalQuery=graph.querySelectorAll,evaluate=f.page.evaluate;
  const foreign={isConnected:true,tagName:'BUTTON',getAttribute:key=>({'data-tid':'foreign','class':'foreign-class',role:'button'})[key]??null,
    closest:()=>foreign,contains:()=>false};
  f.page.evaluate=async(fn,arg)=>{
    if(arg?.inspectPhase===phase&&cover){
      const setting=originalQuery().find(e=>e.getAttribute('data-tid')===f.node.tid+';Setting');
      if(cover==='absent')graph.querySelectorAll=()=>originalQuery().filter(e=>e!==setting);
      if(cover==='disabled'){
        const attr=setting.getAttribute;setting.getAttribute=key=>key==='aria-disabled'?'true':attr(key);
      }
      if(cover==='geometry')setting.getBoundingClientRect=()=>({x:NaN,y:0,width:80,height:100});
      if(cover==='overflow')setting.getBoundingClientRect=()=>({x:Number.MAX_VALUE,y:0,width:Number.MAX_VALUE,height:100});
      if(cover==='child'){
        foreign.closest=selector=>selector==='[data-tid]'?setting:foreign;
        setting.contains=e=>e===setting||e===foreign;
      }
      if(cover==='diagnostic')foreign.getAttribute=()=>{throw Error('sensitive hit diagnostic');};
      if(cover==='long')foreign.getAttribute=()=> 'a'.repeat(450);
      if(cover==='null')f.realm.document.elementFromPoint=()=>null;
      if(['foreign','child','diagnostic','long'].includes(cover))f.realm.document.elementFromPoint=()=>foreign;
      if(cover==='owner')f.native.data={};
      if(cover==='dom')f.tab.Controller.FController.FDiagram.FmxGraph.view.getState=()=>({shape:{node:{}}});
    }
    const result=await evaluate(fn,arg);
    if(arg?.inspectPhase===phase){f.realm.document.elementFromPoint=originalPoint;graph.querySelectorAll=originalQuery;}
    return structuredClone(result);
  };
  const wait=f.page.waitForFunction;
  f.page.waitForFunction=async(fn,arg,options)=>{
    if(arg?.inspectPhase===phase&&cover){
      assert.ok(options.timeout>0&&options.timeout<=5000);
      if(!await f.page.evaluate(fn,arg))throw Error('Bounded selection readiness pending');
      return {dispose:async()=>{}};
    }
    return wait(fn,arg,options);
  };
  const record=async event=>{
    await f.record(event);steps.push(event.phase);
    if(event.phase==='javascript_private_selection_point_unavailable'){
      assert.ok(Object.isFrozen(event.snapshot));assert.ok(Object.isFrozen(event.snapshot.samples));
      if(ack==='point-throw')throw Error('point journal failed');
      if(ack==='point-wrong')return {...event,snapshot:{...event.snapshot,control_count:99}};
    }
    if(event.phase==='javascript_private_open_dispatch'){
      if(ack==='open-throw')throw Error('open journal failed');
      if(ack==='open-wrong')return {...event,point:{x:0,y:0}};
    }
    if(event.phase==='javascript_private_selection_dispatch'&&ack==='body-wrong')return {};
    return structuredClone(event);
  };
  const guard=async()=>steps.push('guard'),save=async()=>{steps.push('save');if(saveFailure&&lifecycle.openingIntent)throw Error('report save failed');};
  const waitVisible=async deadline=>{waits.push(deadline);steps.push('visible');if(visibleFailure)throw Error('visible timeout');};
  const options=()=>({page:f.page,binding:f.binding,node:f.node,icon:'js',deadline:Date.now()+5000,record,guard,report,save,waitVisible,lifecycle});
  return {f,lifecycle,report,steps,waits,record,options,run:()=>openJavascriptInitialWizard(options())};
}

test('production initial opening uses one body and one Setting gesture with distinct lifecycle and ACK',async()=>{
  const h=initialOpeningFixture();await h.run();assert.equal(h.f.clicks,2);
  assert.equal(h.lifecycle.openingIntent,true);assert.equal(h.lifecycle.settingDispatched,true);
  assert.equal(h.lifecycle.settingGestureReturned,true);assert.equal(h.lifecycle.wizardVisible,true);
  assert.equal(h.report.effects.filter(e=>e.action==='open-wizard').length,1);
  assert.equal(h.report.initial_opening,h.lifecycle);assert.equal(h.report.wizard_hit.setting_tid,h.f.node.tid+';Setting');
  assert.ok(h.steps.indexOf('guard')<h.steps.indexOf('javascript_private_open_dispatch'));
  assert.ok(h.steps.indexOf('javascript_private_open_dispatch')<h.steps.indexOf('javascript_private_open_gesture_returned'));
  assert.equal(h.waits[0],h.lifecycle.deadline);requireJavascriptInitialOpeningCleanup(h.lifecycle);
  await assert.rejects(h.run(),/no replay/);assert.equal(h.f.clicks,2);
});

for(const mode of ['lost','visible'])test('initial Setting uncertainty refuses cleanup and replay: '+mode,async()=>{
  const h=initialOpeningFixture(mode==='lost'?{fault:'lost_open'}:{visibleFailure:true});
  await assert.rejects(h.run(),mode==='lost'?/lost click/:/visible timeout/);assert.equal(h.f.clicks,2);
  assert.equal(h.lifecycle.settingDispatched,true);assert.equal(h.lifecycle.wizardVisible,false);
  assert.equal(h.lifecycle.settingGestureReturned,mode==='lost'?false:true);
  assert.throws(()=>requireJavascriptInitialOpeningCleanup(h.lifecycle),/cleanup unconfirmed/);
  await assert.rejects(h.run(),/no replay/);assert.equal(h.f.clicks,2);
});

for(const ack of ['body-wrong','open-wrong','open-throw'])test('initial journal ACK failure cannot dispatch Setting: '+ack,async()=>{
  const h=initialOpeningFixture({ack});await assert.rejects(h.run(),/journal/);
  assert.equal(h.f.clicks,ack==='body-wrong'?0:1);assert.equal(h.lifecycle.settingDispatched,false);
  requireJavascriptInitialOpeningCleanup(h.lifecycle);assert.equal(h.waits.length,0);
});

test('initial report save failure after intent remains no Setting effect',async()=>{
  const h=initialOpeningFixture({saveFailure:true});await assert.rejects(h.run(),/report save failed/);
  assert.equal(h.lifecycle.openingIntent,true);assert.equal(h.lifecycle.settingDispatched,false);assert.equal(h.f.clicks,1);
  requireJavascriptInitialOpeningCleanup(h.lifecycle);
});

for(const cover of ['foreign','child','null','disabled','absent','geometry','overflow','diagnostic','long'])test('same-inspect Setting hit evidence refuses '+cover,async()=>{
  const h=initialOpeningFixture({cover});await assert.rejects(h.run());assert.equal(h.f.clicks,1);assert.equal(h.waits.length,0);
  assert.equal(h.lifecycle.settingDispatched,false);requireJavascriptInitialOpeningCleanup(h.lifecycle);
  const e=h.f.records.find(e=>e.phase==='javascript_private_selection_point_unavailable'),s=e.snapshot;
  assert.equal(s.inspect_phase,'pre_open_click');assert.equal(s.control,'Setting');assert.equal(s.native_owner_verified,true);
  assert.equal(s.diagnostic_failed,['geometry','overflow','diagnostic'].includes(cover));
  if(['foreign','child','null','disabled','long'].includes(cover))assert.equal(s.samples.length,9);
  if(cover==='absent'){assert.equal(s.control_count,0);assert.equal(s.samples.length,0);assert.equal(s.box,null);}
  if(cover==='foreign')assert.equal(s.samples[0].hit.tid,'foreign');
  if(cover==='child'){assert.equal(s.samples[0].hit_owned,true);assert.equal(s.samples[0].target_exact,true);assert.equal(s.samples[0].control_allowed,false);}
  if(cover==='null')assert.equal(s.samples[0].hit,null);
  if(cover==='long')assert.equal(s.samples[0].hit.tid.length,200);
  assert.equal(JSON.stringify(s).includes('sensitive'),false);
  assert.equal(h.f.records.at(-1).point_snapshot,s);
});

for(const ack of ['point-wrong','point-throw'])test('failed point journal ACK cannot open or retry: '+ack,async()=>{
  const h=initialOpeningFixture({cover:'foreign',ack});await assert.rejects(h.run(),/point journal/);
  assert.equal(h.f.clicks,1);assert.equal(h.f.records.filter(e=>e.phase==='javascript_private_selection_point_unavailable').length,1);
  assert.equal(h.lifecycle.settingDispatched,false);
});

for(const cover of ['owner','dom'])test('initial pre-Setting '+cover+' drift remains refused',async()=>{
  const h=initialOpeningFixture({cover});await assert.rejects(h.run(),/owner changed|DOM changed/);
  assert.equal(h.f.clicks,1);assert.equal(h.lifecycle.settingDispatched,false);
});

test('initial wrapper preserves source76 blocker rejection between phases',async()=>{
  const h=selectionBlockerFixture({phase:'pre_open_click'}),lifecycle={};
  await assert.rejects(openJavascriptInitialWizard({page:h.f.page,binding:h.f.binding,node:h.f.node,icon:'js',deadline:Date.now()+5000,
    record:h.record,guard:async()=>{},report:{effects:[]},save:async()=>{},waitVisible:async()=>assert.fail('no visible wait'),lifecycle}),/Private selection blocked/);
  assert.equal(h.f.clicks,1);assert.equal(lifecycle.openingIntent,true);assert.equal(lifecycle.settingDispatched,false);
  requireJavascriptInitialOpeningCleanup(lifecycle);
});


for(const phase of ['initial','pre_select_click','post_select_poll','final','pre_open','pre_open_click'])test('first hit failure is retained in phase '+phase,async()=>{
  const h=initialOpeningFixture({phase,cover:'foreign'});await assert.rejects(h.run());
  assert.equal(h.f.clicks,['initial','pre_select_click'].includes(phase)?0:1);
  const receipt=h.f.records.find(e=>e.phase==='javascript_private_selection_point_unavailable');
  assert.equal(receipt.snapshot.inspect_phase,phase);assert.equal(receipt.snapshot.samples.length,9);
  assert.equal(h.lifecycle.settingDispatched,false);
});

test('existing post-body poll preserves first unavailable sample even after a later ready sample',async()=>{
  const h=initialOpeningFixture(),doc=h.f.realm.document,hit=doc.elementFromPoint;
  let polls=0,pointAcknowledged=false;
  const record=h.record,click=h.f.page.mouse.click;
  h.f.page.waitForFunction=async(fn,arg,options)=>{
    assert.ok(options.timeout>0&&options.timeout<=5000);polls++;
    doc.elementFromPoint=()=>null;
    const invoke=()=>vm.runInContext('('+fn.toString()+')',h.f.realm)(arg);
    assert.equal(invoke(),false);
    doc.elementFromPoint=hit;assert.equal(invoke().ready,true);
    return {dispose:async()=>{}};
  };
  h.f.page.mouse.click=async(...args)=>{if(h.f.clicks===1)assert.equal(pointAcknowledged,true);return click(...args);};
  await openJavascriptInitialWizard({...h.options(),record:async event=>{
    const saved=await record(event);if(event.phase==='javascript_private_selection_point_unavailable')pointAcknowledged=true;return saved;
  }});
  assert.equal(polls,1);assert.equal(h.f.clicks,2);
  const snapshot=h.f.records.find(e=>e.phase==='javascript_private_selection_point_unavailable').snapshot;
  assert.equal(snapshot.inspect_phase,'post_select_poll');assert.equal(snapshot.samples.length,9);assert.equal(snapshot.samples[0].hit,null);
  assert.equal(h.lifecycle.wizardVisible,true);
});

test('live initial branch uses the production wrapper only for executionCase and retains discovery path',async()=>{
  const source=await readFile(new URL('./javascript-live.mjs',import.meta.url),'utf8');
  const start=source.indexOf('    if(executionCase){\n      await openJavascriptInitialWizard');
  const end=source.indexOf("    report.stage='wizard-ready';",start);assert.ok(start>0&&end>start);
  const run=vm.runInNewContext('(async function(ctx){with(ctx){'+source.slice(start,end)+';return openedWizard;}})');
  for(const executionCase of [true,false]){
    const h=initialOpeningFixture({fault:executionCase?'replace':'already'}),o=h.options();
    const opened=await run({executionCase,openJavascriptInitialWizard,page:o.page,wizardBinding:o.binding,node:o.node,expectedIcon:o.icon,
      wizardDeadline:o.deadline,executionRecord:o.record,guard:o.guard,report:o.report,save:o.save,initialOpening:o.lifecycle,
      owner:{prefix:'MF;TF-1'},openedWizard:false,exact:()=>({waitFor:async options=>{assert.equal(options.state,'visible');assert.ok(options.timeout>0);}})});
    assert.equal(opened,true);assert.equal(h.f.clicks,executionCase?2:1);
    assert.equal(h.lifecycle.attempted,executionCase?true:undefined);assert.equal(h.report.effects.length,1);
  }
});

test('live cleanup guard rejects uncertain initial dispatch before restoration or Close',async()=>{
  const source=await readFile(new URL('./javascript-live.mjs',import.meta.url),'utf8');
  const start=source.indexOf('      requireJavascriptInitialOpeningCleanup(initialOpening);');
  const end=source.indexOf('      if (openedWizard) {',start);assert.ok(start>0&&end>start);
  const cleanup=vm.runInNewContext('(async function(ctx){with(ctx){'+source.slice(start,end)+';if(openedWizard)await closeWizardOnce();}})');
  const h=initialOpeningFixture({fault:'lost_open'});await assert.rejects(h.run(),/lost click/);
  const actions=[];
  await assert.rejects(cleanup({requireJavascriptInitialOpeningCleanup,initialOpening:h.lifecycle,openedWizard:false,owner:{prefix:'own'},
    executionRuntime:{restoreWorkflowForCleanup:async()=>actions.push('restore')},observe:async()=>{actions.push('observe');return {prefix:'foreign'};},
    report:{cleanup:{}},guard:async()=>actions.push('guard'),closeWizardOnce:async()=>actions.push('close')}),/cleanup unconfirmed/);
  assert.deepEqual(actions,[]);assert.equal(h.f.clicks,2);
});

test('point snapshot passes the actual fsync journal ACK without text/HTML data',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'js-point-journal-'));
  try{
    const h=initialOpeningFixture({cover:'foreign'}),record=createExecutionJournal({directory,metadata:{sessionId:'test',clientRevision:'source77'}});
    await assert.rejects(openJavascriptInitialWizard({...h.options(),record}));assert.equal(h.f.clicks,1);
    const events=(await readFile(join(directory,'execution-events.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));
    const point=events.find(e=>e.phase==='javascript_private_selection_point_unavailable');assert.equal(point.snapshot.samples.length,9);
    assert.deepEqual(events.at(-1).point_snapshot,point.snapshot);assert.equal(events.at(-1).terminal_observation.ready,true);
  }finally{await rm(directory,{recursive:true,force:true});}
});


test('an optional point diagnostic failure cannot silently allow an otherwise ready Setting',async()=>{
  const h=initialOpeningFixture(),evaluate=h.f.page.evaluate;
  h.f.page.evaluate=async(fn,arg)=>{
    if(arg?.inspectPhase==='pre_open_click'){
      const point=h.f.realm.document.elementFromPoint;let calls=0;
      h.f.realm.document.elementFromPoint=(...args)=>++calls===1?point(...args):{};
    }
    return evaluate(fn,arg);
  };
  await assert.rejects(h.run(),/point diagnostic failed/);assert.equal(h.f.clicks,1);
  const s=h.f.records.find(e=>e.phase==='javascript_private_selection_point_unavailable').snapshot;
  assert.equal(s.control,'body');assert.equal(s.diagnostic_failed,true);assert.equal(h.lifecycle.settingDispatched,false);
});

function privateWizardFixture({deactivate=false,foreign=false,wrongNative=false,fault,maskFault}={}) {
  const f=privateSelectionFixture(fault==='lostSetting'?'lost_open':'replace');
  const reference={document_id:'doc',workflow_id:'workflow',node_id:f.node.id};
  const path=[{tid:'nav',label:'Workflow'}];
  const prepared={document_id:'doc',node:reference,workflow_ref:{workflow_id:'workflow',prefix:'MF;TF-1',tab_tid:'tab',navigation_path:path}};
  const graph={loginom_build:'7.4.2',prepared_node_context:{...reference,verified:true,surface:'graph',tid:f.node.tid,locked:false},wizard:{status:'absent'},
    ui:{dialogs:[],masks:[],elements:[{tid:f.node.tid+';Setting',allowed_actions:[],wizard_open:{node:{part:'settings',node_label:'JavaScript'},workflow_path:path}}]}};
  const pending=structuredClone(graph);
  pending.wizard_pending_owner={status:'observed',node:{tid:'nav>JavaScript',label:'JavaScript'},path:[...path,{tid:'node',label:'JavaScript'},{tid:'wizard',label:'Настройка'}]};
  pending.ui.dialogs=[{ref:'dialog',title:'Loginom 7.4.2',text:foreign?'foreign':'Loginom 7.4.2 Настройка узла приведет к его деактивации. Вы действительно хотите начать настраивать узел? Да Да, больше не спрашивать Нет'}];
  pending.ui.elements=Object.entries({yes:'Да',no:'Да, больше не спрашивать',cancel:'Нет'}).map(([name,label])=>({tid:'msgbox;tlb;'+name,label,ref:name,signature:{dialog_ref:'dialog'},allowed_actions:['click']}));
  const opened={prepared_node_context:{...reference,verified:true,surface:'wizard'},wizard:{status:'observed',root_ref:'wizard-root',root_tid:'MF;TF-1;WizrdMCF',stage:'input_mapping',owner_context:{status:'observed',node:{},path}},ui:{dialogs:[],masks:[],elements:[{tid:'MF;TF-1;WizrdMCF;btnClose',ref:'close',allowed_actions:['click']}]}};
  f.binding.document=f.realm.document;
  const app=f.realm.bg.app;app.WizardTreeNode=class {};app.ModelNodeTreeNode=class {};
  const tree=new app.ModelNodeTreeNode();Object.assign(tree,{FGuid:wrongNative?'other':f.node.id,ParentNode:f.binding.workflow,FModelNode:f.binding.nodeData});
  const wizard=new app.WizardTreeNode();wizard.ParentNode=tree;
  const originalController=f.tab.Controller,originalModel=originalController.FController;
  Object.assign(f.binding,{native:f.native,cell:f.native.FCell,controller:originalController,model:originalModel,diagram:originalModel.FDiagram,graph:originalModel.FDiagram.FmxGraph});
  const packageNode={};f.binding.workflow.ParentNode=packageNode;
  const el=(tid,text='')=>({id:tid,isConnected:true,textContent:text,innerText:text,getAttribute:k=>k==='data-tid'?tid:null,getBoundingClientRect:()=>({width:100,height:100})});
  const root=Object.assign(el('MF;TF-1;WizrdMCF'),{querySelectorAll:()=>[]}),tabElement={classList:{contains:()=>true}},crumb=el(path[0].tid,path[0].label),nodeCrumb=el('node','JavaScript'),wizardCrumb=el('wizard','Настройка'),dialog=el('msgbox',pending.ui.dialogs[0].text);
  const pageEl=el('MF;TF-1;WizrdMCF;JavaScriptColumnsWizard'),gridEl=el(pageEl.id+';grdTargetColumns'),header=el(pageEl.id+';colTargetDelete');
  const mask=el('header-mask','sensitive content never logged'),overlay=el('overlay','sensitive overlay');
  for(const element of [pageEl,gridEl,header,mask,overlay]){
    element.classList=new Set(['x-mask','x-border-box']);element.classList.contains=element.classList.has.bind(element.classList);
    element.className='x-mask x-border-box';element.getBoundingClientRect=()=>({x:10,y:20,width:30,height:40});
    element.matches=()=>false;element.querySelectorAll=()=>[];
  }
  mask.parentElement=header;overlay.parentElement=null;
  header._extData={maskEl:{dom:mask}};
  const pageCmp={el:{dom:pageEl}},gridCmp={el:{dom:gridEl},ownerCt:pageCmp},column={el:{dom:header},ownerCt:gridCmp,disabled:true};
  root.querySelectorAll=()=>maskFault?[pageEl]:[];
  root.contains=e=>[pageEl,gridEl,header,mask].includes(e);gridEl.contains=e=>e===header||e===mask;pageEl.contains=e=>[gridEl,header,mask].includes(e);
  if(maskFault==='cache')header._extData.maskEl.dom={};
  if(maskFault==='enabled')column.disabled=false;
  if(maskFault==='grid_owner')column.ownerCt=pageCmp;
  if(maskFault==='page_owner')gridCmp.ownerCt=null;
  if(maskFault==='geometry')mask.getBoundingClientRect=()=>({x:10,y:20,width:300,height:40});
  if(maskFault==='class')mask.classList.add('bg-mask-message');
  if(maskFault==='loading')mask.querySelectorAll=()=>[overlay];
  class WizardModelComponentForm {constructor(){this.FModelNode=f.binding.nodeData;this.FView={el:{dom:root}};}}
  f.realm.__loginomDockPreparationV1={document:f.realm.document,id:'doc',receipts:new Map([['r',{phase:'verified',workflowId:'workflow',nodeTargetWorkflowNode:f.binding.workflow,packageNode,tab:tabElement}]])};
  f.realm.Ext={getCmp:id=>{
    if(id==='node'||id==='wizard')return {el:{dom:id==='node'?nodeCrumb:wizardCrumb},_node:{data:{node:id==='node'?tree:wizard}}};
    if(id===pageEl.id)return pageCmp;if(id===gridEl.id)return gridCmp;if(id===header.id)return column;
    if(id===mask.id&&maskFault==='component')return {el:{dom:mask}};
  }};
  let nativeState='graph',confirmed=false,closed=false,progress=fault!=='stalled',closeConfirm=false;const verbs=[];
  const installWizard=()=>{nativeState='wizard';f.tab.Controller.Node.data.node=wizard;f.tab.Controller.FController=new WizardModelComponentForm();};
  const installGraph=()=>{nativeState='graph';closed=true;f.tab.Controller.Node.data.node=f.binding.workflow;f.tab.Controller.FController=originalModel;};
  f.realm.document.querySelectorAll=selector=>{
    if(selector==='[data-tid="tab"]')return [tabElement];
    if(selector.startsWith('[data-tid^='))return nativeState==='graph'?(f.clicks>=2&&!closed?[]:[crumb]):[crumb,nodeCrumb,wizardCrumb];
    if(selector==='[data-tid="MF;TF-1;WizrdMCF"]')return nativeState==='wizard'?[root]:[];
    if(selector==='[role="dialog"],.x-message-box')return nativeState==='deactivation'?[dialog]:[];
    if(maskFault&&nativeState==='wizard'){
      for(const element of [pageEl,gridEl,header])if(selector==='[data-tid='+JSON.stringify(element.id)+']')return element===header&&maskFault==='duplicate'?[header,el(header.id)]:[element];
      if(selector==='.x-mask,.bg-mask-message,.x-mask-msg')return maskFault==='many'?[mask,...Array(15).fill(overlay)]:maskFault==='real_overlay'?[mask,overlay]:[mask];
    }
    return [];
  };
  const originalWait=f.page.waitForFunction;
  f.page.waitForFunction=async(fn,arg,options)=>{
    if(fn.name!=='inspectJavascriptWizardSettlement')return originalWait(fn,arg,options);
    assert.ok(options.timeout>0&&options.timeout<=5000);
    assert.equal(await f.page.evaluate(fn,arg),false,'opening must first be pending');
    if(progress){if(deactivate&&!confirmed)nativeState='deactivation';else installWizard();}
    if(fault==='changedOriginal')f.native.data={};
    if(!await f.page.evaluate(fn,arg))throw Error('Bounded wizard settlement timeout');
    return {dispose:async()=>{}};
  };
  const closeQuestion={...opened,ui:{dialogs:[{ref:'close-dialog',title:'Подтвердить',text:'Подтвердить Вы действительно хотите закрыть мастер настройки? Да Нет'}],masks:[],elements:['yes','no'].map(name=>({tid:'msgbox;tlb;'+name,ref:'close-'+name,label:name==='yes'?'Да':'Нет',signature:{dialog_ref:'close-dialog'},allowed_actions:['click']}))}};
  const channel={observe:async options=>{
    const state=closed?graph:closeConfirm?closeQuestion:nativeState==='deactivation'?pending:nativeState==='wizard'?opened:graph;
    assert.equal(options.ready(state),true,'Only an exactly bound wizard/deactivation state may be accepted');return state;
  },perform:async options=>{
    const state=closeConfirm?closeQuestion:nativeState==='wizard'?opened:pending;
    assert.equal(options.ready(state),true);const action=options.resolve(state);verbs.push(action.verb);
    if(action.verb==='confirm_wizard_deactivation'){
      assert.equal(action.ref,'yes');if(fault!=='lostDeactivationPending')confirmed=true;
      if(fault?.startsWith('lostDeactivation'))throw Error('Lost deactivation reply');
      nativeState='graph';return;
    }
    if(action.ref==='close'){
      if(fault==='lostClose')throw Error('Lost close reply');
      if(fault==='closeConfirmation')closeConfirm=true;else installGraph();return;
    }
    assert.equal(action.verb,'confirm_wizard_close');closeConfirm=false;installGraph();
  }};
  const lifecycle={},options=()=>({binding:f.binding,node:f.node,icon:'js',reference,prepared,deadline:Date.now()+5000,record:f.record,channel,lifecycle});
  return {f,graph,reference,verbs,lifecycle,run:()=>openJavascriptWizard(f.page,options()),cleanup:()=>cleanupJavascriptWizardOpening(f.page,options()),settle:deadline=>waitJavascriptWizardSettlement(f.page,{...options(),deadline}),recover:()=>{progress=true;}};
}

test('private reopen preserves generic deny and uses only the exact optional deactivation confirmation',async()=>{
  for(const deactivate of [false,true]){
    const f=privateWizardFixture({deactivate});const result=await f.run();
    assert.equal(result.verified,true);assert.equal(result.deactivation_required,deactivate);assert.equal(f.f.clicks,2);
    assert.deepEqual(f.verbs,deactivate?['confirm_wizard_deactivation']:[]);
    assert.deepEqual(f.graph.ui.elements[0].allowed_actions,[]);
  }
});

test('private reopen rejects foreign deactivation and a different native wizard without another opening gesture',async()=>{
  for(const options of [{deactivate:true,foreign:true},{wrongNative:true}]){
    const f=privateWizardFixture(options);await assert.rejects(f.run());assert.equal(f.f.clicks,2);assert.deepEqual(f.verbs,[]);
  }
  const f=privateWizardFixture();const bad=structuredClone(f.graph);bad.prepared_node_context.node_id='other';
  assert.throws(()=>javascriptWizardBinding(bad,f.reference),/owner/);
});

test('lifecycle journal orders closure events before operator intent and caps payload/count',async()=>{
  const page=new EventEmitter(),context=new EventEmitter(),browser=new EventEmitter(),events=[];
  page.isClosed=()=>false;context.pages=()=>[page];context.browser=()=>browser;browser.isConnected=()=>true;
  const observer=observeJavascriptBrowserLifecycle({context,page,record:async e=>events.push(e),stage:()=> 'prepare-typed-input'});
  page.emit('download',{url:()=> 'private'});page.emit('crash');context.emit('close');browser.emit('disconnected');
  await observer.beforeClose();
  for(let i=0;i<140;i++)page.emit('pageerror',new Error('private-message'));
  const summary=await observer.finish();assert.equal(summary.events,128);assert.ok(summary.dropped>0);assert.equal(summary.write_failed,false);
  assert.equal(events.find(e=>e.event==='context_close').operator_close_requested,false);
  assert.equal(events.find(e=>e.event==='operator_context_close_requested').operator_close_requested,true);
  assert.ok(!JSON.stringify(events).includes('private'));assert.equal(page.listenerCount('close'),0);
  assert.deepEqual(events.map(e=>e.sequence),Array.from({length:128},(_,i)=>i+1));
});
test('lifecycle journal write failure is reported and never throws from a browser event',async()=>{
  const page=new EventEmitter(),context=new EventEmitter();page.isClosed=()=>true;context.pages=()=>[page];context.browser=()=>null;
  const observer=observeJavascriptBrowserLifecycle({context,page,record:async()=>{throw Error('disk failure');},stage:()=> 'cleanup'});
  assert.doesNotThrow(()=>page.emit('close'));await observer.beforeClose();assert.equal((await observer.finish()).write_failed,true);
});

function cleanupFixture(fault,saved=false) {
  const savedPath=saved?'/jsteach/js-g2-9150c962-ad60-4cd4-a13e-bcba89b982d8/JavaScript-9150c962-ad60-4cd4-a13e-bcba89b982d8.lgp':undefined;
  const packageNode={PackageFileName:savedPath??''},workflow={ParentNode:packageNode},tab={};
  const original={Controller:{Node:{data:{node:workflow}}}};
  const owner={card:original,controller:original.Controller,workflow,packageNode,tab};
  const storage={constructor:{name:'StorageDirectoryTreeNode'}};
  let active={Controller:{Node:{data:{node:storage}}}},blocked=true,disposed=0,waits=0;
  const blocker={isConnected:true,className:'bg-mask-message',getBoundingClientRect:()=>({x:1,y:2,width:30,height:40}),
    getAttribute:key=>key==='data-tid'?'owned-mask':key==='bg-mask-text'?'Загрузка':null};
  const document={querySelectorAll:()=>blocked?[blocker]:[]};
  const prepared={status:'READY',document_id:'document',workflow_ref:{workflow_id:'workflow',prefix:'MF;TF-1',tab_tid:'tab'},
    package_ref:{persisted:saved,path:savedPath??null}};
  const context=vm.createContext({document,location:{origin:'http://logi-test-plan.bg.local'},getComputedStyle:()=>({visibility:'visible'}),
    __loginomDockPreparationV1:{document,id:'document',receipts:new Map([['r',{phase:'verified',workflowId:'workflow',packageNode,tab}]])},
    bg:{app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>active}},
      FMapTree:{FServerConnection:{UserName:'jsteach',Connected:true},PackageNodes:{Count:1,Items:()=>packageNode}}}}}}}});
  const run=(fn,arg)=>vm.runInContext('('+fn.toString()+')',context)(arg);
  const page={evaluateHandle:async fn=>Object.assign(run(fn),{dispose:async()=>{disposed++;}}),evaluate:async(fn,arg)=>run(fn,arg),
    waitForFunction:async(fn,arg,options)=>{
      assert.equal(typeof fn,'function','Playwright string expressions are not invoked with args');
      waits++;assert.ok(options.timeout>0&&options.timeout<=5000);
      assert.equal(run(fn,arg),false,'a blocker must keep the first sample pending');
      if(fault==='owner')active={...active};
      if(fault==='saved-path')packageNode.PackageFileName='/foreign.lgp';
      if(fault!=='blocked')blocked=false;
      if(!run(fn,arg))throw Error('Settlement timeout');return {dispose:async()=>{}};
    }};
  const records=[];
  return {run:(deadline=Date.now()+5000)=>waitJavascriptCleanupReady(page,{owner,prepared,account:'jsteach',deadline,record:async r=>records.push(r),savedPath}),records,
    get disposed(){return disposed;},get waits(){return waits;}};
}
test('cleanup waits read-only for bounded blockers with the original native owners',async()=>{
  const f=cleanupFixture();await f.run();assert.equal(f.waits,1);assert.equal(f.disposed,1);
  assert.equal(f.records[0].blockers[0].tid,'owned-mask');assert.equal(f.records[0].blockers[0].mask_text,'Загрузка');
  assert.equal(f.records.at(-1).ready,true);assert.equal(f.records[0].deadline,f.records.at(-1).deadline);
});
test('cleanup accepts only its explicitly admitted saved package path',async()=>{
  const saved=cleanupFixture(undefined,true);await saved.run();
  assert.equal(saved.records.at(-1).ready,true);
  const changed=cleanupFixture('saved-path',true);
  await assert.rejects(changed.run(),/surface changed/);
  assert.equal(changed.records.at(-1).owner_verified,false);
});
test('expired cleanup deadline cannot start a new settlement wait',async()=>{
  const f=cleanupFixture();await assert.rejects(f.run(Date.now()-1),/deadline/);assert.equal(f.waits,0);assert.equal(f.disposed,1);
});
test('cleanup refuses retained blockers or a changed native surface without UI mutation',async()=>{
  for(const fault of ['blocked','owner']){
    const f=cleanupFixture(fault);await assert.rejects(f.run(),fault==='blocked'?/timeout/:/surface changed/);
    assert.equal(f.disposed,1);assert.equal(f.records.at(-1).phase,'cleanup_workflow_settlement_refused');
    if(fault==='blocked')assert.equal(f.records.at(-1).blocker_count,1);
    else assert.equal(f.records.at(-1).owner_verified,false);
  }
});

test('connected initial-page admission requires the complete same-node input mapping',()=>{
  const node={document_id:'document',workflow_id:'workflow',node_id:'node'};
  const sources=javascriptInputColumns.map((field,index)=>({...field,index,required:false,record_id:'record-'+index,field_id:'field-'+index}));
  const mapping={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'TuneDataSourceMappingWizard',autosync:true,
    node_context:{...node,verified:true,surface:'wizard',input_port:{direction:'input',port:0,port_guid:'port'}},
    source_fields:sources,target_fields:sources.map((source,index)=>({...source,record_id:'target-'+index,field_id:'target-field-'+index,source}))};
  const proof=verifyJavascriptInputMapping(mapping,node);
  assert.ok(javascriptInitialPages('MF;TF-1',node,proof).some(page=>page.endsWith(';JavaScriptColumnsWizard')));
  assert.equal(javascriptInitialPages('MF;TF-1',{...node,node_id:'foreign'},proof).length,1);
  assert.equal(javascriptInitialPages('MF;TF-1',node,null).length,1);
  for(const corrupt of [m=>{m.inventory_complete=false;},m=>{m.node_context.node_id='foreign';},m=>m.target_fields.pop(),
    m=>{m.target_fields[0].source={...m.target_fields[0].source,record_id:'foreign'};},m=>{m.source_fields[1].type='integer';}]){
    const changed=structuredClone(mapping);corrupt(changed);assert.throws(()=>verifyJavascriptInputMapping(changed,node));
  }
});

test('compact report reference addresses the complete durable journal line and preserves acknowledgement',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'javascript-journal-'));
  try{
    const journal=createExecutionJournal({directory,metadata:{sessionId:'journal-test',clientRevision:'test'}});
    const event={phase:'artifact_delivery_upload_receipt',operation_id:'delivery',payload:{text:'x'.repeat(1000000)}};
    const saved=await journal(event),reference=compactJavascriptJournalRecord(saved,1),bytes=await readFile(join(directory,'execution-events.jsonl'));
    assert.equal(saved.phase,event.phase);assert.equal(saved.operation_id,event.operation_id);assert.equal(saved.payload.text,event.payload.text);
    assert.equal(reference.sha256,createHash('sha256').update(bytes).digest('hex'));
    assert.equal(reference.line,1);assert.equal(reference.journal,'execution-events.jsonl');
    assert.ok(JSON.stringify(reference).length<512);assert.equal(reference.payload,undefined);
    assert.equal(bytes.toString(),JSON.stringify(saved)+'\n');
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('generated input request passes the installed text-import admission contract',()=>{
  const prepared={document_id:'js-document',workflow_ref:{workflow_id:'js-workflow',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_workflow',label:'Сценарий'}]}};
  const request=javascriptInputRequest({prepared,storage:'/jsteach/js-g2-11111111-1111-4111-8111-111111111111',
    artifact:{artifact_id:'fixture',bytes:157,sha256:'4fce338d2edd2901ba35732ed148a1a80eba4a5fbf927f2828f3cdbe6b8fa09e'},uploadOperationId:'fixture:upload',totalMs:600000});
  const support=createTextImportNodeSupport({targetOrigin:'http://logi-test-plan.bg.local',targetBuild:'7.4.2'});
  assert.doesNotThrow(()=>validateNodeApplyRequest(request,support.nodeApplyHandlers));
});

test('pinned sales bytes and manifest agree; changed bytes and repinned fixture are refused',async()=>{
  const fixture=new URL('../../../../docs/node-development/nodes/programming-javascript/fixtures/model-input/sales.csv',import.meta.url);
  const bytes=await readFile(fixture),manifest=JSON.parse(await readFile(new URL('../manifest.json',fixture),'utf8'));
  assert.equal(verifyJavascriptFixture(bytes,manifest).bytes,157);
  assert.throws(()=>verifyJavascriptFixture(Buffer.concat([bytes,Buffer.from('\n')]),manifest));
  const changed=structuredClone(manifest);changed.files.find(file=>file.path==='model-input/sales.csv').sha256='0'.repeat(64);
  assert.throws(()=>verifyJavascriptFixture(bytes,changed));
});

test('typed oracle rejects whitespace loss, reordered rows, approximate integers and partial reads',()=>{
  const table={sample_complete:true,row_count:6,sample_rows:6,schema:javascriptInputColumns,
    sample:javascriptInputRows.map(row=>row.map((value,i)=>({type:javascriptInputColumns[i].type,is_null:false,value,precision:i===1?'display_text':'exact_integer'})))};
  assert.equal(verifyJavascriptTable(table,'input').verified,true);
  for(const corrupt of [t=>{t.sample[0][1].value='Alpha';},t=>t.sample.reverse(),t=>{t.sample[0][0].precision='unverified';},t=>{t.sample_complete=false;}]){
    const changed=structuredClone(table);corrupt(changed);assert.throws(()=>verifyJavascriptTable(changed,'input'));
  }
});

test('sentinel requires fresh same effect/node/source messages and a terminal result for gate pass',()=>{
  const identity={effect_id:'next-1',node_id:'node-1',source_sha256:'a'.repeat(64)};
  const message={...identity,id:'error-1',text:'JS_G2_EXECUTION_SENTINEL_V1'};
  const args={stage:'next',messages:[message],baselineIds:[],identity,ownerVerified:true,terminal:true};
  assert.equal(javascriptSentinelOutcome(args).gate_passed,true);
  assert.equal(javascriptSentinelOutcome({...args,terminal:false}).gate_passed,false);
  assert.equal(javascriptSentinelOutcome({...args,baselineIds:['error-1']}).execution,'ambiguous');
  for(const key of ['effect_id','node_id','source_sha256'])assert.equal(javascriptSentinelOutcome({...args,messages:[{...message,[key]:'foreign'}]}).execution,'ambiguous');
  assert.equal(javascriptSentinelOutcome({...args,messages:[]}).absence_proves_no_execution,false);
});

test('durable acknowledgement precedes a gesture; an uncertain gesture cannot be replayed',async()=>{
  const calls=[];
  const once=createJavascriptEffectJournal({deadline:100,now:()=>1,record:async event=>calls.push(event.state)});
  await assert.rejects(once('effect',{},async()=>{calls.push('gesture');throw Error('lost result');}));
  await assert.rejects(once('effect',{},async()=>calls.push('replayed')));
  assert.deepEqual(calls,['dispatching','gesture','unconfirmed']);
});

test('failed journal or expired original deadline cannot dispatch a gesture',async()=>{
  let gestures=0;
  const broken=createJavascriptEffectJournal({deadline:100,now:()=>1,record:async()=>{throw Error('disk full');}});
  await assert.rejects(broken('effect',{},async()=>gestures++));
  await assert.rejects(broken('effect',{},async()=>gestures++));
  const expired=createJavascriptEffectJournal({deadline:1,now:()=>1,record:async()=>{}});
  await assert.rejects(expired('effect',{},async()=>gestures++));
  assert.equal(gestures,0);
});


test('private Setting waits for wizard native surface before roots; both waits retain opening deadline',async()=>{
 for(const deactivate of [false,true]){
  const f=privateWizardFixture({deactivate});await f.run();
  const samples=f.f.records.filter(e=>e.phase.startsWith('javascript_wizard_settlement_'));
  assert.equal(samples[0].ready,false);assert.equal(samples[0].navigation_count,0);
  assert.equal(samples.at(-1).surface,'wizard');assert.equal(samples.at(-1).ready,true);
  assert.equal(new Set(samples.map(e=>e.deadline)).size,1);assert.equal(f.f.clicks,2);
 }
});

test('failed Setting opening can be settled and cleaned up without repeating Setting',async()=>{
 for(const config of [{fault:'lostSetting'},{fault:'stalled'},{fault:'lostSetting',deactivate:true}]){
  const f=privateWizardFixture(config);await assert.rejects(f.run());f.recover();
  const closed=await f.cleanup();assert.equal(closed.verified,true);assert.equal(f.f.clicks,2);
  const before=f.verbs.length;assert.equal(await f.cleanup(),closed);assert.equal(f.verbs.length,before);
  assert.deepEqual(f.verbs,config.deactivate?['confirm_wizard_deactivation','click']:['click']);
 }
});

test('uncertain deactivation is observed without repeating confirmation; a remaining dialog stays pending',async()=>{
 for(const fault of ['lostDeactivationApplied','lostDeactivationPending']){
  const f=privateWizardFixture({fault,deactivate:true});await assert.rejects(f.run(),/Lost deactivation/);
  if(fault==='lostDeactivationApplied')assert.equal((await f.cleanup()).verified,true);
  else await assert.rejects(f.cleanup(),/settlement timeout/);
  assert.equal(f.verbs.filter(v=>v==='confirm_wizard_deactivation').length,1);assert.equal(f.f.clicks,2);
 }
});

test('cleanup closes the owned wizard with its exact confirmation and never repeats an uncertain close',async()=>{
 for(const fault of ['closeConfirmation','lostClose']){
  const f=privateWizardFixture({fault});await f.run();
  if(fault==='closeConfirmation'){
   assert.equal((await f.cleanup()).verified,true);assert.deepEqual(f.verbs,['click','confirm_wizard_close']);
  }else{
   await assert.rejects(f.cleanup(),/Lost close/);await assert.rejects(f.cleanup(),/Lost close/);assert.deepEqual(f.verbs,['click']);
  }
 }
});


test('wizard settlement rejects changed original native identity and expired deadline without effects',async()=>{
 const changed=privateWizardFixture({fault:'changedOriginal'});await assert.rejects(changed.run(),/original native owner changed/);
 assert.deepEqual(changed.verbs,[]);assert.equal(changed.f.clicks,2);
 const ready=privateWizardFixture();await ready.run();
 await assert.rejects(ready.settle(Date.now()-1),/original deadline expired/);
 assert.deepEqual(ready.verbs,[]);assert.equal(ready.f.clicks,2);
});


test('same-owned disabled delete header permits wizard settlement and cleanup through the shared classifier',async()=>{
 const f=privateWizardFixture({maskFault:'valid'});await f.run();assert.equal((await f.cleanup()).verified,true);
 const samples=f.f.records.filter(e=>e.phase==='javascript_wizard_settlement_verified');
 assert.ok(samples.length>=2);
 for(const s of samples){
  assert.equal(s.mask_count,1);assert.equal(s.blocker_count,0);assert.equal(s.disabled_delete_mask_count,1);
  assert.equal(s.mask_diagnostics[0].disabled_delete_mask,true);assert.ok(Object.values(s.mask_diagnostics[0].checks).every(Boolean));
  assert.equal(JSON.stringify(s).includes('sensitive'),false);
 }
 assert.deepEqual(f.verbs,['click']);assert.equal(f.f.clicks,2);
});

test('wizard settlement keeps real overlays and every failed header identity check blocking',async()=>{
 for(const maskFault of ['real_overlay','cache','enabled','grid_owner','page_owner','geometry','class','loading','component','duplicate']){
  const f=privateWizardFixture({maskFault});await assert.rejects(f.run(),/settlement timeout/);
  await assert.rejects(f.cleanup(),/settlement timeout/);
  const refused=f.f.records.findLast(e=>e.phase==='javascript_wizard_settlement_refused');
  assert.equal(refused.native_owner_verified,true);assert.ok(refused.blocker_count>0);assert.equal(refused.ready,false);
  assert.equal(JSON.stringify(refused).includes('sensitive'),false);assert.deepEqual(f.verbs,[]);assert.equal(f.f.clicks,2);
 }
});

test('wizard mask diagnostics are capped without truncating blocker admission or accepting a foreign node',async()=>{
 const many=privateWizardFixture({maskFault:'many'});await assert.rejects(many.run(),/settlement timeout/);
 const r=many.f.records.findLast(e=>e.phase==='javascript_wizard_settlement_refused');
 assert.equal(r.mask_count,16);assert.equal(r.blocker_count,15);assert.equal(r.mask_diagnostics.length,12);assert.equal(r.mask_diagnostics_truncated,true);
 const foreign=privateWizardFixture({maskFault:'valid',wrongNative:true});await assert.rejects(foreign.run(),/native owner changed/);
 assert.deepEqual(foreign.verbs,[]);
});


test('the live readiness inspector serializes the same classifier without browser imports or host closures',async()=>{
 const source=await readFile(new URL('./javascript-live.mjs',import.meta.url),'utf8');
 const start=source.indexOf('const wizardReadiness=')+'const wizardReadiness='.length;
 const end=source.indexOf(';\nconst waitWizardReady=',start);
 assert.ok(start>0&&end>start);
 const inspect=vm.runInNewContext(source.slice(start,end),{withJavascriptWizardMasks,withJavascriptWizardAddress});
 const realm=vm.createContext({document:{querySelectorAll:()=>[]},getComputedStyle:()=>({visibility:'visible'})});
 const result=vm.runInContext('('+inspect.toString()+')',realm)({prefix:'MF;TF-1',inspect:true});
 assert.equal(result.ready,false);assert.equal(result.fatal,true);assert.equal(result.counts.overlays,0);
 assert.equal(result.mask_classification.length,0);
});


function mappingCloseFixture({bad=false,foreignGraph=false}={}) {
  const reference={document_id:'doc',workflow_id:'workflow',node_id:'node'};
  const graph={verified:true,...reference,surface:'graph',tid:'MF;TF-1;Graph;JS',locked:false};
  const receipt={status:'AMBIGUOUS',action_key:'ui.act',operation_id:'close:n7',effect_possible:true,
    error:{code:'PREPARED_NODE_CONTEXT_CHANGED'},output:{prepared_node_context:graph},
    trace:[{event:'ui_preconditions_verified',verb:'confirm_wizard_close'},{event:'ui_gesture_applied',verb:'confirm_wizard_close'},
      {event:'prepared_node_surface_mismatch',before:{...graph,locked:true},after:graph}]};
  if(bad)receipt.error.code='TRANSPORT_LOST';
  const node={...reference,verified:true,surface:'wizard',input_port:{direction:'input',port:0,native_index:0,port_guid:'port',opening_operation_id:'open:n2'}};
  const wizard={status:'observed',stage:'input_mapping',root_ref:'wizard',root_tid:'MF;TF-1;WizrdMCF'};
  const close={tid:wizard.root_tid+';btnClose',ref:'close',allowed_actions:['click']};
  const controls=['yes','no'].map(name=>({tid:'msgbox;tlb;'+name,ref:name,label:name==='yes'?'Да':'Нет',allowed_actions:['click'],signature:{dialog_ref:'dialog'}}));
  const stages=[{prepared_node_context:node,wizard,ui:{elements:[close],dialogs:[],masks:[]}},
    {prepared_node_context:node,wizard,ui:{elements:controls,dialogs:[{ref:'dialog',title:'Подтвердить',text:'Подтвердить Вы действительно хотите закрыть мастер настройки? Да Нет'}],masks:[]}},
    {prepared_node_context:graph,wizard:{status:'absent'},ui:{dialogs:[],masks:[]}}];
  let index=0,current,verified=0;const effects=[],events=[];
  const reader={observe:async options=>{current=stages[index++];assert.ok(options.ready(current));return current;},
    perform:async options=>{assert.ok(options.ready(current));const action=options.resolve(current);effects.push(action.verb);
      if(action.verb==='confirm_wizard_close'){const error=Error('surface changed');error.name='NodeProcedureStepError';error.receipt=receipt;throw error;}}};
  const run=()=>closeJavascriptPortMapping({reader,direction:'input',reference,record:async e=>events.push(e),deadline:Date.now()+1000,
    verifyGraph:async()=>{verified++;if(foreignGraph)throw Error('native graph changed');}});
  return {reference,receipt,effects,events,run,get verified(){return verified;}};
}

test('mapping-close reconciliation accepts only exact applied confirmation graph unlock receipt',()=>{
  const f=mappingCloseFixture();assert.equal(javascriptMappingUnlockReceipt(f.receipt,f.reference),true);
  for(const corrupt of [r=>r.effect_possible=false,r=>r.trace[1].verb='click',r=>r.trace[2].after={...r.trace[2].after,node_id:'foreign'},
    r=>r.trace[2].before.locked=false,r=>r.trace[2].before.surface='wizard',r=>r.trace[2].before.extra=true,
    r=>r.output.prepared_node_context={...r.output.prepared_node_context,tid:'foreign'},r=>r.trace.reverse()]){
    const receipt=structuredClone(f.receipt);corrupt(receipt);assert.equal(javascriptMappingUnlockReceipt(receipt,f.reference),false);
  }
});

test('mapping-close uses only readonly proof after ambiguous unlock and never replays confirmation',async()=>{
  const f=mappingCloseFixture();const closed=await f.run();assert.equal(closed.verified,true);assert.equal(closed.original_status,'AMBIGUOUS');
  assert.deepEqual(f.effects,['click','confirm_wizard_close']);assert.equal(f.verified,1);
  assert.equal(f.events.at(-1).phase,'port_mapping_close_verified');
});

test('mapping-close refuses another error or changed original native graph',async()=>{
  for(const options of [{bad:true},{foreignGraph:true}]){
    const f=mappingCloseFixture(options);await assert.rejects(f.run());assert.deepEqual(f.effects,['click','confirm_wizard_close']);
    assert.equal(f.events.some(e=>e.phase==='port_mapping_close_verified'),false);
    assert.equal(f.verified,options.bad?0:1);
  }
});


function wizardAddressFixture(label='JavaScript') {
  const document={},cell={},nodeData={},workflow={},node={FGuid:'js',data:nodeData,FCell:cell};
  node.FLabel={parent:node,FCell:{parent:cell},FRawValue:label};
  const tree={FGuid:'js',FModelNode:nodeData,FParentNode:workflow},native={FParentNode:tree},model={FModelNode:nodeData};
  const element=(id,tid,text)=>({id,tid,textContent:text,getAttribute(key){return key==='data-tid'?this.tid:null;}});
  const prefix='MF;TF-1',base=prefix+';cnrNaviMode;b.s_Workflow>',suffix=label.replaceAll(' ','_').replaceAll(',','');
  const crumbs=[element('node',base+suffix,label),element('wizard',base+suffix+'>Настройка','Настройка')];
  const controls={node:{el:{dom:crumbs[0]},_node:{data:{node:tree}}},wizard:{el:{dom:crumbs[1]},_node:{data:{node:native}}}};
  const binding={document,native:node,cell,nodeData,workflow};
  const args={prefix,id:'js',binding,native,model,crumbs,epoch:0};
  const realm=vm.createContext({document,Ext:{getCmp:id=>controls[id]}});
  const read=()=>vm.runInContext('('+inspectJavascriptWizardAddress.toString()+')',realm)(args);
  return {args,realm,binding,node,tree,native,model,crumbs,controls,read,
    reopen(label){node.FLabel.FRawValue=label;const suffix=label.replaceAll(' ','_').replaceAll(',','');
      crumbs[0].tid=base+suffix;crumbs[0].textContent=label;crumbs[1].tid=base+suffix+'>Настройка';
      args.epoch++;}};
}

test('wizard addressing accepts renamed same native node for reopening and repeated cleanup readiness',()=>{
  const f=wizardAddressFixture();assert.equal(f.read().ready,true);
  f.reopen('JS: ObservedID, PhaseMarker');const reopened=f.read();assert.equal(reopened.ready,true);
  assert.equal(reopened.label,'JS: ObservedID, PhaseMarker');assert.match(reopened.node_tid,/JS:_ObservedID_PhaseMarker$/);
  const cleanup=f.read();assert.equal(cleanup.ready,true);assert.equal(cleanup.node_tid,reopened.node_tid);
});

test('wizard addressing rejects foreign node, spoofed breadcrumb and stale label without weakening native identity',()=>{
  for(const corrupt of [f=>f.tree.FGuid='foreign',f=>f.tree.FModelNode={},f=>f.controls.node._node.data.node={...f.tree},
    f=>f.controls.wizard._node.data.node={...f.native},f=>f.node.FCell={},f=>f.node.FLabel.parent={},f=>f.crumbs[0].textContent='Other',
    f=>f.crumbs[1].tid='foreign']){
    const f=wizardAddressFixture('JS: ObservedID, PhaseMarker');corrupt(f);assert.equal(f.read().ready,false);
  }
});

test('wizard address is pinned within an opening and never reads a label getter',()=>{
  const f=wizardAddressFixture();assert.equal(f.read().ready,true);
  f.node.FLabel.FRawValue='Other';f.crumbs[0].textContent='Other';
  assert.equal(f.read().ready,false);assert.equal(f.read().checks.retained_address,false);
  const g=wizardAddressFixture();let reads=0;
  Object.defineProperty(g.node.FLabel,'FRawValue',{get(){reads++;throw Error('label getter');}});
  assert.equal(g.read().ready,false);assert.equal(reads,0);
});


test('wizard address reads proven FParentNode caches without invoking ParentNode prototype getters',()=>{
  const f=wizardAddressFixture();let reads=0;
  const prototype={};Object.defineProperty(prototype,'ParentNode',{get(){reads++;throw Error('ParentNode getter');}});
  Object.setPrototypeOf(f.tree,prototype);Object.setPrototypeOf(f.native,prototype);
  assert.equal(f.read().ready,true);assert.equal(reads,0);
  f.tree.FParentNode={};assert.equal(f.read().ready,false);assert.equal(reads,0);
});

test('wizard address rejects duplicate crumbs, epoch rollback and missing retained data',()=>{
  const f=wizardAddressFixture();f.crumbs.unshift(f.crumbs[0]);assert.equal(f.read().ready,false);
  const g=wizardAddressFixture();g.reopen('JS: ObservedID, PhaseMarker');assert.equal(g.read().ready,true);
  g.args.epoch--;assert.equal(g.read().ready,false);
  const h=wizardAddressFixture();delete h.binding.nodeData;delete h.node.data;assert.equal(h.read().ready,false);
});

test('wizard address refuses accessors throughout native label and breadcrumb caches without invoking them',()=>{
  for(const target of [f=>[f.native,'FParentNode'],f=>[f.tree,'FModelNode'],f=>[f.node,'FLabel'],
    f=>[f.node.FLabel,'parent'],f=>[f.node.FLabel.FCell,'parent'],f=>[f.controls.node,'_node'],
    f=>[f.controls.node._node,'data'],f=>[f.controls.node._node.data,'node'],
    f=>[f.controls.node,'el'],f=>[f.controls.node.el,'dom']]){
    const f=wizardAddressFixture();const [object,key]=target(f);let reads=0;
    Object.defineProperty(object,key,{get(){reads++;throw Error('cache accessor');}});
    assert.equal(f.read().ready,false);assert.equal(reads,0);
  }
});

function executionNotificationFixture() {
  const element=Object.assign(new Element('div',{'data-tid':'toast',class:'x-window bg-notify-msg-color-error'},'',{width:300,height:150}),
    {id:'toast-1',root:true});
  class Toast {}
  Object.assign(Toast.prototype,{$className:'Ext.window.Toast',closeOnMouseOut:false,hideDuration:500});
  const toast=new Toast();Object.assign(toast,{el:{dom:element},autoClose:true,autoCloseDelay:23000});
  const node={FGuid:'js',data:{},FCell:{}},workflow={},container={},graph={container};
  const form={id:'model-form',isConnected:true,getBoundingClientRect:()=>({width:1000,height:800}),
    classList:{contains:c=>c==='bg-mask-message'},contains:e=>e===container,
    getAttribute:k=>k==='data-tid'?'MF;TF-1;ModelForm':k==='bg-mask-text'?'Загрузка':null};
  const view={el:{dom:form}},diagram={FNodes:{FCollection:[node]},FmxGraph:graph},model={FDiagram:diagram,FView:view};
  class MaskContext {}
  MaskContext.ElementSymb=Symbol('MaskWithText');
  const mask=new MaskContext();Object.assign(mask,{FElement:form,FController:view,FIsActive:true,FSequence:['Загрузка'],FCurrent:0});
  view[MaskContext.ElementSymb]=mask;
  const controller={FController:model,Node:{data:{node:workflow}}},tab={Controller:controller};
  const state={dialogs:[element],masks:[],now:0};
  const document={querySelectorAll:s=>s.startsWith('.x-mask')?state.masks:s.startsWith('[data-tid=')?[form]:
    state.dialogs.filter(e=>Element.prototype.matches.call(e,s))};
  const binding={document,tab,controller,model,view,form,diagram,graph,container,native:node,nodeData:node.data,cell:node.FCell,workflow,node:{id:'js',tid:'MF;TF-1;Graph;JavaScript'}};
  const realm=vm.createContext({document,performance:{now:()=>state.now},location:{origin:'http://logi-test-plan.bg.local'},getComputedStyle:()=>({display:'block',visibility:'visible'}),
    Ext:{window:{Toast},getCmp:id=>id===form.id?view:toast},bg:{ext:{AfterElementTextMaskContext:MaskContext},
      app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>tab}}}}}}}});
  const run=(fn,args)=>vm.runInContext('('+fn.toString()+')',realm)(args);
  return {binding,state,toast,node,element,form,view,mask,MaskContext,run,read:()=>run(inspectJavascriptExecutionNotifications,{binding})};
}

test('post-execution notification waits for natural disappearance without claiming toast ownership',()=>{
  const f=executionNotificationFixture(),before=f.read();assert.equal(before.ready,false);
  assert.equal(before.execution_dispatched,true);assert.equal(before.execution_completed,false);
  assert.equal(before.notification_owner_verified,false);assert.equal(before.auto_close_delays[0],23000);
  f.state.dialogs=[];assert.equal(f.read().ready,false);f.state.now+=500;assert.equal(f.read().ready,true);
});

test('post-execution inventory sees native window without toast class or ARIA role throughout auto-close',()=>{
  const f=executionNotificationFixture();
  assert.equal(f.element.matches('[role="dialog"],.x-message-box,.x-toast'),false);
  assert.equal(f.element.matches('[role="dialog"],.x-window,.bg-dialog'),true);
  assert.equal(f.read().notification_count,1);
  f.state.now=23000;const retained=f.read();
  assert.equal(retained.ready,false);assert.equal(retained.quiet_for_ms,null);
  assert.equal(retained.execution_completed,false);assert.equal(retained.notification_owner_verified,false);
  f.element.remove();f.element.root=false;
  assert.equal(f.read().ready,false);f.state.now+=499;assert.equal(f.read().ready,false);
  f.state.now++;assert.equal(f.read().ready,true);
});

test('post-execution inventory retains old selectors and counts a multiply matched native toast once',()=>{
  for(const attrs of [{class:'x-toast'},{class:'x-message-box'},{role:'dialog'},
    {class:'x-window bg-dialog x-message-box x-toast',role:'dialog'}]){
    const f=executionNotificationFixture();f.element.attrs={'data-tid':'toast',...attrs};
    assert.equal(f.read().notification_count,1);assert.equal(f.read().ready,false);
  }
});

test('post-execution inventory rejects generic-only foreign windows even after prior quiet',()=>{
  for(const cls of ['x-window','bg-dialog']){
    const f=executionNotificationFixture();f.state.dialogs=[];
    assert.equal(f.read().ready,false);f.state.now=500;assert.equal(f.read().ready,true);
    const foreign=Object.assign(new Element('div',{'data-tid':'foreign',class:cls}),{id:'foreign',root:true});
    assert.equal(foreign.matches('[role="dialog"],.x-message-box,.x-toast'),false);
    f.state.dialogs=[foreign];
    assert.throws(()=>f.read(),/foreign dialog or unsupported notification lifecycle/);
    // A valid Toast next to a foreign dialog does not authorize either waiting
    // on or dismissing the foreign dialog.
    f.state.dialogs=[f.element,foreign];
    assert.throws(()=>f.read(),/foreign dialog or unsupported notification lifecycle/);
  }
});

test('post-execution owned ModelForm busy may publish its first toast before stable quiet',()=>{
  const f=executionNotificationFixture();f.state.dialogs=[];f.state.masks=[f.form];
  const busy=f.read();assert.equal(busy.ready,false);assert.equal(busy.owned_busy,true);
  assert.equal(busy.mask_target_tid,'MF;TF-1;ModelForm');assert.equal(f.binding.executionNotifications.toasts,null);
  // One empty poll between mask and toast is not yet quiet admission.
  f.state.masks=[];assert.equal(f.read().ready,false);f.state.now=250;
  f.state.dialogs=[f.element];const toast=f.read();assert.equal(toast.ready,false);assert.equal(toast.notification_count,1);
  assert.equal(toast.quiet_for_ms,null);assert.equal(toast.notification_owner_verified,false);
  f.state.dialogs=[];assert.equal(f.read().ready,false);f.state.now+=499;assert.equal(f.read().ready,false);
  f.state.now++;assert.equal(f.read().ready,true);
});

test('post-execution native busy proof rejects foreign target, inactive/replaced cache and modal mixtures',()=>{
  for(const change of [f=>f.state.masks=[{...f.form}],f=>f.mask.FElement={},f=>f.mask.FController={},
    f=>f.mask.FIsActive=false,f=>f.mask.FSequence=[],f=>f.mask.FCurrent=1,f=>f.mask.FSequence=['Foreign'],
    f=>delete f.view[f.MaskContext.ElementSymb],f=>f.view[f.MaskContext.ElementSymb]={...f.mask},
    f=>f.binding.model.FView={},f=>f.form.contains=()=>false,f=>f.state.masks.push(f.element),
    f=>{f.element.attrs['data-tid']='msgbox';f.state.dialogs=[f.element];}]){
    const f=executionNotificationFixture();f.state.dialogs=[];f.state.masks=[f.form];change(f);assert.throws(()=>f.read());
  }
});

test('post-execution busy observes current native cache and never invokes mask getters or methods',()=>{
  const f=executionNotificationFixture();f.state.dialogs=[];f.state.masks=[f.form];assert.equal(f.read().owned_busy,true);
  // The proof follows the current native context cache, not a stale mask DOM snapshot.
  const next=new f.MaskContext();Object.assign(next,f.mask);f.view[f.MaskContext.ElementSymb]=next;
  assert.equal(f.read().owned_busy,true);
  for(const key of ['FController','FElement','FIsActive','FSequence','FCurrent']){
    const g=executionNotificationFixture();g.state.dialogs=[];g.state.masks=[g.form];let calls=0;
    Object.defineProperty(g.mask,key,{get(){calls++;throw Error('mask getter');}});
    assert.throws(()=>g.read());assert.equal(calls,0);
  }
});

test('owned busy-to-toast-to-quiet uses one bounded wait without resetting the original deadline',async()=>{
  const f=executionNotificationFixture();f.state.dialogs=[];f.state.masks=[f.form];let waits=0;
  const records=[],deadline=Date.now()+5000;
  const page={evaluate:async(fn,args)=>f.run(fn,args),waitForFunction:async(fn,args,options)=>{
    waits++;assert.ok(options.timeout<=5000);assert.equal(f.run(fn,args),false);
    f.state.masks=[];f.state.dialogs=[f.element];assert.equal(f.run(fn,args),false);
    f.state.dialogs=[];assert.equal(f.run(fn,args),false);f.state.now=500;assert.equal(f.run(fn,args).ready,true);
    return {dispose:async()=>{}};
  }};
  assert.equal((await waitJavascriptExecutionNotifications(page,{binding:f.binding,deadline,record:async r=>records.push(r)})).ready,true);
  assert.equal(waits,1);assert.equal(records[0].owned_busy,true);assert.equal(records.at(-1).owned_busy,false);
  assert.ok(records.every(r=>r.deadline===deadline));
});

test('post-execution wait rejects foreign dialogs, busy masks, changed owners and unsupported lifecycle',()=>{
  for(const change of [f=>f.state.masks.push(f.element),f=>f.element.getAttribute=()=> 'msgbox',
    f=>f.toast.$className='ForeignToast',f=>f.toast.modal=true,f=>f.toast.autoClose=false,
    f=>f.toast.autoCloseDelay=60001,f=>f.toast.autoCloseDelay=0,f=>f.toast.mouseIsOver=true,
    f=>f.toast.closeOnMouseOut=true,f=>f.toast.hideDuration=1000,f=>f.toast.el.dom={},
    f=>f.node.data={},f=>f.binding.controller.Node.data.node={},f=>f.state.dialogs=Array(5).fill(f.element)]){
    const f=executionNotificationFixture();change(f);assert.throws(()=>f.read());
  }
});

test('post-execution notification cache accessors and replacements never authorize continued waiting',()=>{
  for(const key of ['autoClose','autoCloseDelay','el','mouseIsOver','modal','hideDuration']){
    const f=executionNotificationFixture();let reads=0;
    Object.defineProperty(f.toast,key,{get(){reads++;throw Error('getter');}});
    assert.throws(()=>f.read());assert.equal(reads,0);
  }
  const f=executionNotificationFixture();f.read();f.toast.autoCloseDelay=24000;assert.throws(()=>f.read(),/replaced/);
});

test('post-execution settlement is passive, bounded and preserves dispatched evidence on failure',async()=>{
  for(const fail of [false,true]){
    const f=executionNotificationFixture(),records=[];let waits=0,disposed=0;
    const deadline=Date.now()+5000;
    const page={evaluate:async(fn,args)=>f.run(fn,args),waitForFunction:async(fn,args,options)=>{
      waits++;assert.ok(options.timeout>0&&options.timeout<=5000);assert.equal(options.polling,250);
      if(fail)throw Error('original wait timed out');
      f.state.dialogs=[];assert.equal(f.run(fn,args),false);f.state.now+=500;
      assert.equal(f.run(fn,args).ready,true);return {dispose:async()=>disposed++};
    }};
    const promise=waitJavascriptExecutionNotifications(page,{binding:f.binding,deadline,record:async r=>records.push(r)});
    if(fail)await assert.rejects(promise,/timed out/);else assert.equal((await promise).ready,true);
    assert.equal(waits,1);assert.equal(disposed,fail?0:1);
    assert.equal(records.at(-1).execution_dispatched,true);assert.equal(records.at(-1).execution_completed,false);
    assert.equal(records.at(-1).phase,fail?'execution_notification_wait_refused':'execution_notification_wait_verified');
  }
});

test('post-execution no-notification path still requires stable quiet and expired budget cannot wait',async()=>{
  const f=executionNotificationFixture();f.state.dialogs=[];let reads=0,waits=0;
  const page={evaluate:async(fn,args)=>{reads++;return f.run(fn,args);},waitForFunction:async(fn,args)=>{
    waits++;assert.equal(f.run(fn,args),false);f.state.now+=500;assert.equal(f.run(fn,args).ready,true);return {dispose:async()=>{}};
  }};
  assert.equal((await waitJavascriptExecutionNotifications(page,{binding:f.binding,deadline:Date.now()+5000,record:async()=>{}})).ready,true);
  assert.equal(waits,1);reads=0;waits=0;
  await assert.rejects(waitJavascriptExecutionNotifications(page,{binding:f.binding,deadline:Date.now()-1,record:async()=>{}}),/deadline/);
  // One final diagnostic read is allowed after refusal, never a wait or gesture.
  assert.equal(reads,1);assert.equal(waits,0);
});

test('production executeNode waits after one launch before identify and never retries on settlement failure',async()=>{
  const source=await readFile(new URL('./javascript-execution-runtime.mjs',import.meta.url),'utf8');
  const start=source.indexOf('    async executeNode('),end=source.indexOf('    async readPassive(',start);
  assert.ok(start>0&&end>start);
  for(const fail of [false,true]){
    const steps=[],binding={dispose:async()=>steps.push('dispose')},node={node_id:'js'},limit=Date.now()+5000;
    const driver={prepare:async()=>{steps.push('prepare');return {};},launchGraph:async()=>{steps.push('launch');return {verified:true};},
      identify:async()=>{steps.push('identify');return {};},waitCompleted:async()=>{steps.push('terminal');return {verified:true};}};
    const operator=vm.runInNewContext('({'+source.slice(start,end)+'})',{
      deadline:limit,executionPhases:new Map(),javascriptExecutionIdentity,createNodeExecutionProcedure:(channel,node,options)=>{assert.equal(options.verifyFailedChild,true);return driver;},channel:()=>({}),privateGraphBinding:async()=>binding,
      page:{evaluate:async()=>({node:{id:'js'},icon:'js'})},selectJavascriptForSettings:async()=>steps.push('select'),
      once:async(id,identity,action)=>{steps.push('once');return action();},record:async r=>steps.push(r.phase),
      waitJavascriptExecutionNotifications:async(page,args)=>{assert.equal(args.binding,binding);assert.equal(args.deadline,limit);
        steps.push('settlement');if(fail)throw Error('notification retained');}
    });
    if(fail)await assert.rejects(operator.executeNode(node,limit,{phase:'initial',source_sha256:'a'.repeat(64)}),/notification retained/);
    else assert.equal((await operator.executeNode(node,limit,{phase:'initial',source_sha256:'a'.repeat(64)})).verified,true);
    assert.deepEqual(steps,['prepare','select','once','launch','execution_launched','settlement',
      ...(!fail?['identify','terminal','execution_terminal']:[]),'dispose']);
  }
});

function manualMappingFixture({foreignSource=true,foreignCleanup=false,lostClose=false,mutationError,afterFirst=false,graphError}={}){
 const reference={document_id:'doc',workflow_id:'flow',node_id:'js'},lifecycle={},events=[],actions=[];
 const port={direction:'output',port:0,native_index:0,port_guid:'port',opening_operation_id:'opening'};
 const sources=javascriptOutputColumns.map((c,i)=>({...c,record_id:'s'+i,field_id:'f'+i,required:false}));
 if(foreignSource)sources[0].label='foreign';
 const mapping={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'DerivedDataSourceOutputSocketWizard',
  autosync:true,source_fields:sources,target_fields:sources.map((s,i)=>({...s,record_id:'t'+i,source:s,index:i,excluded:false,inherited:false}))};
 let phase=0,cleanup=false,opened=0,graphChecks=0,editorDispatched=false;
 const state=()=>({prepared_node_context:{...reference,verified:true,surface:phase===2?'graph':'wizard',locked:false,
   ...(phase!==2?{output_port:{...port,...(cleanup&&foreignCleanup?{opening_operation_id:'foreign'}:{})}}:{})},
  wizard:phase===2?{status:'absent'}:{status:'observed',stage:'output_mapping',root_tid:'W',root_ref:'root',
   port_context:{status:'observed',kind:'output_data',node:{ref:'node'},port:{ref:'port'}},
   output_columns:{page:{status:'complete_definition_page',schema_id:'schema',offset:0,limit:8,total_columns:2,returned:2,next_offset:null},
    fields:mapping.target_fields.map((f,i)=>({...f,status:'observed',name_ref:'name'+i,label_ref:'label'+i,row_ref:'row'+i,usage:'Не задано'}))}},node_mapping:mapping,
  ui:{masks:phase===1?[{kind:'modal_background',ref:'root'}]:[],dialogs:phase===1?[{ref:'dialog',title:'Подтвердить',text:'Подтвердить Вы действительно хотите закрыть мастер настройки? Да Нет'}]:[],
   elements:[...sources.map((f,i)=>({ref:'name'+i,output_column:{name:f.name,label:f.label,type:f.type,row_ref:'row'+i,index:i,wizard_root_ref:'root'},allowed_actions:['double_click']})),{tid:'W;btnClose',ref:'close',allowed_actions:['click']},...['yes','no'].map(name=>({tid:'msgbox;tlb;'+name,ref:name,label:name==='yes'?'Да':'Нет',signature:{dialog_ref:'dialog'},allowed_actions:['click']}))]}});
 const channel={openOutputPort:async()=>{opened++;return {status:'SUCCEEDED',operation_id:'opening',output:{verified:true,...reference,...port}};},
  observe:async options=>{
   if(editorDispatched&&!cleanup)throw mutationError;
   const s=state();assert.ok(options.ready(s),options.condition);
   return structuredClone(s);
  },perform:async options=>{
   if(!cleanup){
    if(afterFirst){editorDispatched=true;return {status:'SUCCEEDED'};}
    throw mutationError??Error('Unexpected edit');
   }
   const s=state();assert.ok(options.ready(s));options.identity(s);const action=options.resolve(s);actions.push(action);
   if(action.ref==='close'){phase=1;if(lostClose)throw Error('Lost Close acknowledgement');}
   else if(action.ref==='yes')phase=2;
   else throw Error('Unexpected cleanup action');
   return {status:'SUCCEEDED'};
  }};
 return {reference,lifecycle,events,actions,mapping,channel,readState:state,get opened(){return opened;},get graphChecks(){return graphChecks;},
  run:()=>configureJavascriptManualMapping({reader:channel,reference,lifecycle,record:async r=>events.push(r),
   cleanupReader:deadline=>{assert.ok(deadline-Date.now()>55000&&deadline-Date.now()<=60000);cleanup=true;return channel;},
   verifyGraph:async()=>{graphChecks++;assert.equal(phase,2);if(graphError)throw graphError;}})};
}

test('private manual mapping adapts used flags and passes the actual shared source resolver',()=>{
 const {mapping,configured}=javascriptManualMappingRequest(),f=manualMappingFixture({foreignSource:false});
 assert.ok(configured.every(c=>c.used===true));assert.ok(javascriptOutputColumns.every(c=>c.used===undefined));
 const result=resolveConfiguredOutputMapping(mapping,configured,f.mapping);
 assert.deepEqual(result.fields.map(f=>[f.name,f.label]),[['ObservedID','ObservedID'],['ManualMarker','ManualMarker']]);
 assert.equal(result.autosync,false);
 assert.throws(()=>resolveConfiguredOutputMapping(mapping,javascriptOutputColumns,f.mapping),/Configured source/);
 for(const key of ['name','label','type']){
  const wrong=structuredClone(f.mapping);wrong.source_fields[0][key]='foreign';
  assert.throws(()=>resolveConfiguredOutputMapping(mapping,configured,wrong),/Configured source/);
 }
});

test('real shared pre-edit refusal closes only its original standalone wizard with native confirmation',async()=>{
 const f=manualMappingFixture();await assert.rejects(f.run(),/Configured source/);
 assert.equal(f.opened,1);assert.equal(f.lifecycle.attempts,0);assert.equal(f.lifecycle.closed,true);assert.equal(f.graphChecks,1);
 assert.deepEqual(f.actions.map(a=>a.ref),['close','yes']);
 assert.equal(f.events.at(-1).phase,'manual_mapping_refusal_cleanup_verified');
 await assert.rejects(f.run(),/no replay/);assert.equal(f.actions.length,2);assert.equal(f.opened,1);
});

for(const option of ['foreignCleanup','lostClose'])test('manual mapping refusal never closes foreign ownership or replays unknown Close: '+option,async()=>{
 const f=manualMappingFixture({[option]:true});await assert.rejects(f.run(),option==='foreignCleanup'?/opening changed/:/Lost Close/);
 assert.notEqual(f.lifecycle.closed,true);assert.equal(f.graphChecks,0);
 assert.equal(f.actions.length,option==='foreignCleanup'?0:1);
 await assert.rejects(f.run(),/no replay/);assert.equal(f.opened,1);
});

for(const kind of ['safe_refusal','ambiguous','unsafe_refusal','lost_reply'])test('manual mapping first editor dispatch preserves effect uncertainty: '+kind,async()=>{
 const mutationError=kind==='lost_reply'?Error('Lost editor acknowledgement'):new NodeProcedureStepError({
  status:kind==='ambiguous'?'AMBIGUOUS':'REFUSED',effect_possible:kind!=='safe_refusal',cleanup_complete:kind==='safe_refusal'});
 const f=manualMappingFixture({foreignSource:false,mutationError});
 await assert.rejects(f.run(),e=>e===mutationError);
 assert.equal(f.lifecycle.attempts,kind==='safe_refusal'?0:1);
 assert.equal(f.lifecycle.closed===true,kind==='safe_refusal');
 assert.equal(f.actions.length,kind==='safe_refusal'?2:0);
 assert.equal(f.graphChecks,kind==='safe_refusal'?1:0);
 await assert.rejects(f.run(),/no replay/);assert.equal(f.opened,1);
});

test('manual mapping prior successful editor dispatch forbids cleanup after a later safe refusal',async()=>{
 const mutationError=new NodeProcedureStepError({status:'REFUSED',effect_possible:false,cleanup_complete:true});
 const f=manualMappingFixture({foreignSource:false,mutationError,afterFirst:true});
 await assert.rejects(f.run(),e=>e===mutationError);
 assert.equal(f.lifecycle.attempts,1);assert.equal(f.actions.length,0);assert.equal(f.graphChecks,0);
 assert.notEqual(f.lifecycle.closed,true);await assert.rejects(f.run(),/no replay/);
});

test('manual mapping cleanup requires unchanged native graph after confirmed Close',async()=>{
 const graphError=Error('Native graph changed'),f=manualMappingFixture({graphError});
 await assert.rejects(f.run(),e=>e===graphError);
 assert.deepEqual(f.actions.map(a=>a.ref),['close','yes']);assert.equal(f.graphChecks,1);
 assert.notEqual(f.lifecycle.closed,true);await assert.rejects(f.run(),/no replay/);
 assert.equal(f.actions.length,2);
});

test('production manual mapping binds full prepared identity and retains unresolved cleanup ownership',async()=>{
 const source=await readFile(new URL('./javascript-execution-runtime.mjs',import.meta.url),'utf8');
 const start=source.indexOf('    async prepareManualMapping('),end=source.indexOf('    async readPortMapping(',start);
 assert.ok(start>0&&end>start);
 for(const closed of [false,true]){
  const steps=[],node={node_id:'js'},native={dispose:async()=>steps.push('dispose')},error=Error('mapping refusal');
  const realm={pendingMapping:undefined,graph:async()=>({}),requireJavascriptTopology:()=>{},
   page:{evaluateHandle:async()=>native},captureJavascriptNativeTopology:()=>{},channel:()=>({}),
   prepared:{document_id:'doc',workflow_ref:{workflow_id:'flow'}},record:async()=>{},
   configureJavascriptManualMapping:async args=>{
    assert.deepEqual(JSON.parse(JSON.stringify(args.reference)),{document_id:'doc',workflow_id:'flow',node_id:'js'});
    args.lifecycle.closed=closed;throw error;
   }};
  const operator=vm.runInNewContext('({'+source.slice(start,end)+'})',realm);
  await assert.rejects(operator.prepareManualMapping(node),e=>e===error);
  assert.equal(!!realm.pendingMapping,!closed);assert.deepEqual(steps,closed?['dispose']:[]);
  if(!closed)await assert.rejects(operator.prepareManualMapping(node),/Previous manual mapping/);
 }
});

// Batch51 journal1329: DataSetOutputSocketWizard, native-owned global
// EditColumnDefForm, PhaseMarker name/label, masks=[], one selected record.
// Keep only this public contract; raw journal and run-specific IDs stay private.
function manualEditorFixture(fault='none'){
 const f=manualMappingFixture({foreignSource:false}),observe=f.channel.observe,perform=f.channel.perform;
 const failure=Error('Editor observation refused'),gestures=[],draft={name:'PhaseMarker',label:'PhaseMarker'};let editor=false,cancelled=false;
 f.mapping.mapping_wizard='DataSetOutputSocketWizard';
 const row={...f.readState().wizard.output_columns.fields[1],selected:true};
 const state=()=>{
  const s=structuredClone(f.readState());
  if(editor){
   const selected={...row,...(fault==='foreign_row'?{row_ref:'foreign'}:{})};
   const params={status:'observed',portal_bound:fault!=='foreign_native',root_tid:'EditColumnDefForm',root_ref:'editor',selected_column:selected,
    fields:Object.fromEntries(Object.entries({...draft,type_label:'Строковый',data_kind:'Дискретный',usage:'Не задано'})
     .map(([k,value])=>[k,{status:'observed',value,truncated:false,input_ref:k}]))};
   if(fault==='changed_draft')params.fields.name.value='external change';
   s.wizard.column_parameters=params;s.ui.dialogs=[{ref:'editor',identity:{anchor_tid:'EditColumnDefForm'}}];
   if(fault==='foreign_dialog')s.ui.dialogs.push({ref:'other'});
   s.ui.elements.push(...['name','label'].map(k=>({ref:k,wizard_field:{scope:'output_column',name:k},allowed_actions:['set_wizard_field']})));
   s.ui.elements.push({ref:'apply-editor',column_close:{scope:'output'},allowed_actions:['apply_output_column']});
   s.ui.elements.push({ref:'cancel-editor',column_close:{scope:'output',mode:'cancel',root_ref:'editor',wizard_root_ref:'root',original_row:selected},allowed_actions:['cancel_output_column']});
  }
  return s;
 };
 f.channel.observe=async options=>{
  if(editor&&options.condition==='bound output field name editor'&&!['after_field','lost_apply','after_apply'].includes(fault))throw failure;
  if(editor&&options.condition==='bound output field label editor'&&fault==='after_field')throw failure;
  if(editor&&!options.condition.startsWith('original manual mapping')){
   const s=state();if(!options.ready(s))throw failure;return s;
  }
  if(!editor&&gestures.includes('apply_output_column'))throw failure;
  if(options.condition==='original manual mapping editor can be cancelled'){
   const s=state();if(!options.ready(s))throw Error('Editor owner refused');return s;
  }
  return observe(options);
 };
 f.channel.perform=async options=>{
  if(options.condition==='select the exact output field editor'){
   const s=state();assert.ok(options.ready(s));options.identity(s);const action=options.resolve(s);gestures.push(action.verb);editor=true;
   if(fault==='lost_open')throw Error('Lost editor opening reply');
   return {status:'SUCCEEDED',cleanup_complete:true,operation_id:'editor-open'};
  }
  if(options.condition.startsWith('set output field ')||options.condition==='apply the bound output field changes'){
   const s=state();assert.ok(options.ready(s));options.identity(s);const action=options.resolve(s);gestures.push(action.verb);
   if(action.verb==='set_wizard_field')draft[action.ref]=action.text;
   else {editor=false;if(fault==='lost_apply')throw Error('Lost Apply reply');}
   return {status:'SUCCEEDED',cleanup_complete:true,operation_id:'editor-edit'};
  }
  if(options.condition==='cancel the original manual mapping field editor'){
   const s=state();assert.ok(options.ready(s));options.identity(s);const action=options.resolve(s);assert.equal(action.verb,'cancel_output_column');gestures.push(action.verb);
   editor=false;cancelled=true;
   if(fault==='lost_cancel')throw Error('Lost Cancel reply');
   if(fault==='mapping_changed')f.mapping.target_fields[1].label='changed';
   return {status:'SUCCEEDED',cleanup_complete:true,operation_id:'editor-cancel'};
  }
  return perform(options);
 };
 return {...f,failure,gestures,get cancelled(){return cancelled;}};
}

test('shared manual mapping cancels its confirmed first editor then proves unchanged mapping and graph',async()=>{
 const f=manualEditorFixture();await assert.rejects(f.run(),e=>e===f.failure);
 assert.deepEqual(f.gestures,['double_click','cancel_output_column']);assert.deepEqual(f.actions.map(a=>a.ref),['close','yes']);
 assert.equal(f.lifecycle.closed,true);assert.ok(f.events.some(r=>r.phase==='manual_mapping_editor_cancel_verified'));
 await assert.rejects(f.run(),/no replay/);assert.equal(f.gestures.length,2);
});

for(const fault of ['foreign_native','foreign_row','foreign_dialog','changed_draft','lost_open','lost_cancel','mapping_changed'])
 test('manual editor cleanup refuses changed owners or unknown effects: '+fault,async()=>{
  const f=manualEditorFixture(fault);await assert.rejects(f.run());
  assert.notEqual(f.lifecycle.closed,true);assert.equal(f.actions.length,0);
  assert.deepEqual(f.gestures,['double_click',...(['lost_cancel','mapping_changed'].includes(fault)?['cancel_output_column']:[])]);
  await assert.rejects(f.run(),/no replay/);
 });

for(const fault of ['after_field','lost_apply','after_apply'])test('manual editor cleanup never discards or replays a later possible edit: '+fault,async()=>{
 const f=manualEditorFixture(fault);await assert.rejects(f.run());
 assert.ok(f.lifecycle.attempts>1);assert.notEqual(f.lifecycle.closed,true);
 assert.equal(f.actions.length,0);assert.equal(f.gestures.includes('cancel_output_column'),false);
 assert.deepEqual(f.gestures,fault==='after_field'?['double_click','set_wizard_field']:['double_click','set_wizard_field','set_wizard_field','apply_output_column']);
 await assert.rejects(f.run(),/no replay/);
});

test('private selection DOM refusal explains replacement without replay',async()=>{
 const f=privateSelectionFixture('dom');
 await assert.rejects(f.run(),error=>{
  const proof=JSON.parse(error.message.split('Private selection DOM changed: ')[1]);
  assert.equal(proof.kind,'replacement');assert.equal(proof.after_gesture,false);
  assert.equal(proof.previous_connected,true);assert.equal(proof.replacements,0);
  return true;
 });
 assert.equal(f.clicks,0);assert.equal(f.disposed,1);
});
