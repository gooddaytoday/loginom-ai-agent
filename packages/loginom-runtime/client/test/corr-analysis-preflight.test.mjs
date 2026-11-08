import test from 'node:test';
import assert from 'node:assert/strict';
import {createCorrAnalysisNodeSupport} from '../lib/corr-analysis-node.mjs';

function sourceFixture(mode,type){
 const node={document_id:'doc',workflow_id:'flow',node_id:'orders'},tid='MF;TF;Graph;Orders',root='MF;TF;ModelForm;PreviewWindow';
 const owner={...node,verified:true,surface:'graph',locked:false,tid};
 const port={index:0,native_index:0,port_guid:'orders-output',tid:tid+';Output_Data-0',active:true};
 const fields=[{name:'X',label:'X',type:'real'},{name:'Z',label:'Z',type}];
 const variable={direction:'input',kind:'variables',port:0,autosync:false,fields:[{source:{kind:'configured_field',name:'rate'}}]};
 const request={document_id:'doc',workflow_ref:{workflow_id:'flow',prefix:'MF;TF',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb',navigation_path:[{tid:'path',label:'Scenario'}]},target:{kind:'new',type:'transform.calculator'},
  inputs:[{source:node,output:0,input:0}],variable_inputs:[{source:{...node,node_id:'rate'},output:0,input:0,kind:'variables'}],mode:'expression',
  parameters:{expressions:[{target:{kind:'new'},name:'AmountRUB',label:'AmountRUB',type:'real',formula:'AmountUSD * Var.rate',replace:false}]},
  mappings:[variable,{direction:'output',port:0,autosync:false,fields:['Client','AmountUSD','AmountRUB'].map(name=>({source:{kind:'configured_field',name}}))}]};
 let preview=false,receipt;
 const events=[],operation={id:'calculate-rubles',action:{action_key:'node.apply',revision:'1.0.0'},deadline:Date.now()+5000,parameters:request};
 const state=()=>({origin:'https://example.test',loginom_build:'7.4.2',workflow_ref:request.workflow_ref,dom_epoch:{document:'doc'},
  prepared_node_context:owner,wizard:{status:'absent'},scan:{complete:true},
  nodes:[{node_ref:{workflow_ref:request.workflow_ref,node_label:'Orders'},bounding_box:{x:10,y:10,width:100,height:40},ports:[{tid:port.tid,ui_ref:'ui-port'}]}],
  ui:{masks:[],dialogs:preview?[{ref:'ui-preview',identity:{anchor_tid:root}}]:[],truncated:{elements:false,masks:false,dialogs:false},
   elements:preview?[{tid:root,ref:'ui-preview',allowed_actions:[]},{tid:root+';p.h;close',ref:'ui-close',allowed_actions:['click']}]
    :[{tid:port.tid,ref:'ui-port',kind:'port',allowed_actions:['click','press']}]} });
 const options={operation,onRecord:async r=>{events.push(r);return structuredClone(r);},
  receiptOptions:(id,action_key)=>{receipt={id,action_key};return {};},execute:async code=>{
   if(code.includes('browserReceipt')){
    if(code.includes('"key":"F3"'))preview=true;
    if(code.includes('"ref":"ui-close"'))preview=false;
    return {status:'SUCCEEDED',action_key:receipt.action_key,operation_id:receipt.id,effect_possible:true,cleanup_complete:true};
   }
   if(code.includes('readOutputContext'))return {verified:true,node_context:owner,ports:[port]};
   if(code.includes('readNodePreviewSchema'))return {verified:true,inventory_complete:true,settings_changed:false,fields,root_tid:root,
    port:0,port_guid:port.port_guid,node_id:node.node_id,node_context:owner};
   return {status:'SUCCEEDED',output:structuredClone(state())};
  }};
 request.target.type='research.corr_analysis';request.mode=mode;request.parameters={first_set:['X'],second_set:['Z']};request.mappings=[];
 const config={targetOrigin:'https://example.test',targetBuild:'7.4.2'};
 return {request,variable,fields,events,options,config,run:()=>createCorrAnalysisNodeSupport(config).nodeApplyDriverFactory(options).beforeTarget({}),get preview(){return preview;}};
}


for(const mode of ['pearson','spearman','kendall'])for(const type of ['integer','real','string','boolean','datetime','variant'])
 test(mode+' preflight validates '+type+' before target creation and closes the source preview',async()=>{
 const f=sourceFixture(mode,type);
 assert.equal(typeof createCorrAnalysisNodeSupport(f.config).nodeApplyDriverFactory,'function');
 const supported=['integer','real'].includes(type)||type==='string'&&mode!=='pearson';
 if(supported)assert.equal((await f.run()).parameters_valid,true);
 else await assert.rejects(f.run(),error=>error.message.includes(mode)&&error.message.includes('Z ('+type+')')
  &&error.nodePhaseRefusal.phase==='target'&&error.nodePhaseRefusal.status==='NOT_APPLIED'
  &&error.nodePhaseRefusal.effect_possible===false&&error.nodePhaseRefusal.cleanup_complete===true);
 assert.equal(f.preview,false);
 assert.equal(f.events.at(-1).phase,'corr_analysis_preflight_completed');
 assert.equal(f.events.at(-1).proof.parameters_valid,supported);
 assert.equal(f.events.some(e=>e.phase==='node_target_effect_prepared'),false);
});
