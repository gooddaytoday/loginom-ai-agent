import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const root=process.env.FP_RUNTIME??new URL('../..',import.meta.url).pathname;
const {validateActionParameters}=await import(pathToFileURL(join(root,'client/lib/action-catalog.mjs')));
const {workspaceObserveTool}=await import(pathToFileURL(join(root,'client/lib/workspace.mjs')));
const fragmentPath=process.env.FP_ELIGIBILITY_FRAGMENT??new URL('../fixtures/field-parameters/readonly-source68-eligibility.txt',import.meta.url);
const code=await readFile(fragmentPath,'utf8');
const results=[];
const cases=[
 ['pre-ready',{},false],
 ['indeterminate',{workspaceReady:false,attempted:true},false],
 ['post-confirmed-save-refusal',{readonlyCleanupRefusal:true},true],
 ['unknown',{readonlyCleanupRefusal:true,captureUnknown:true},false],
 ['pending-read',{readonlyCleanupRefusal:true,captureInFlight:{}},false],
 ['pending-writer',{readonlyCleanupRefusal:true,captureWriters:new Set([{}])},false],
 ['native-cleanup-dispatched',{readonlyCleanupRefusal:true,nativeCleanupDispatched:true},false],
 ['running',{readonlyCleanupRefusal:true,running:true},false],
 ['unsettled',{readonlyCleanupRefusal:true,unsettled:true},false],
];
for(const [phase,override,expected]of cases)test('existing source68 eligibility, not pre-READY authority: '+phase,()=>{
 const flags={readonlyCleanupRefusal:false,nativeCleanupDispatched:false,confirmedCleanup:null,shutdownStarted:false,captureConsumed:false,captureInFlight:null,captureUnknown:false,captureWriters:new Set(),clipboardUncertain:false,heldLeases:new Set(),...override};
 const read=vm.runInNewContext(code+';readonlyContinuation',{...flags,actionRuntime:{hasUnsettledWork:()=>!!flags.unsettled,hasActiveWork:()=>!!flags.running},validateActionParameters,workspaceObserveTool});
 const actual=read('dock_workspace_observe',{scope:'bootstrap'});assert.equal(actual,expected);
 assert.equal(read('dock_action_run',{action_key:'package.save_as'}),false);
 assert.equal(read('dock_workspace_observe',{scope:'bootstrap',deadline:Date.now()+10000}),false);
 results.push({phase,expected,actual,source:'60c753ca pending review; extracted production predicate',qualification:'pure predicate probe; not a dispatch test',fixture:true});
});
test.after(async()=>{if(process.env.FP_ROUTE_RESULTS){await mkdir(process.env.FP_ROUTE_RESULTS,{recursive:true});await writeFile(join(process.env.FP_ROUTE_RESULTS,'eligibility.json'),JSON.stringify(results,null,2)+'\n')}});
