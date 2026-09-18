import test from 'node:test';
import assert from 'node:assert/strict';
import {rebindNodeTargetLinkEpochs} from '../lib/executor.mjs';
const graph=()=>({complete:true,document_id:'doc',workflow_ref:{workflow_id:'wf'},dom_epoch:1,interaction_ready:true,foreign_links:[],nodes:[{ref:{node_id:'a'},label:'A',type:'calc',position:{x:64,y:64},inputs:[0],outputs:[0],dom_epoch:2},{ref:{node_id:'b'},label:'B',type:'sort',position:{x:256,y:64},inputs:[0],outputs:[0],dom_epoch:3}],links:[]});
test('late hover repaint can rebind only after a complete unchanged graph proof',()=>{
 const before=graph(),after=graph();after.nodes[0].dom_epoch=4;after.nodes[1].dom_epoch=5;
 const context={graph_baseline:before,nodes:[{id:'a',tid:'A',dom_epoch:2},{id:'b',tid:'B',dom_epoch:3}]};
 assert.deepEqual(rebindNodeTargetLinkEpochs(context,after),[{id:'a',tid:'A',dom_epoch:4},{id:'b',tid:'B',dom_epoch:5}]);assert.equal(context.nodes[0].dom_epoch,2);
});
for(const [name,change] of Object.entries({incomplete:g=>g.complete=false,document:g=>g.document_id='other',workflow:g=>g.workflow_ref.workflow_id='other',container:g=>g.dom_epoch++,position:g=>g.nodes[0].position.x++,label:g=>g.nodes[0].label='other',type:g=>g.nodes[0].type='other',input:g=>g.nodes[0].inputs=[],output:g=>g.nodes[0].outputs=[],identity:g=>g.nodes[0].ref.node_id='other',extra:g=>g.nodes.push({...g.nodes[0]}),link:g=>g.links.push({source:'a',target:'b'}),foreign:g=>g.foreign_links.push('other'),busy:g=>g.interaction_ready=false}))test('late hover graph rebinding refuses '+name,()=>{
 const before=graph(),after=graph();change(after);assert.throws(()=>rebindNodeTargetLinkEpochs({graph_baseline:before,nodes:[{id:'a',tid:'A',dom_epoch:2}]},after));
});
