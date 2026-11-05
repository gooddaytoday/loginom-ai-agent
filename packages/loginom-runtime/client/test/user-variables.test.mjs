import test from 'node:test';
import assert from 'node:assert/strict';
import {applyNode,validateNodeApplyRequest} from '../lib/node-apply.mjs';
import {createUserVariablesNodeSupport,validateUserVariablesParameters,readUserVariablesSnapshot,makeUserVariablesSnapshotCode} from '../lib/crosstable-variables.mjs';
import {nodeReadHandler,NODE_READ_MODE} from '../lib/node-read-contract.mjs';

const node={document_id:'doc',workflow_id:'wf',node_id:'user'};
const binding={document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Сервер',label:''}]},node};
const request=()=>({operation_id:'values',contract_revision:'1.0.0',document_id:'doc',workflow_ref:binding.workflow_ref,
 target:{kind:'existing',type:'variables.user',ref:node},inputs:[],mode:'values',parameters:{variables:[{name:'limit',type:'integer',value:3}]},mappings:[],finish:'done',
 read:{ports:[],sample_rows:0,require_exact_numbers:true},budgets:{configure_ms:1000,execute_ms:1000,total_ms:5000}});
const support=createUserVariablesNodeSupport({});
test('production builtin driver satisfies the executor lifecycle interface without enabling Execute',async()=>{
 const drivers=support.nodeApplyDriverFactory({operation:{id:'values',parameters:request()},execute:()=>assert.fail('No browser access at construction')});
 for(const name of ['verifySource','mapPorts','openWizard','finish','waitExecution','readOutput'])assert.equal(typeof drivers[name],'function',name);
 await assert.rejects(drivers.waitExecution(),/cannot execute/);
});
test('user values refuses unsafe types and unsupported operations before any UI driver',()=>{
 assert.doesNotThrow(()=>validateNodeApplyRequest(request(),support.nodeApplyHandlers));
 for(const v of [{name:'x',type:'integer',value:9007199254740992},{name:'x',type:'integer',value:1.5},{name:'x',type:'real',value:1},
  {name:'x',type:'boolean',value:0},{name:'x',type:'string',value:false},{name:'x',type:'string'},{name:'x',type:'string',value:'',extra:true}]){
  const r=request();r.parameters.variables=[v];assert.throws(()=>validateNodeApplyRequest(r,support.nodeApplyHandlers));
 }
 for(const change of [r=>r.target.kind='new',r=>r.finish='execute',r=>r.target.label='renamed',r=>r.read.variable_ports=[4],
  r=>r.parameters.variables.push({...r.parameters.variables[0]}),r=>r.mappings=[{direction:'input',port:0}]]){
  const r=request();change(r);assert.throws(()=>validateNodeApplyRequest(r,support.nodeApplyHandlers));
 }
 for(const [type,value] of [['integer',null],['integer',0],['integer',-7],['integer',Number.MAX_SAFE_INTEGER],['boolean',false],['string','']])
  assert.doesNotThrow(()=>validateUserVariablesParameters({variables:[{name:'x',type,value}]}));
 assert.throws(()=>makeUserVariablesSnapshotCode(binding,{variables:[]}));
});
test('builtin lifecycle never executes; snapshot bypasses values configuration',async()=>{
 for(const mode of ['done','close','snapshot']){
  const r=request(),calls=[],operation={id:'values'};
  const handler=mode==='snapshot'?nodeReadHandler(support.nodeApplyHandlers.get('variables.user')):support.nodeApplyHandlers.get('variables.user');
  if(mode==='snapshot'){r.mode=NODE_READ_MODE;r.parameters={source_operation_id:'prior'};r.read.variable_ports=[4];}else r.finish=mode;
  const verified=value=>({verified:true,cleanup_complete:true,effect_possible:false,...value});
  const drivers={verifySource:async()=>verified({}),prepareTarget:async()=>verified({node}),mapPorts:async()=>verified({}),openWizard:async()=>verified({}),
   configureValues:async()=>{calls.push('configure');return verified({independent_readback:true,variables:[],changed:[]});},
   finish:async finish=>verified({mode:finish,execution_id:null,execution_started:false,settings_applied:finish==='done',draft_discarded:finish==='close'}),
   finishGraph:async finish=>verified({mode:finish,execution_id:null,execution_started:false,settings_applied:false}),
   waitExecution:async()=>{throw Error('Execute forbidden');},readOutput:async()=>{calls.push('read');return verified({status:'complete',source:'snapshot',native_source:'VariablesEditValuesWizard',execution_id:null,evidence_ref:'read',ports:[],variable_ports:[{
    port:4,kind:'variables',source:'snapshot',native_source:'VariablesEditValuesWizard',execution_id:null,read_id:'read',fresh:true,complete:true,package_modified:false,
    count:0,variables:[],completeness:{loaded:true,count:0,store_count:0,unique_ids:0}}]});}};
  const result=await applyNode({request:r,operation,handlers:new Map([['variables.user',handler]]),drivers,record:async e=>e});
  assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));assert.deepEqual(result.execution,{status:'not_requested',execution_id:null});
  assert.deepEqual(calls,mode==='snapshot'?['read']:['configure']);
 }
});
test('read-only builtin snapshot cancels without editing and refuses package dirtying',async()=>{
 for(const dirty of ['before','after',null]){
  const calls=[];let reads=0;
  const locator=s=>({count:async()=>0,click:async()=>{calls.push(s);}});
  const page={locator,waitForFunction:async()=>{},evaluate:async(_fn,{mode})=>mode==='dirty'?(++reads===1?dirty==='before':dirty==='after'):{port_guid:'port',variables:[],count:0,complete:true,completeness:{loaded:true,count:0,store_count:0,unique_ids:0}}};
  const context=async()=>({verified:true,surface:'graph',locked:false});
  const open=async()=>{calls.push('open');return {status:'SUCCEEDED',effect_possible:true};};
  const result=await readUserVariablesSnapshot(page,{binding,deadline:Date.now()+5000,operation_id:'read'},context,open,()=>{},()=>{});
  if(dirty==='before'){assert.equal(result.status,'NOT_APPLIED');assert.deepEqual(calls,[]);}
  else {assert.ok(calls.some(s=>s.includes(';btnClose')));assert.ok(!calls.some(s=>s.includes(';btnDone')||s.includes('btnApply')));
   assert.equal(result.status,dirty==='after'?'NOT_APPLIED':'SUCCEEDED');if(!dirty)assert.equal(result.output.execution_id,null);}
 }
});
