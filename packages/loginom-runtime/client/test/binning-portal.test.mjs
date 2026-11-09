import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeProcedure} from '../lib/node-procedure.mjs';

function fixture({stage='binning',duplicate=false,tid='MethodSettingFrame;cbbSDBinsMode;ValueControl;boundlist'}={}){
 const workflow_ref={workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'flow',label:'Scenario'}]};
 const binding={document_id:'doc',workflow_ref,node:{document_id:'doc',workflow_id:'flow',node_id:'binning'}};
 const node={...binding.node,verified:true,surface:'wizard'};
 const state={origin:'http://example.test',loginom_build:'7.4.2',workflow_ref,dom_epoch:{document:'dom',revision:1},prepared_node_context:node,scan:{complete:true},
  wizard:{status:'observed',stage,root_tid:'MF;TF-1;WizrdMCF',root_ref:'wizard'},
  ui:{elements:[{tid,ref:'sd-options'},...(duplicate?[{tid,ref:'foreign-options'}]:[])],masks:[],dialogs:[],truncated:{dialogs:false,masks:false}}};
 const roots=[];
 const channel=createNodeProcedure({operation:{id:'sd-portal',deadline:10000,action:{action_key:'node.apply',revision:'1'}},preparedNodeContext:binding,targetOrigin:state.origin,targetBuild:state.loginom_build,
  now:()=>1,wait:async()=>{},record:async e=>structuredClone(e),execute:async code=>{
   if(code.includes('function workspaceUiCapability')){
    if(!code.includes('"discover_roots":true'))roots.push(/"root_ref":"([^"]+)"/.exec(code)?.[1]);
    return {status:'SUCCEEDED',output:structuredClone(state)};
   }
   return {verified:true,node_context:node};
  }});
 return {roots,read:readBinning=>channel.observe({condition:'owned SD options',readBinning,ready:()=>true})};
}
test('Binning observes its external SD options through their own bounded root',async()=>{
 const f=fixture();await f.read(true);assert.equal(f.roots.at(-1),'sd-options');
 await f.read(false);assert.equal(f.roots.at(-1),'wizard');
});
test('SD portal registration stays limited to Binning and the exact coefficient list',async()=>{
 for(const options of [{stage:'calculator'},{tid:'ForeignFrame;cbbSDBinsMode;ValueControl;boundlist'},{tid:'MethodSettingFrame;cbbMatchingObservationsMode;ValueControl;boundlist'}]){
  const f=fixture(options);await f.read(true);assert.equal(f.roots.at(-1),'wizard');
 }
});
test('duplicate SD portals remain ambiguous instead of selecting the first',async()=>{
 const f=fixture({duplicate:true});await assert.rejects(f.read(true),/dropdown owner is ambiguous/);
});
