import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeProcedure} from '../lib/node-procedure.mjs';

// LAB-764 biased-run-1: the owned FactorEditDialog was refused as a foreign
// modal before the sampling cache could be read by the ordinary observation.
for(const stage of ['sampling','data_partition'])for(const fault of ['none','method','field','category','owner','duplicate','dialog','unverified','inventory'])
test(`${stage} biased factor dialog requires native method, field, category and owner: ${fault}`,async()=>{
 const workflow_ref={workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'Scenario'}]};
 const base=workflow_ref.prefix+';WizrdMCF',tid=base+';FactorEditDialog',node={document_id:'doc',workflow_id:'wf',node_id:'sample'};
 const owner={...node,verified:true,surface:'wizard',tid:base};
 const native={verified:true,inventory_complete:true,kind:stage,method:'Отбор со смещением',node_context:owner,
  bias_fields:{verified:true,rows:[{selected:true,values:{Name:'Class'}}]},bias:{verified:true,rows:[{selected:true,values:{Value:'A',Factor:1}}]}};
 const state={origin:'http://example.test',loginom_build:'7.4.2',workflow_ref,dom_epoch:{document:'dom',revision:1},prepared_node_context:owner,scan:{complete:true},
  wizard:{status:'observed',stage,root_tid:base,root_ref:'wizard'},
  ui:{elements:[{tid,ref:'factor'}],dialogs:[{ref:'factor',identity:{anchor_tid:tid}}],
   masks:[{kind:'modal_background',target_tid:base,ref:'wizard'}],truncated:{dialogs:false,masks:false}}};
 if(fault==='method')native.method='Случайный';
 if(fault==='field')native.bias_fields.rows[0].selected=false;
 if(fault==='category')native.bias.rows[0].selected=false;
 if(fault==='owner')native.node_context={...owner,node_id:'foreign'};
 if(fault==='duplicate')state.ui.elements.push({tid,ref:'other'});
 if(fault==='dialog')state.ui.dialogs[0].identity.anchor_tid='Other;FactorEditDialog';
 if(fault==='unverified')native.verified=false;
 if(fault==='inventory')native.inventory_complete=false;
 const roots=[];let clock=1;
 const channel=createNodeProcedure({operation:{id:'bias',deadline:10000,action:{action_key:'node.apply',revision:'1'}},
  preparedNodeContext:{document_id:'doc',workflow_ref,node},targetOrigin:state.origin,targetBuild:state.loginom_build,
  now:()=>clock++,wait:async()=>{clock+=1000},record:async e=>structuredClone(e),execute:async code=>{
   if(code.includes('function readSamplingBrowser'))return structuredClone(native);
   if(!code.includes('"discover_roots":true'))roots.push(/"root_ref":"([^"]+)"/.exec(code)?.[1]);
   return {status:'SUCCEEDED',output:structuredClone(state)};
  }});
 const read=()=>channel.observe({condition:'owned biased factor',readSampling:true,ready:()=>true,timeoutMs:2000});
 if(fault==='none'){await read();assert.ok(roots.length&&roots.every(r=>r==='factor'));}
 else await assert.rejects(read());
});
