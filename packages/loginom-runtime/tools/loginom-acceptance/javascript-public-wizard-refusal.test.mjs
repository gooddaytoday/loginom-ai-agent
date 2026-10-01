import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {javascriptDiscoveryProbe} from './javascript-discovery-probes.mjs';
import {inspectJavascriptModulePolicy} from '../../client/lib/javascript-module-policy.mjs';
import {verifyJavascriptPublicSyncThrow} from './javascript-public-existing-live.mjs';
const entry=fileURLToPath(new URL('./javascript-public-wizard-refusal-live.mjs',import.meta.url));
for(const mode of ['code','declared'])test('fixed native syntax case is parseable by admission and repair preserves the pinned business source '+mode,()=>{
 const source=javascriptDiscoveryProbe('p1-business-'+mode+'-base').source;
 assert.equal(inspectJavascriptModulePolicy(source+'\nthrow new Error("E_JS_SYNC_THROW");\n').status,'ADMITTED');
 assert.equal(inspectJavascriptModulePolicy(source+'\nconst unsupported = ({})?.value;\n').status,'ADMITTED');
 assert.equal(inspectJavascriptModulePolicy(source+'\n// E: public native refusal repair on the SAME node.\n').status,'ADMITTED');
});
for(const args of [['--case','regex-details-auto-code','--require-details','true'],['--case','regex-details-auto-code','--headless','true'],['--case','regex-details-auto-code','--source','foreign'],['--case','regex-details-auto-declared'],['--case','syntax-details-expand-code','--require-details','false'],['--case','syntax-details-expand-code','--headless','true'],['--case','syntax-details-expand-declared'],['--case','syntax-details-code','--source','foreign'],['--case','syntax-details-declared'],['--case','import-code','--source','foreign'],['--case','import-code','--headless','true'],['--case','import-declared'],['--case','throw-code','--source','foreign'],['--case','throw-declared','--headless','true'],[],['--case','other'],['--case','syntax-code','--headless','true'],
 ['--case','syntax-code','--x11-no-focus','true'],['--case','syntax-code','--source','arbitrary'],
 ['--case','syntax-code','--case','syntax-declared']])test('fixed entrypoint refuses unassigned case or browser/source controls '+JSON.stringify(args),()=>{
 const result=spawnSync(process.execPath,[entry,...args],{encoding:'utf8'});
 assert.equal(result.status,1);assert.match(result.stderr,/Fixed public wizard refusal case required|Only assigned public wizard refusal paths permitted/);
});
test('fixed native-error help exposes only saved-package ordinary headed paths and no Save',()=>{
 const result=spawnSync(process.execPath,[entry,'--help'],{encoding:'utf8'});
 assert.equal(result.status,0);assert.match(result.stdout,/Ordinary headed/);assert.match(result.stdout,/no Save/);
});

test('fixed public sync throw requires applied source and verified failed explicit execution without output',()=>{
 const node={document_id:'doc',workflow_id:'workflow',node_id:'node'};
 const job={state:'settled',outcome:{status:'FAILED',cleanup_complete:true,effect_possible:true,output:{
  status:'FAILED',cleanup_complete:true,pending_phase:null,node,configuration:{status:'applied'},
  execution:{status:'failed',failure_verified:true,execution_id:'doc:root:1',root_id:'root',group_id:'1'},
  output:{status:'not_refreshed',ports:[]},error:{code:'NODE_EXECUTION_FAILED',message:'Error: E_JS_SYNC_THROW\n at module (main:1:1)'},
  phases:[{phase:'node_finish',status:'verified'},{phase:'materialization_execute',status:'verified'}]}}};
 assert.equal(verifyJavascriptPublicSyncThrow(job,node),job.outcome.output);
 for(const change of [v=>v.outcome.status='SUCCEEDED',v=>v.outcome.cleanup_complete=false,
  v=>v.outcome.effect_possible=false,v=>v.outcome.output.cleanup_complete=false,
  v=>v.outcome.output.pending_phase='execute',v=>v.outcome.output.node.node_id='foreign',
  v=>v.outcome.output.configuration.status='discarded',v=>v.outcome.output.execution.status='completed',
  v=>v.outcome.output.execution.failure_verified=false,v=>v.outcome.output.execution.execution_id='foreign',
  v=>v.outcome.output.output.ports=[{port:0}],v=>v.outcome.output.output.status='complete',
  v=>v.outcome.output.error.code='OTHER',v=>v.outcome.output.error.message='Error: unrelated',
  v=>v.outcome.output.phases=[],v=>v.outcome.output.phases[1].status='pending']){
   const changed=structuredClone(job);change(changed);assert.throws(()=>verifyJavascriptPublicSyncThrow(changed,node),/unconfirmed/);
 }
});
