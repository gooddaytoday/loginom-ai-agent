import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeProcedure} from '../lib/node-procedure.mjs';

test('DataPartition epoch retry retains its native observation before a second gesture',async()=>{
 const node={document_id:'doc',workflow_id:'wf',node_id:'node'};
 const workflow={workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'workflow'}]};
 const context={verified:true,...node,surface:'wizard',tid:'MF;TF-1;WizrdMCF'};
 const state={origin:'http://example.test',loginom_build:'7.4.2',workflow_ref:workflow,dom_epoch:{document:'doc'},prepared_node_context:context,scan:{complete:true},
  wizard:{status:'observed',stage:'data_partition',root_ref:'wizard',root_tid:context.tid},
  ui:{masks:[],dialogs:[],truncated:{dialogs:false,masks:false},elements:[{ref:'ui-size-unit',kind:'button',allowed_actions:['click']}]}};
 const events=[];let mutations=0,nativeReads=0;
 const operation={id:'partition-retry',action:{action_key:'node.apply',revision:'1'},deadline:10000};
 const channel=createNodeProcedure({operation,preparedNodeContext:{document_id:'doc',workflow_ref:workflow,node},targetOrigin:state.origin,targetBuild:state.loginom_build,
  now:()=>1,wait:async()=>{},record:async event=>{events.push(event);return structuredClone(event);},wrapMutation:(code,reference)=>({reference}),
  execute:async code=>{
   if(typeof code==='string'){
    if(code.includes('function readDataPartitionBrowser')){nativeReads++;return {verified:true,node_context:context,mode:'random'};}
    return {status:'SUCCEEDED',output:structuredClone(state)};
   }
   mutations++;
   return {operation_id:code.reference.id,action_key:'ui.act',status:mutations===1?'NOT_APPLIED':'SUCCEEDED',phase:mutations===1?'preconditions':'completed',cleanup_complete:true,effect_possible:mutations!==1,error:mutations===1?{code:'UI_EPOCH_CHANGED'}:null,trace:[]};
  }});
 const ready=s=>s.node_data_partition?.verified===true&&s.node_data_partition.mode==='random';
 const before=await channel.observe({condition:'native partition owned',readDataPartition:true,ready});
 await channel.perform({condition:'switch partition unit',initialObservation:before,ready,identity:s=>s.prepared_node_context,resolve:s=>({verb:'click',ref:s.ui.elements[0].ref})});
 assert.equal(mutations,2);assert.equal(nativeReads,2);
 assert.equal(events.filter(e=>e.phase==='node_step_refresh_authorized').length,1);
 assert.equal(events.find(e=>e.phase==='node_step_refresh_authorized').effect_possible,false);
});
