import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeProcedure} from '../lib/node-procedure.mjs';

for(const direction of ['input','output'])for(const changed of [false,true])test('offscreen '+direction+' port uses guarded reveal before opening; graph changed: '+changed,async()=>{
 const workflow_ref={workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'flow',label:'Scenario'}]};
 const binding={document_id:'doc',workflow_ref,node:{document_id:'doc',workflow_id:'flow',node_id:'node'}};
 const graph={complete:true,interaction_ready:true,nodes:[{ref:binding.node,locked:false,position:{x:1400,y:100},label:'Node'}],links:[]};
 let scale=1,outline=false;const calls=[];
 const state=()=>({origin:'http://example.test',loginom_build:'7.4.2',workflow_ref,dom_epoch:{document:'dom',revision:1},scan:{complete:true},
  prepared_node_context:{...binding.node,verified:true,surface:'graph',locked:false,tid:'MF;TF-1;Graph;Node'},wizard:{status:'absent'},
  ui:{elements:[{tid:'MF;TF-1;Graph;Node;'+(direction==='input'?'Input':'Output')+'_Data-0',interaction:{state:scale<.67?'point_observed':'outside_viewport'}}],masks:[],dialogs:[],truncated:{dialogs:false,masks:false}}});
 const zoom={count:async()=>1,isVisible:async()=>outline,getAttribute:async()=> 'Уменьшить масштаб',waitFor:async()=>{},
  click:async()=>{calls.push('zoom');scale/=1.1;if(changed)graph.nodes[0].label='foreign change';}};
 const page={evaluate:async()=>structuredClone(graph),waitForTimeout:async()=>{},locator:selector=>({
  count:async()=>1,isVisible:async()=>true,locator:()=>zoom,click:async()=>{outline=!outline;},
  evaluate:async()=>({x:0,y:0,width:1000,height:700,viewportWidth:1000,viewportHeight:800,scale,translate:{x:0,y:0},scroll:{x:0,y:0},
   node_bounds:{x:1400*scale,y:100*scale,width:80*scale,height:80*scale}})})};
 const channel=createNodeProcedure({operation:{id:'open',deadline:Date.now()+10000,action:{action_key:'node.apply',revision:'1'}},
  preparedNodeContext:binding,targetOrigin:'http://example.test',targetBuild:'7.4.2',record:async e=>e,wrapMutation:(code,r)=>({code,r}),
  execute:async code=>{
   if(typeof code==='string')return {status:'SUCCEEDED',output:state()};
   if(code.r.action_key==='node.viewport.reveal.internal'){calls.push('reveal');return Function('return ('+code.code+')')()(page);}
   calls.push('open');assert.ok(scale<.67);assert.equal(outline,false);
   return {status:'SUCCEEDED',operation_id:code.r.id,action_key:code.r.action_key,effect_possible:true,cleanup_complete:true,
    output:{...binding.node,verified:true,direction,port:0,opening_operation_id:code.r.id}};
  }});
 if(changed){await assert.rejects(channel.openPort(direction,0),/graph changed during navigation/);assert.equal(calls.includes('open'),false);}
 else {assert.equal((await channel.openPort(direction,0)).status,'SUCCEEDED');assert.equal(calls[0],'reveal');assert.equal(calls.at(-1),'open');assert.equal(calls.filter(c=>c==='open').length,1);}
});
