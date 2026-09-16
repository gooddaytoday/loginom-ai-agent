import test from 'node:test';import assert from 'node:assert/strict';
import {diagnosisPolicy} from './text-export-download-diagnosis-policy.mjs';
import {offlineProof} from './text-export-observer-offline.mjs';
import {mkdtemp,rm,readFile,access} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
test('diagnostic SDK never writes actual-dispatch or calls product even after successful observer',async t=>{
 for(const negative of [false,true]){const root=await mkdtemp(join(tmpdir(),'node17-diag-'));t.after(()=>rm(root,{recursive:true,force:true}));const r=await offlineProof(root,{diagnosisOnly:true,changeResponse:(r)=>negative&&r.observer_download_count?{status:'NOT_APPLIED',cleanup_complete:true,effect_possible:false}:r});assert.equal(r.dispatched,0);assert.ok(r.error);await assert.rejects(access(join(root,'observer/actual-dispatch.jsonl')));if(!negative)assert.equal(JSON.parse((await readFile(join(root,'observer/diagnostic-stop.jsonl'),'utf8')).trim()).product_dispatch_forbidden,true);}
});
test('diagnostic policy forbids unknown tools, repeat prepare, replacement before setup and wrong nodes',()=>{
 const check=diagnosisPolicy(),call=(name,a)=>check({params:{name,arguments:a}});
 assert.throws(()=>call('dock_node_apply',{}));call('dock_prepare',{operation_id:'smoke-prepare',intent:'new_draft'});assert.throws(()=>call('dock_prepare',{operation_id:'smoke-prepare',intent:'new_draft'}));
 for(const name of ['dock_action_run','dock_workspace_observe','dock_package_save','dock_node_cancel'])assert.throws(()=>call(name,{}));
 call('dock_artifact_deliver',{operation_id:'smoke-deliver'});assert.throws(()=>call('dock_node_apply',{operation_id:'smoke-replace'}));assert.throws(()=>call('dock_node_apply',{operation_id:'smoke-source',target:{type:'exports.text'},finish:'execute',mode:'delimited'}));
});
