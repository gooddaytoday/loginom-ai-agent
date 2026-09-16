import test from 'node:test';
import assert from 'node:assert/strict';
import {preparedGraphSelection} from '../lib/node-graph-selection.mjs';
const state=()=>({prepared_node_context:{verified:true,surface:'graph',tid:'Graph;Node'},ui:{elements:[
 {tid:'Graph;Node',ref:'body',graph_node:{part:'body'},allowed_actions:['click'],interaction:{state:'point_observed'}},
 {tid:'Graph;Node;Label;Label',ref:'label',graph_node:{part:'label'},allowed_actions:['click'],interaction:{state:'point_observed'}}]}});
test('selects the body when painted, otherwise its exact native label',()=>{
 const s=state();assert.deepEqual(preparedGraphSelection(s),{verb:'click',ref:'body'});
 s.ui.elements[0].interaction.state='point_not_observed';assert.deepEqual(preparedGraphSelection(s),{verb:'click',ref:'label'});
});
test('refuses foreign labels, overlays, duplicate references and changed surfaces',()=>{
 for(const mutate of [s=>s.ui.elements[1].tid='Graph;Other;Label;Label',s=>s.ui.elements[1].graph_node.part='settings',
 s=>s.ui.elements[1].interaction.state='point_not_observed',s=>s.ui.elements.push({...s.ui.elements[1]}),s=>s.prepared_node_context.surface='wizard']){
  const s=state();s.ui.elements[0].interaction.state='point_not_observed';mutate(s);assert.throws(()=>preparedGraphSelection(s));
 }
});
test('dismisses covered hover controls and observes the body before selecting again',async()=>{
 const {selectPreparedGraphNode}=await import('../lib/node-graph-selection.mjs');
 const s=state();s.ui.elements[0].interaction.state='point_not_observed';const actions=[];
 const channel={perform:async o=>{assert.equal(o.ready(o.initialObservation),true);actions.push(o.resolve(o.initialObservation));},
 observe:async o=>{const fresh=state();assert.equal(o.ready(fresh),true);return fresh;}};
 await selectPreparedGraphNode(channel,s,'select');assert.deepEqual(actions,[{verb:'click',ref:'label'},{verb:'click',ref:'body'}]);
});
test('uses the selection target resolved after an epoch refresh',async()=>{
 const {selectPreparedGraphNode}=await import('../lib/node-graph-selection.mjs');
 for(const [initialLabel,refreshedLabel] of [[false,true],[true,false]]){
  const initial=state(),fresh=state(),actions=[];let calls=0;
  if(initialLabel)initial.ui.elements[0].interaction.state='point_not_observed';
  if(refreshedLabel)fresh.ui.elements[0].interaction.state='point_not_observed';
  const channel={perform:async o=>{
   if(calls++===0){o.resolve(initial);actions.push(o.resolve(fresh));}
   else actions.push(o.resolve(state()));
  },observe:async o=>{const s=state();assert.equal(o.ready(s),true);return s;}};
  await selectPreparedGraphNode(channel,initial,'refresh');
  assert.deepEqual(actions.map(a=>a.ref),refreshedLabel?['label','body']:['body']);
 }
});

function replacement(){
 const node={verified:true,surface:'graph',locked:false,document_id:'doc',workflow_id:'flow',node_id:'guid',tid:'MF;TF-1;Graph;Source'};
 const element={ref:'old',tid:node.tid,scope:'graph',graph_node:{part:'body'},identity:{anchor_tid:node.tid,path:[]},signature:{tag:'g'},allowed_actions:['click'],interaction:{state:'point_observed'}};
 const observation={origin:'http://test',loginom_build:'7.4.2',workflow_ref:{workflow_id:'flow'},graph_identity:{status:'observed',native_prefix:'MF;TF-1;Graph;'},dom_epoch:{document:'dom'},prepared_node_context:node,scan:{complete:true},ui:{elements:[element],dialogs:[],masks:[],truncated:{dialogs:false,masks:false}}};
 const output=structuredClone(observation);output.ui.elements[0].ref='new';
 return {observation,receipt:{output},action:{verb:'click',ref:'old'}};
}
test('replacement proof retains the exact prepared source, not its display label alone',async()=>{
 const {isPreparedBodyReplacement}=await import('../lib/node-graph-selection.mjs');
 assert.equal(isPreparedBodyReplacement(replacement()),true);
 for(const mutate of [
  x=>x.receipt.output.prepared_node_context.node_id='other',x=>x.receipt.output.prepared_node_context.workflow_id='other',
  x=>x.receipt.output.prepared_node_context.document_id='other',x=>x.receipt.output.prepared_node_context.verified=false,
  x=>x.receipt.output.prepared_node_context.surface='wizard',x=>x.receipt.output.prepared_node_context.locked=true,
  x=>x.receipt.output.origin='foreign',x=>x.receipt.output.dom_epoch.document='other',x=>x.receipt.output.graph_identity.native_prefix='other',
  x=>x.receipt.output.ui.elements[0].ref='old',x=>x.receipt.output.ui.elements.push({...x.receipt.output.ui.elements[0]}),
  x=>x.receipt.output.ui.elements[0].tid='Other',x=>x.receipt.output.ui.elements[0].signature.tag='rect',
  x=>x.receipt.output.ui.elements[0].identity.path=[1],x=>x.receipt.output.ui.elements[0].graph_node.part='label',
  x=>x.receipt.output.ui.elements[0].interaction.state='point_not_observed',x=>x.receipt.output.ui.elements[0].allowed_actions=[],
  x=>x.receipt.output.ui.dialogs.push({}),x=>x.receipt.output.ui.masks.push({}),x=>x.receipt.output.ui.truncated.masks=true,
  x=>x.receipt.output.scan.complete=false,x=>x.action.verb='double_click',x=>x.action.ref='foreign',
 ]){const x=replacement();mutate(x);assert.equal(isPreparedBodyReplacement(x),false);}
});
test('body replacement recovery is opt-in for source selection',async()=>{
 const {selectPreparedGraphNode,isPreparedBodyReplacement}=await import('../lib/node-graph-selection.mjs');
 for(const enabled of [false,true]){
  const s=state();const channel={perform:async spec=>assert.equal(spec.refreshReplacedBody,enabled?isPreparedBodyReplacement:undefined)};
  await selectPreparedGraphNode(channel,s,'select',{refreshReplacedBody:enabled});
 }
});
