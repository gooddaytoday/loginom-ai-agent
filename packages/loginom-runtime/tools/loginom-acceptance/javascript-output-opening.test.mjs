import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {openJavascriptOutputViews,waitJavascriptViewsSettlement} from './javascript-output-opening.mjs';
import {selectJavascriptForSettings,returnJavascriptViewsForCleanup} from './javascript-execution-runtime.mjs';
import {openNewOutputTable} from '../../client/lib/node-output-procedure.mjs';

function fixture(fault='none') {
  const ref={document_id:'doc',workflow_id:'workflow',node_id:'js'},node={id:'js',tid:'MF;TF-1;Graph;JavaScript'};
  let selected=['toolbar_absent','materialization_lost','materialization_stalled','replacement','already'].includes(fault),hovered=!['toolbar_absent','materialization_lost','materialization_stalled','replacement'].includes(fault),active=fault!=='inactive',views=false,added=false,entered=false,vendor=false;
  const clicks=[],moves=[],actions=[],records=[];let settled=false;
  const prepared={document_id:ref.document_id,node:ref,workflow_ref:{workflow_id:ref.workflow_id,prefix:'MF;TF-1',tab_tid:'tab',navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_0',label:'Workflow'}]}};
  const element=(tid,x)=>({isConnected:true,getAttribute:k=>k==='data-tid'?tid:null,
    getBoundingClientRect:()=>({x,y:100,width:80,height:80}),contains(other){return other===this;},
    closest(selector){return selector==='[data-tid]'?this:null;}});
  let body=element(node.tid,100);const portElement=element(node.tid+';Output_Data-0',50),visualizer=element(node.tid+';Visualizers',220),overlay=element(node.tid+';Execute',220);
  visualizer.getBoundingClientRect=()=>({x:220,y:100,width:hovered?80:0,height:80});
  const native={FGuid:'js',FIconCls:'bg-vendor-icon-javascript',FCell:{},data:{}},port={FGuid:'port',data:{},FCell:{parent:native.FCell},parent:native};
  native.FPorts=[{FCollection:[port]}];
  portElement.querySelectorAll=()=>[{getAttribute:k=>k==='href'?(active?'output_table_active.svg':'output_table_inactive.svg'):null}];
  const container={contains:e=>[body,portElement,visualizer].includes(e),querySelectorAll:()=>[body,portElement,...(selected&&hovered?[visualizer]:[])]};
  const graph={container,getSelectionCells:()=>selected?[native.FCell]:[],view:{getState:cell=>({shape:{node:cell===native.FCell?body:portElement}})}};
  const diagram={FNodes:{FCollection:[native]},FmxGraph:graph},model={FDiagram:diagram},controller={FController:model,Node:{data:{node:{}}}},tab={Controller:controller};
  const packageNode={},workflow=controller.Node.data.node;workflow.ParentNode=packageNode;
  class ModelNodeTreeNode {constructor(){this.ParentNode=workflow;this.FGuid='js';this.FModelNode=native.data;}}
  const viewRoot=element('MF;TF-1;ViewsForm',0),panel=element('MF;TF-1;ViewsForm;cntPorts;port',0);
  class ViewsForm {constructor(){this.FModelNode=native.data;this.FView={el:{dom:viewRoot}};this.FPortList={port:{Type:0,Panel:{el:{dom:panel}}}};}}
  const viewNode=new ModelNodeTreeNode(),viewModel=new ViewsForm(),viewTab={Controller:{Node:{data:{node:viewNode}},FController:viewModel}};
  const tabElement={classList:{contains:()=>true}},crumb={getAttribute:()=>prepared.workflow_ref.navigation_path[0].tid,textContent:'Workflow'};
  container.isConnected=true;container.getBoundingClientRect=()=>({width:500,height:500});
  const document={querySelectorAll:selector=>{
    if(selector==='[data-tid="tab"]')return [tabElement];
    if(selector.startsWith('[data-tid^='))return views&&!settled?[]:[crumb];
    if(selector==='[data-tid="MF;TF-1;ViewsForm"]')return views&&settled?[viewRoot]:[];
    if(selector==='[data-tid="MF;TF-1;ViewsForm;cntPorts;port"]')return views&&settled?[panel]:[];
    return [];
  },elementFromPoint:(x)=>x>=220?(fault==='overlay'?overlay:visualizer):body};
  const binding={document,tab,controller,model,diagram,graph,container,native,cell:native.FCell,workflow:controller.Node.data.node,nodeData:native.data};
  const realm=vm.createContext({document,location:{origin:'http://logi-test-plan.bg.local'},innerWidth:1000,innerHeight:800,getComputedStyle:()=>({visibility:'visible'}),
    __loginomDockPreparationV1:{document,id:'doc',receipts:new Map([['r',{phase:'verified',workflowId:'workflow',tab:tabElement,packageNode,nodeTargetWorkflowNode:workflow}]])},
    bg:{app:{ModelNodeTreeNode,Version:'7.4.2',Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>views&&settled?viewTab:tab}}}}}}}});
  const invoke=(fn,arg)=>vm.runInContext('('+fn.toString()+')',realm)(arg);
  const page={evaluate:async(fn,arg)=>invoke(fn,arg),evaluateHandle:async(fn,arg)=>Object.assign(invoke(fn,arg),{dispose:async()=>{}}),
    waitForFunction:async(fn,arg,o)=>{assert.ok(o.timeout>0&&o.timeout<=5000);if(fn.name==='inspectJavascriptViewsSettlement'){
      assert.equal(invoke(fn,arg),false);
      if(fault!=='transition_stalled')settled=true;
      if(fault==='foreign_native_views')viewNode.FGuid='foreign';
      if(fault==='foreign_native_port')viewModel.FPortList.port.Panel.el.dom={};
      if(fault==='original_node_drift')native.data={};
    }
    if(!invoke(fn,arg))throw Error('Bounded readiness timeout');return {dispose:async()=>{}};},
    mouse:{move:async(x,y)=>{moves.push({x,y});hovered=true;},click:async(x)=>{
      if(x<220){
        clicks.push('body');selected=true;
        if(fault!=='materialization_stalled')hovered=true;
        if(fault==='replacement'){body.isConnected=false;body=element(node.tid,100);}
        if(fault==='materialization_lost')throw Error('Lost materialization response');
        return;
      }
      clicks.push('views');views=true;if(fault==='lost')throw Error('Lost opening response');
    }}};
  const output=()=>({index:0,native_index:0,active,port_guid:'port'});
  const control=(ref,extra={})=>({ref,tid:ref,allowed_actions:['click'],interaction:{state:'point_observed'},...extra});
  const state=()=>({prepared_node_context:{verified:true,...ref,surface:views?'views':'graph',tid:node.tid},
    node_outputs:{verified:true,surface:views?'views':'graph',node_selected:selected,ports:[output()],port_panels:[{port_guid:fault==='foreign_views'?'foreign':'port'}],
      tables:added?[{view_guid:'table',port_guid:'port',active:entered,table_tid:entered?'table-tid':null}]:[]},
    ui:{elements:views?[control('vendor',{viewer_vendor:{kind:'table',selected:vendor}}),
      control('add',{viewer_card:{kind:'add',port_guid:'port'}}),
      ...(added?[control('enter',{allowed_actions:['enter_table'],viewer_card:{kind:'enter',port_guid:'port',view_guid:'table'}})]:[])]:[
        control(node.tid,{allowed_actions:[],graph_node:{part:'body'}}),
        control(node.tid+';Visualizers',{allowed_actions:fault==='shared'?['open_node_views']:[]})]}});
  const channel={observe:async o=>{const s=state();assert.equal(o.ready(s),true,o.condition);return s;},perform:async o=>{
    const s=state();assert.equal(o.ready(s),true,o.condition);const action=o.resolve(s);actions.push(action);
    assert.ok(['click','open_node_views','enter_table'].includes(action.verb));
    if(action.verb==='open_node_views'){views=true;return;}
    if(action.ref==='vendor'){vendor=true;return;}
    if(action.ref==='add'){added=true;return;}
    if(action.ref==='enter'){entered=true;return;}
    assert.fail('Unexpected action '+JSON.stringify(action));
  }};
  const record=async event=>{records.push(event);
    if(event.phase==='javascript_private_selection_dispatch'&&fault==='inactive_preselection')active=false;
    if(event.phase==='javascript_private_views_dispatch'){
      if(fault==='owner')native.data={};
      if(fault==='inactive_late')active=false;
      if(fault==='journal')throw Error('Journal unavailable');
    }
  };
  const run=()=>openNewOutputTable(channel,0,{openViews:({output})=>openJavascriptOutputViews(page,
    {binding,node,icon:'bg-vendor-icon-javascript',reference:ref,prepared,channel,output,deadline:Date.now()+5000,record,select:selectJavascriptForSettings})});
  return {run,settle:(options={})=>waitJavascriptViewsSettlement(page,{binding,held:{port,portData:port.data,portCell:port.FCell},prepared,output:output(),deadline:Date.now()+5000,record,...options}),clicks,moves,actions,records,get added(){return added;}};
}

test('private JS selection and opening reuse the normal Table reader without Execute',async()=>{
  const f=fixture(),result=await f.run();assert.equal(result.table.view_guid,'table');
  assert.deepEqual(f.clicks,['body','views']);assert.equal(f.moves.length,0);
  assert.deepEqual(f.actions.map(a=>a.ref),['vendor','add','enter']);
  assert.equal(f.records.filter(e=>e.phase==='javascript_private_views_dispatch').length,1);
});

test('selected JS with missing toolbar gets one body gesture; materialized controls need none',async()=>{
  for(const fault of ['already','toolbar_absent','replacement']){
    const f=fixture(fault);await f.run();assert.deepEqual(f.clicks,fault==='already'?['views']:['body','views']);
    assert.equal(f.moves.length,0);
    const before=f.records.find(e=>e.phase==='javascript_private_views_active_preselection');
    assert.equal(before.node_selected,true);assert.equal(before.control_count,fault==='already'?1:0);
  }
});

test('a genuinely admitted open_node_views uses the shared action after private selection',async()=>{
  const f=fixture('shared');await f.run();assert.deepEqual(f.clicks,['body']);
  assert.equal(f.actions[0].verb,'open_node_views');assert.equal(f.records.some(e=>e.phase==='javascript_private_views_dispatch'),false);
});

test('inactive output is refused before selection or view action',async()=>{
  const f=fixture('inactive');await assert.rejects(f.run(),/not active/);
  assert.deepEqual(f.clicks,[]);assert.deepEqual(f.moves,[]);assert.deepEqual(f.actions,[]);
});

test('owner drift, late deactivation, journal failure and interactive overlay never click Visualizers',async()=>{
  for(const fault of ['owner','inactive_late','inactive_preselection','journal','overlay']){
    const f=fixture(fault);await assert.rejects(f.run());
    assert.equal(f.clicks.filter(x=>x==='views').length,0);assert.equal(f.added,false);
    if(fault==='inactive_preselection')assert.deepEqual(f.clicks,[]);
  }
});

test('lost view opening is not repeated and foreign view port cannot receive a Table',async()=>{
  for(const fault of ['lost','foreign_views']){
    const f=fixture(fault);await assert.rejects(f.run());assert.deepEqual(f.clicks,['body','views']);
    assert.equal(f.added,false);assert.deepEqual(f.actions,[]);
  }
});


test('unknown materialization click never repeats; stalled toolbar includes bounded diagnostics',async()=>{
  for(const fault of ['materialization_lost','materialization_stalled']){
    const f=fixture(fault);await assert.rejects(f.run());
    assert.deepEqual(f.clicks,['body']);assert.equal(f.moves.length,0);assert.equal(f.added,false);
    const refusal=f.records.find(e=>e.phase==='javascript_private_views_materialization_refused');
    assert.equal(refusal.node_selected,true);assert.equal(refusal.native_selection_count,1);
    assert.equal(refusal.control_count,fault==='materialization_stalled'?0:1);
    assert.equal(refusal.control_visible,fault!=='materialization_stalled');
    assert.equal(refusal.active_port_verified,true);
    assert.equal(refusal.control_hit?.owner_tid??null,fault==='materialization_stalled'?null:'MF;TF-1;Graph;JavaScript;Visualizers');
    assert.ok(refusal.body_point);assert.equal(typeof refusal.reason,'string');assert.equal(typeof refusal.deadline,'number');
  }
});


test('returned Visualizers click waits for native views and exact port before any Table action',async()=>{
  const f=fixture();await f.run();
  const before=f.records.find(e=>e.phase==='javascript_views_settlement_before');
  const after=f.records.find(e=>e.phase==='javascript_views_settlement_verified');
  assert.equal(before.ready,false);assert.equal(before.navigation_count,0);
  assert.equal(after.ready,true);assert.equal(after.surface,'views');assert.equal(after.port_guid,'port');
  assert.equal(after.deadline,before.deadline);assert.equal(f.clicks.filter(c=>c==='views').length,1);
});

test('stalled transition and changed native owners refuse without another opening or Table effect',async()=>{
  for(const fault of ['transition_stalled','foreign_native_views','foreign_native_port','original_node_drift']){
    const f=fixture(fault);await assert.rejects(f.run());
    assert.deepEqual(f.clicks,['body','views']);assert.deepEqual(f.actions,[]);assert.equal(f.added,false);
    const refused=f.records.find(e=>e.phase==='javascript_views_settlement_refused');
    assert.ok(refused);assert.equal(f.records.some(e=>e.phase==='javascript_views_settlement_verified'),false);
  }
});

test('cleanup from owned views without Table returns once; uncertain return is never repeated',async()=>{
  for(const fault of ['none','lost','foreign']){
    const node={document_id:'doc',workflow_id:'workflow',node_id:'js'},path=[{tid:'workflow',label:'Workflow'}];
    let returned=false,gestures=0;const records=[];
    const state=()=>({prepared_node_context:{verified:true,...node,surface:returned?'graph':'views'},
      node_outputs:{verified:true,surface:returned?'graph':'views',port_panels:[{port_guid:fault==='foreign'?'other':'port'}],ports:[{port_guid:'port'}]},
      workflow_navigation:{status:'observed',path,control_ref:'parent',control_tid:'workflow'},navigation_context:{status:'observed',path},
      ui:{elements:[{ref:'parent',tid:'workflow',allowed_actions:['click']}]}});
    const channel={observe:async o=>{const s=state();if(!o.ready(s))throw Error('Unconfirmed owner');return s;},perform:async o=>{
      assert.ok(o.ready(state()));assert.deepEqual(o.resolve(state()),{verb:'click',ref:'parent'});
      gestures++;if(fault==='lost')throw Error('Lost return response');returned=true;
    }};
    const run=()=>returnJavascriptViewsForCleanup(channel,node,'port',async e=>records.push(e));
    if(fault==='none'){await run();assert.equal(records.at(-1).phase,'cleanup_views_return_verified');}
    else await assert.rejects(run());
    assert.equal(gestures,fault==='foreign'?0:1);
  }
});


test('read-only cleanup settlement accepts the unchanged graph, but never renews an expired deadline',async()=>{
 const f=fixture();const result=await f.settle({allowGraph:true});assert.equal(result.surface,'graph');assert.equal(result.ready,true);
 assert.deepEqual(f.clicks,[]);assert.deepEqual(f.actions,[]);
 await assert.rejects(f.settle({allowGraph:true,deadline:Date.now()-1}),/original deadline expired/);
 assert.deepEqual(f.clicks,[]);
});


test('cleanup never replays a prior uncertain normal Table return',async()=>{
 let reads=0,effects=0;
 const channel={observe:async()=>{reads++;},perform:async()=>{effects++;}};
 await assert.rejects(returnJavascriptViewsForCleanup(channel,{},'port',async()=>{},{returnAlreadyDispatched:true}),/already dispatched/);
 assert.equal(reads,0);assert.equal(effects,0);
});
