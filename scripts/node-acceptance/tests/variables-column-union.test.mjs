import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {auditVariablesColumnUnionHistory,deliverVariablesColumnUnionSource,saveVariablesColumnUnionSource,prepareVariablesColumnUnionSource} from '../variables-column-union.mjs';
const load=name=>JSON.parse(readFileSync(new URL('../../../docs/node-development/nodes/variables-coluniondatavar/acceptance/expected-'+name+'-run.json',import.meta.url)));
const initial=load('initial'),updated=load('updated');
test('fixture preparation establishes a real workspace before delivery and refuses a failed preparation without uploading',async t=>{
 const root=await mkdtemp(join(tmpdir(),'union-source-workspace-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const modules={
  'src/resources.mjs':`export const verifyResources=async()=>({browserPath:'pinned'});`,
  'src/connection-check.mjs':`export const state={events:[],fail:false,closed:false,ready:false,packages:0};export async function loginBrowser(){const page={prepare:o=>{state.events.push(o.intent??'identity');if(o.identityOnly)return {status:'BOUND',document_id:'doc',loginom_account:'worker'};if(state.fail)return {status:'NOT_READY'};state.packages++;if(o.intent==='new_draft')state.ready=true;return {status:'READY',document_id:'doc',loginom_account:'worker',workflow_ref:{tab_tid:'own'}};},cleanup:()=>{state.events.push('cleanup');if(state.packages!==1)return {package_closed:false,logged_out:false};state.packages--;return {package_closed:true,logged_out:true};}};return {context:{pages:()=>[page],close:async()=>{state.closed=true;}}};}`,
  'client/lib/workspace.mjs':`export const makeWorkspacePrepareCode=o=>'async page=>page.prepare('+JSON.stringify(o)+')';`,
  'client/lib/package-cleanup.mjs':`export const makePackageCleanupCode=()=> 'async page=>page.cleanup()';`,
  'client/lib/executor.mjs':`import {state} from '../../src/connection-check.mjs';export const createActionRuntime=()=>({deliverPackageArtifact:async()=>{state.events.push('delivery');if(!state.ready)throw Error('Prepared workspace required before fixture delivery');return {outcome:{status:'SUCCEEDED',destination:'/worker/source.lgp',upload_completion_verified:true,cleanup_complete:true}};},run:async()=>({status:'SUCCEEDED',output:{save_completed:true}})});`,
  'client/lib/artifacts.mjs':`export const createArtifactStore=async()=>({admit:async()=>({artifact_id:'input',upload:{grant_id:'grant'}})});`,
  'client/lib/execution-journal.mjs':`export const createExecutionJournal=()=>async e=>e;`,
  'client/lib/storage-policy.mjs':`export const createStorageBinding=()=>({});`,
  'executor/catalog/actions.json':JSON.stringify({actions:[{action_key:'package.save_checkpoint',effect:{}}]}),
  'executor/catalog/selectors.json':JSON.stringify({selectors:[]}),
 };
 for(const [path,text] of Object.entries(modules)){const p=join(root,'runtime',path);await mkdir(join(p,'..'),{recursive:true});await writeFile(p,text);}
 const config=join(root,'config.json'),fixture=join(root,'source.lgp');await writeFile(config,JSON.stringify({login:{url:'https://loginom.test/app/',username:'worker',password:''},package:'/worker/source.lgp'}));await writeFile(fixture,'input');
 const {state}=await import(pathToFileURL(join(root,'runtime/src/connection-check.mjs')));
 await prepareVariablesColumnUnionSource(root,config,fixture,join(root,'success'));
 assert.deepEqual(state.events,['new_draft','delivery','cleanup','open_package','cleanup']);assert.equal(state.closed,true);
 state.events=[];state.ready=false;state.fail=true;state.closed=false;
 await assert.rejects(()=>prepareVariablesColumnUnionSource(root,config,fixture,join(root,'refused')),/SOURCE_WORKSPACE/);
 assert.deepEqual(state.events,['new_draft']);assert.equal(state.closed,true);
});
test('source Save targets only the completed owned upload and requires a completed native save',async()=>{
 const calls=[],path='/worker/new-copy.lgp',proof={status:'SUCCEEDED',destination:path,upload_completion_verified:true,cleanup_complete:true};
 const runtime={run:async(...args)=>{calls.push(args);return {status:'SUCCEEDED',output:{save_completed:true}};}};
 await saveVariablesColumnUnionSource(runtime,path,proof);
 assert.deepEqual(calls[0],['package.save_checkpoint',{path,conflict_policy:'replace'},{operationId:'source-save'}]);
 for(const patch of [{destination:'/worker/foreign.lgp'},{upload_completion_verified:false},{status:'AMBIGUOUS'},{cleanup_complete:false}]){
  calls.length=0;await assert.rejects(()=>saveVariablesColumnUnionSource(runtime,path,{...proof,...patch}));assert.equal(calls.length,0);
 }
 runtime.run=async()=>({status:'FAILED',output:{save_completed:false}});
 await assert.rejects(()=>saveVariablesColumnUnionSource(runtime,path,proof),/SOURCE_SAVE/);
});
test('fixture delivery resumes only an explicit settled checkpoint before upload and never restarts delivery',async()=>{
 const request={operation_id:'source'},calls=[];
 const checkpoint={outcome:{status:'NOT_APPLIED',effect_possible:false,upload_submitted_or_unknown:false,inspection_required:false,cleanup_complete:true,next_step:{tool:'dock_artifact_delivery_resume'}}};
 const runtime={deliverPackageArtifact:async r=>{calls.push(r);return checkpoint;},resumeArtifactDelivery:async r=>{calls.push(r);return {outcome:{status:'SUCCEEDED'}};}};
 assert.equal((await deliverVariablesColumnUnionSource(runtime,request)).outcome.status,'SUCCEEDED');
 assert.equal(calls.length,2);assert.equal(calls[1].operation_id,'source');assert.ok(calls[1].resume_id);
 for(const patch of [{inspection_required:true},{cleanup_complete:false},{upload_submitted_or_unknown:true}]){
  calls.length=0;runtime.deliverPackageArtifact=async()=>({...checkpoint,outcome:{...checkpoint.outcome,...patch}});
  assert.equal((await deliverVariablesColumnUnionSource(runtime,request)).outcome.status,'NOT_APPLIED');assert.equal(calls.length,0);
 }
});
function history(){
 const node={document_id:'doc',workflow_id:'wf',node_id:'u'},inputs=[0,1].map(input=>({kind:'variables',input,output:0,source:{...node,node_id:'s'+input}}));
 const checkpoint=(id,expected)=>({phase:'node_checkpoint',result:{status:'SUCCEEDED',cleanup_complete:true,node,execution:{status:'completed',execution_id:id},
  configuration:{readback:{kind:'variables_column_union',mapping:'automatic',input_count:2,inputs,mapping_fields:[{input:0,source_name:'a0',output_name:'a0'}]}},
  output:{variable_ports:[{kind:'variables',port:0,read_id:id,execution_id:id,source:'execution',native_source:'VariablesForm',complete:true,fresh:true,count:12,
   completeness:{loaded:true,count:12,store_count:12,unique_ids:12},variables:expected.variable_inventory.outputs[0].variables.map((v,index)=>({id:index,index,name:v.name,label:v.label,type:v.type,
    cell:{type:v.type,is_null:v.value===null,value:v.type==='integer'&&v.value!==null?String(v.value):v.value,...(v.type==='integer'&&v.value!==null?{precision:'exact_integer'}:v.type==='real'?{precision:'17_significant_digits'}:{})}}))}]}}});
 return [checkpoint('first',initial),{phase:'node_checkpoint',result:{status:'SUCCEEDED',cleanup_complete:true,node:inputs[1].source,execution:{status:'completed'},configuration:{readback:{kind:'variables_calculator',expressions:[{name:'a0',formula:'41'}]}}}},checkpoint('second',updated)];
}
test('union audit requires both complete ordered outputs, source patch, unchanged identities and input links',()=>{
 assert.equal(auditVariablesColumnUnionHistory(history(),initial,updated).status,'PASS');
 for(const corrupt of [e=>e.shift(),e=>e.splice(1,1),e=>e[2].result.node={node_id:'foreign'},e=>e[2].result.output.variable_ports[0].variables.reverse(),
  e=>e[2].result.output.variable_ports[0].variables[6].cell.value='29',e=>e[2].result.output.variable_ports[0].variables[0].id=99,
  e=>e[2].result.configuration.readback={...e[2].result.configuration.readback,inputs:[]},e=>e[2].result.execution.execution_id='first']){
  const events=history();corrupt(events);assert.throws(()=>auditVariablesColumnUnionHistory(events,initial,updated));
 }
 const events=history();events[2].result.output.variable_ports[0].variables[10].cell.value+=5e-13;
 assert.equal(auditVariablesColumnUnionHistory(events,initial,updated).status,'PASS');
 events[2].result.output.variable_ports[0].variables[10].cell.value+=1e-7;
 assert.throws(()=>auditVariablesColumnUnionHistory(events,initial,updated));
});
