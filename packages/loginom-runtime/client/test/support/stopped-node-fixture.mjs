import assert from 'node:assert/strict';
import {createActionRuntime} from '../../lib/executor.mjs';
import {actions} from './executor-fixture.mjs';

const node={document_id:'doc',workflow_id:'wf',node_id:'new'};
const workflow={workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'path',label:'Scenario'}]};
const graphOf=()=>({complete:true,document_id:'doc',workflow_ref:workflow,
 nodes:[{ref:node,type:'imports.text',label:'Source',position:{x:320,y:280},inputs:[],outputs:[0]}],links:[],foreign_links:[]});

export const request=()=>({operation_id:'apply',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,
 target:{kind:'new',type:'imports.text',label:'Source',position:{x:320,y:280}},inputs:[],mode:'delimited',parameters:{},mappings:[],finish:'execute',
 read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}});
export function fixture({release:releaseDriver,browserRecovery,basisRecordError,acceptanceFault}={}) {
 const calls=[],events=[],graph={complete:true,document_id:'doc',workflow_ref:workflow,nodes:[],links:[],foreign_links:[]};
 const adapter={observe:async()=>structuredClone(graph),preflight:async()=>{},positionMatches:(n,p)=>JSON.stringify(n.position)===JSON.stringify(p),
  reconcile:async()=>({verified:true,cleanup_complete:true}),mutate:async e=>{calls.push(e.kind);if(e.kind==='create')graph.nodes.push({ref:node,
   type:e.parameters.type,label:'Source',position:e.parameters.position,inputs:[],outputs:[0]});return {status:'SUCCEEDED',cleanup_complete:true};}};
 const ok=(name,extra={})=>async()=>{calls.push(name);return {verified:true,cleanup_complete:true,effect_possible:false,...extra};};
 const drivers={verifySource:ok('source'),mapPorts:ok('mapping'),openWizard:ok('open'),
  finish:async mode=>{calls.push('finish');return {verified:true,cleanup_complete:true,mode,effect_possible:true,
   execution_id:mode==='execute'?'exec':null,execution_started:mode==='execute'};},
  waitExecution:async()=>{calls.push('execute');return {verified:true,cleanup_complete:true,status:'completed',execution_id:'exec'};},
  readOutput:ok('read',{status:'complete',execution_id:'exec',evidence_ref:'evidence',ports:[]}),verifyContinuation:async()=>true,
  ...(releaseDriver?{releasePending:async state=>{calls.push('release:'+state.pending.phase);return releaseDriver(state);}}:{})};
 const handler={revision:'1',modes:['delimited'],validate:()=>{},configure:ok('configure')};
 const runtime=createActionRuntime({pinned:{actions,selectors:new Map(),pins:{}},allowCandidate:true,execute:async()=>{throw Error('Unexpected public transport');},
  nodeTargetAdapterFactory:()=>adapter,nodeApplyHandlers:new Map([['imports.text',handler]]),nodeApplyDriverFactory:()=>drivers,
  onRecord:async e=>{if(e.phase==='browser_recovery_basis'&&basisRecordError)throw basisRecordError;events.push(e);return e;},browserRecovery,acceptanceFault});
 return {runtime,calls,events,drivers,handler};
}
export const proved=({wizard_closed=false,read_view_restored=false}={})=>()=>({verified:true,cleanup_complete:true,effect_possible:wizard_closed||read_view_restored,
 node_context:{...node,verified:true,surface:'graph',locked:false},graph:graphOf(),cleanup:{wizard_closed,read_view_restored,views_returned:false}});
export const stop=async(f,phase,{cause,operationId,target}={})=>{
 const key=phase==='read'?'readOutput':'finish',original=f.drivers[key];let first=true;
 f.drivers[key]=async(...args)=>{if(!first)return original(...args);first=false;f.calls.push(phase);const error=Error('Local node cancellation requested');if(cause)error.receipt={error:{code:cause,message:cause}};throw error;};
 f.runtime.startNodeApply({...request(),...(operationId?{operation_id:operationId}:{}),...(target?{target}:{})});
 const job=await f.runtime.waitNodeApply(operationId??'apply',{timeoutMs:1000});
 assert.equal(job.outcome.status,'AMBIGUOUS');assert.equal(job.outcome.output.pending_phase,phase);
 return job;
};
