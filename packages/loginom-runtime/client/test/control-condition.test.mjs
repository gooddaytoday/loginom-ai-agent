import test from 'node:test';
import assert from 'node:assert/strict';
import {NODE_TYPES,validateNodeTargetRequest} from '../lib/node-contracts.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {isUnchangedTransformExecution} from '../lib/node-read-contract.mjs';
import {validateConditionParameters} from '../lib/control-condition-parameters.mjs';
import {conditionConfigurationReadback} from '../lib/control-condition-readback.mjs';
import {readConditionOutputs} from '../lib/control-condition-node.mjs';

const ref=node=>({document_id:'d',workflow_id:'w',node_id:node});
const workflow_ref={workflow_id:'w',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'x',label:'Сценарий'}]};
const ports={kind:'new',type:'control.condition'};
const existing={kind:'existing',type:'control.condition',ref:ref('c')};
const branch={name:'Detailed',variable:'Mode',operator:'=',value:1};
const request=(target,extra={})=>({document_id:'d',workflow_ref,target,inputs:[],finish:'done',...extra});

test('Condition registers an observed native type with a table input, two branch outputs and variables',()=>{
 const t=NODE_TYPES['control.condition'];
 assert.equal(t.icon_class,'bg-vendor-icon-condition');
 assert.equal(t.palette_group,'Управление');
 assert.deepEqual([t.tabular_inputs,t.tabular_outputs,t.variable_inputs,t.variable_outputs],[1,2,1,2]);
 assert.deepEqual(t.modes,['ports','variable_branch']);
 // An existing configured Condition accepts its table link at input 0 only.
 validateNodeTargetRequest({document_id:'d',workflow_ref,target:existing,inputs:[{source:ref('s'),output:0,input:0}]});
 assert.throws(()=>validateNodeTargetRequest({document_id:'d',workflow_ref,target:existing,inputs:[{source:ref('s'),output:0,input:1}]}),/does not exist/);
 const handler=createCandidateNodeSupport({}).nodeApplyHandlers.get('control.condition');
 assert.deepEqual(handler.modes,['ports','variable_branch']);
 assert.equal(handler.parameter_schema.properties.branches.maxItems,1);
});

test('ports creates the inputs of a new unlinked Condition only',()=>{
 validateConditionParameters({},'ports',request(ports));
 for(const [p,r,message] of [
  [{branches:[branch]},request(ports),/parameters \{\}/],
  [{},request(existing),/NEW Condition/],
  [{},request(ports,{inputs:[{source:ref('s'),output:0,input:0}]}),/no links yet/],
  [{},request(ports,{finish:'execute'}),/finish done/],
 ])assert.throws(()=>validateConditionParameters(p,'ports',r),message);
});

test('variable_branch accepts one variable equality branch and refuses unsupported shapes before mutation',()=>{
 const linked=request(existing,{finish:'execute',inputs:[{source:ref('t'),output:0,input:0}],variable_inputs:[{source:ref('v'),output:4,input:0,kind:'variables'}]});
 validateConditionParameters({branches:[branch]},'variable_branch',linked);
 validateConditionParameters({branches:[{...branch,value:'North'}]},'variable_branch',linked);
 for(const [p,message] of [
  [{branches:[branch,{...branch,name:'Second'}]},/exactly one user branch/],
  [{branches:[{...branch,operator:'>'}]},/only operator =/],
  [{branches:[{...branch,aggregation:'sum'}]},/branch name/],
  [{branches:[{...branch,name:'Иначе'}]},/not Иначе/],
  [{branches:[{...branch,value:true}]},/integer or single-line string/],
  [{branches:[branch],debug:'else'},/unsupported parameter/],
 ])assert.throws(()=>validateConditionParameters(p,'variable_branch',linked),message);
 assert.throws(()=>validateConditionParameters({branches:[branch]},'variable_branch',request(ports)),/existing Condition/);
 assert.throws(()=>validateConditionParameters({branches:[branch]},'variable_branch',{...linked,inputs:[{source:ref('t'),output:0,input:1}]}),/input 0/);
});

test('changing only upstream variables re-executes the saved Condition through the stock read lifecycle',()=>{
 const rerun={target:existing,finish:'execute',mode:'variable_branch',inputs:[],mappings:[],parameters:{}};
 assert.equal(isUnchangedTransformExecution(rerun),true);
 validateConditionParameters({},'variable_branch',rerun);
 assert.equal(isUnchangedTransformExecution({...rerun,parameters:{branches:[branch]}}),false);
 assert.equal(isUnchangedTransformExecution({...rerun,variable_inputs:[{source:ref('v'),output:4,input:0,kind:'variables'}]}),false);
});

const owner={verified:true,document_id:'d',workflow_id:'w',node_id:'c',surface:'wizard',tid:'MF;TF-1;WizrdMCF'};
const configuration={verified:true,mode:'variable_branch',node_context:owner,debug_mode:false,
 ports:[{index:0,kind:'table',name:'',label:'Порт1',pass_to_output:true},{index:1,kind:'variables',name:'',label:'Порт2',pass_to_output:true}],
 branches:[{index:0,name:'Detailed'}],conditions:[{index:0,variable:'Mode',relation:'=',value:1}]};
const phases=c=>[{phase:'configure',status:'verified',receipt_id:'op:configure',value:{verified:true,cleanup_complete:true,configuration:c,validation:{status:'accepted_by_loginom_next',node_context:owner}}},
 {phase:'finish',status:'verified',receipt_id:'op:finish',value:{verified:true,cleanup_complete:true,settings_applied:true,mode:'execute',node_context:owner}}];

test('readback names each branch output port and the built-in Иначе',()=>{
 const r=conditionConfigurationReadback({node:ref('c'),phases:phases(configuration),operation_id:'op'});
 assert.deepEqual(r.branches,[{name:'Detailed',output_port:0,conditions:[{variable:'Mode',relation:'=',value:1}]},{name:'Иначе',output_port:1,conditions:null}]);
 assert.deepEqual(r.inputs.map(i=>[i.kind,i.port]),[['table',0],['variables',0]]);
 for(const bad of [{...configuration,debug_mode:true},{...configuration,branches:[...configuration.branches,{index:1,name:'B'}]},
  {...configuration,ports:[configuration.ports[0],{...configuration.ports[1],pass_to_output:false}]}])
  assert.throws(()=>conditionConfigurationReadback({node:ref('c'),phases:phases(bad),operation_id:'op'}),/required/);
});

test('reads every requested branch port with its observed schema and propagates a blocked-port refusal',async()=>{
 const reads=[];
 const channel={readOutputPort:async({port})=>{reads.push(port);
  if(port===0)throw Error('Requested output is not active');
  return {output:{port,port_guid:'g'+port,sample_complete:true,schema:[{name:'OrderID',type:'integer'}]}};}};
 const ctx={execution:{execution_id:'e'},receipt_id:'r',portExecution:{}};
 const out=await readConditionOutputs(channel,{ports:[1],sample_rows:10,require_exact_numbers:false},ctx);
 assert.deepEqual(out.ports.map(p=>[p.port,p.schema[0].index]),[[1,0]]);
 await assert.rejects(readConditionOutputs(channel,{ports:[0],sample_rows:10,require_exact_numbers:false},ctx),/not active/);
 assert.deepEqual(reads,[1,0]);
});
