import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeProcedure} from '../lib/node-procedure.mjs';

for(const fault of ['none','dropdown','record','owner','foreign_dialog','busy','unverified'])test('logistic normalizer modal ownership: '+fault,async()=>{
 const workflow={workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'flow',label:'Scenario'}]};
 const node={document_id:'doc',workflow_id:'wf',node_id:'logistic'},base=workflow.prefix+';WizrdMCF',editor=base+';ColumnsEditForm';
 const owner={...node,verified:true,surface:'wizard',tid:base};
 const native={verified:true,node_context:owner,kind:'normalization',selected:['x'],editor:{root_tid:editor,record_ids:['x'],norm_type:0}};
 const state={origin:'http://example.test',loginom_build:'7.4.2',workflow_ref:workflow,dom_epoch:{document:'dom',revision:1},prepared_node_context:owner,scan:{complete:true},
  wizard:{status:'observed',stage:'normalization',root_tid:base,root_ref:'wizard'},
  ui:{elements:[{tid:editor,ref:'editor'}],dialogs:[{ref:'editor',identity:{anchor_tid:editor}}],masks:[],truncated:{dialogs:false,masks:false}}};
 if(fault==='dropdown')state.ui.elements.push({tid:editor+';cbxNormType;boundlist',ref:'choices'});
 if(fault==='record')native.editor.record_ids=['foreign'];
 if(fault==='owner')native.node_context={...owner,node_id:'foreign'};
 if(fault==='foreign_dialog')state.ui.dialogs[0].identity.anchor_tid='Other;ColumnsEditForm';
 if(fault==='busy')state.ui.masks.push({kind:'busy',ref:'wizard',target_tid:base});
 if(fault==='unverified')native.verified=false;
 const roots=[];let clock=1;
 const channel=createNodeProcedure({operation:{id:'logistic',deadline:10000,action:{action_key:'node.apply',revision:'1'}},
  preparedNodeContext:{document_id:'doc',workflow_ref:workflow,node},targetOrigin:state.origin,targetBuild:state.loginom_build,
  now:()=>clock++,wait:async()=>{clock+=1000},record:async e=>structuredClone(e),execute:async code=>{
   if(code.includes('function readLogRegressionBrowser'))return structuredClone(native);
   if(!code.includes('"discover_roots":true'))roots.push(/"root_ref":"([^"]+)"/.exec(code)?.[1]);
   return {status:'SUCCEEDED',output:structuredClone(state)};
  }});
 const read=()=>channel.observe({condition:'owned logistic normalizer editor',readLogRegression:true,ready:()=>true,timeoutMs:2000});
 if(['none','dropdown'].includes(fault)){await read();assert.deepEqual(roots,[fault==='dropdown'?'choices':'editor']);}
 else await assert.rejects(read());
});
