import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeProcedure} from '../lib/node-procedure.mjs';

for(const fault of ['none','field','selection','owner','missing_owner','unverified_owner','inventory','dialog'])test('DataToVar native factor observation preserves owner guards: '+fault,async()=>{
 const workflow_ref={workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'Scenario'}]};
 const base=workflow_ref.prefix+';WizrdMCF',tid=base+';FactorEditDialog',node={document_id:'doc',workflow_id:'wf',node_id:'aggregate'};
 const owner={...node,verified:true,surface:'wizard',tid:base};
 const native={verified:true,inventory_complete:true,node_context:owner,input_fields:[{record_id:'x',name:'X',role:'selected'}],fields:[{record_id:'x',name:'X',role:'selected'}],selections:{available:[],selected:['x']}};
 const state={origin:'http://example.test',loginom_build:'7.4.2',workflow_ref,dom_epoch:{document:'dom',revision:1},prepared_node_context:owner,scan:{complete:true},
  wizard:{status:'observed',stage:'datatovar',root_tid:base,root_ref:'wizard',factor_editor:{status:'rendered_factor_options',dialog_ref:'factor',selected_field:{status:'rendered_selected',field_key:'X'}}},
  ui:{elements:[{tid,ref:'factor'}],dialogs:[{ref:'factor',identity:{anchor_tid:tid}}],masks:[{kind:'modal_background',target_tid:base,ref:'wizard'}],truncated:{dialogs:false,masks:false}}};
 if(fault==='field')native.fields[0].name='other';
 if(fault==='selection')native.selections.selected=['other'];
 if(fault==='owner')native.node_context={...owner,node_id:'other'};
 if(fault==='missing_owner')delete native.node_context;
 if(fault==='unverified_owner')native.node_context={...owner,verified:false};
 if(fault==='inventory')native.inventory_complete=false;
 if(fault==='dialog')state.ui.dialogs[0].identity.anchor_tid='Other;FactorEditDialog';
 let clock=1,reads=0;const roots=[];
 const channel=createNodeProcedure({operation:{id:'aggregate',deadline:10000,action:{action_key:'node.apply',revision:'1'}},
  preparedNodeContext:{document_id:'doc',workflow_ref,node},targetOrigin:state.origin,targetBuild:state.loginom_build,
  now:()=>clock++,wait:async()=>{clock+=1000},record:async e=>structuredClone(e),execute:async code=>{
   if(code.includes('function readDataToVarBrowser')){reads++;return structuredClone(native);}
   if(!code.includes('"discover_roots":true'))roots.push(/"root_ref":"([^"]+)"/.exec(code)?.[1]);
   return {status:'SUCCEEDED',output:structuredClone(state)};
  }});
 const read=()=>channel.observe({condition:'owned DataToVar factor',readDataToVar:true,ready:s=>s.node_datatovar?.verified===true,timeoutMs:2000});
 if(fault==='none'){await read();assert.ok(reads>0);assert.ok(roots.length&&roots.every(r=>r==='factor'));}
 else await assert.rejects(read());
});
