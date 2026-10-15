import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {createActionRuntime}=await import(process.env.RETAINED_RUNTIME_ROOT?pathToFileURL(process.env.RETAINED_RUNTIME_ROOT+'/client/lib/executor.mjs').href:'../lib/executor.mjs');
const workflow={workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'path',label:'Scenario'}]};
const request=()=>({operation_id:'apply',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,
 target:{kind:'new',type:'imports.text',label:'Source',position:{x:320,y:280}},inputs:[],mode:'delimited',parameters:{},mappings:[],finish:'done',
 read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}});
function fixture({execute=async()=>{throw Error('Unexpected public transport')},wrapDrivers,now=Date.now,pinnedActions=new Map()}={}){
 const calls=[],events=[];const graph={complete:true,document_id:'doc',workflow_ref:workflow,nodes:[],links:[],foreign_links:[]};
 const adapter={observe:async()=>structuredClone(graph),preflight:async()=>{},positionMatches:(n,p)=>JSON.stringify(n.position)===JSON.stringify(p),reconcile:async()=>({verified:true,cleanup_complete:true}),mutate:async e=>{calls.push(e.kind);if(e.kind==='create')graph.nodes.push({ref:{document_id:'doc',workflow_id:'wf',node_id:'new'},type:e.parameters.type,label:'Source',position:e.parameters.position,inputs:[],outputs:[0]});return {status:'SUCCEEDED',cleanup_complete:true};}};
 const ok=(name,extra={})=>async()=>{calls.push(name);return {verified:true,cleanup_complete:true,effect_possible:false,...extra}};
 const handler={revision:'1',modes:['delimited'],validate:()=>{},configure:ok('configure')};
 const drivers={verifySource:ok('source'),mapPorts:ok('mapping'),openWizard:ok('open'),finish:ok('finish',{mode:'done',execution_started:false,execution_id:null}),
  waitExecution:ok('execute'),readOutput:ok('read'),verifyContinuation:async()=>true};
 let failRecord;
 const handlers=new Map([['imports.text',handler]]);
 const runtime=createActionRuntime({pinned:{actions:pinnedActions,selectors:new Map(),pins:{}},allowCandidate:true,execute,now,
  nodeTargetAdapterFactory:()=>adapter,nodeApplyHandlers:handlers,nodeApplyDriverFactory:context=>wrapDrivers?wrapDrivers(context,drivers):drivers,
  onRecord:async e=>{events.push(e);if(e.phase===failRecord)throw Error('disk unavailable');return e;}});
 return {runtime,adapter,calls,events,graph,drivers,handler,handlers,failRecord:p=>{failRecord=p}};
}

for(const scenario of ['valid','before-request','before-opening','before-deadline','before-node','before-state','missing','running','unknown','request-drift','node-drift','opening-drift','deadline-drift','cancelled','expired'])test('real executor retained node '+scenario,async()=>{
 let time=Date.now();let actual,unblock;const controller=new AbortController();
 const f=fixture({now:()=>time,wrapDrivers:(context,drivers)=>{actual=context.operation;return {...drivers,verifySource:scenario==='running'?()=>new Promise(r=>unblock=()=>r({verified:true,cleanup_complete:true})):drivers.verifySource,openWizard:async()=>{if(scenario==='unknown')throw Error('lost native response');return {verified:true,cleanup_complete:true,effect_possible:false,opening_operation_id:'apply:open',epoch:'own'}}}}});
 if(scenario==='missing'){assert.throws(()=>f.runtime.retainCaptureNode('missing'));return}
 if(scenario==='cancelled')await f.runtime.runNodeApply(request(),{signal:controller.signal});
 else {
  const started=f.runtime.startNodeApply(request());assert.equal(started.state,'running');
  if(scenario==='running'){assert.throws(()=>f.runtime.retainCaptureNode('apply'));while(!unblock)await Promise.resolve();unblock()}
  const job=await f.runtime.waitNodeApply('apply',{timeoutMs:1000});assert.equal(job.state,'settled');
 }
 if(scenario==='unknown'){assert.throws(()=>f.runtime.retainCaptureNode('apply'));return}
 if(scenario==='before-request')actual.nodeApply.request.parameters.drift=true;
 if(scenario==='before-opening')actual.nodeApply.phases=actual.nodeApply.phases.map(p=>p.phase==='open'?{...p}:p);
 if(scenario==='before-deadline')actual.nodeApply.deadline++;
 if(scenario==='before-node')actual.nodeApply.node={...actual.nodeApply.node};
 if(scenario==='before-state')actual.nodeApply={...actual.nodeApply};
 if(scenario.startsWith('before-')){assert.throws(()=>f.runtime.retainCaptureNode('apply'));return}
 const retained=f.runtime.retainCaptureNode('apply');
 assert.equal(retained.signal,actual.captureSignal);assert.equal(retained.request,actual.nodeApply.request);
 assert.equal(retained.opening,actual.nodeApply.phases.find(p=>p.phase==='open'));
 assert.equal(retained.deadline,actual.nodeApply.deadline);retained.assertCurrent();
 if(scenario==='request-drift')actual.nodeApply.request.parameters.drift=true;
 if(scenario==='node-drift')actual.nodeApply.node.node_id='foreign';
 if(scenario==='opening-drift')retained.opening.value.epoch='foreign';
 if(scenario==='deadline-drift')actual.nodeApply.deadline++;
 if(scenario==='cancelled')controller.abort();
 if(scenario==='expired')time=retained.deadline;
 if(['request-drift','node-drift','opening-drift','deadline-drift','expired','cancelled'].includes(scenario))assert.throws(()=>retained.assertCurrent());
 else retained.assertCurrent();
});
