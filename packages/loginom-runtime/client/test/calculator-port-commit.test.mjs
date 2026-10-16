import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readCalculatorPortCommit,verifyCalculatorPortCommit,makeCalculatorPortCommitCode} from '../lib/calculator-port-commit.mjs';
import {applyNode} from '../lib/node-apply.mjs';
// Page/native server and prepared-node reader are doubles; production package
// identity/read/verification and the node phase shell execute here. Not native PASS.
const node={document_id:'doc',workflow_id:'flow',node_id:'calculator'};
const binding={document_id:'doc',workflow_ref:{workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Сервер',label:''}]},node};
function fixture(value,change=()=>{}){
 const events=[],doc={},pack={ReadOnly:false,PackageFileName:'/own/test.lgp',Package:{},HasRunningNodes:()=>false};
 const connection={Connected:true,UserName:'own',Session:{async IsPackageModified(p){assert.equal(p,pack.Package);events.push('modified');change({pack,connection,context});return value;}}};
 const map={FServerConnection:connection,PackageNodes:{Count:1,Items:()=>pack},HasRunningNodes:()=>false};
 const context=vm.createContext({document:doc,location:{origin:'https://example.test'},__loginomStartupV1:{document:doc,account:'own'},
  __loginomDockPreparationV1:{document:doc,id:'doc',receipts:new Map([['r',{phase:'verified',workflowId:'flow',packageNode:pack}]])},bg:{app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{FMapTree:map}}}}}});
 const page={evaluate:async(fn,arg)=>{context.arg=arg;return new vm.Script('('+fn.toString()+')(arg)').runInContext(context);}};
 const readNode=async()=>{events.push('node');return {verified:true,...node,surface:'graph',locked:false};};
 const read=()=>readCalculatorPortCommit(page,binding,'https://example.test','7.4.2',readNode);
 return {read,events,pack,connection,context};
}
for(const modified of [true,false])test('reads actual modified '+modified+' on same bound writable package',async()=>{
 const f=fixture(modified),r=await f.read();assert.equal(r.modified,modified);assert.equal(r.package_saved,false);assert.equal(r.persisted_content_verified,false);
 assert.deepEqual(f.events,['node','modified','node']);
 if(modified)assert.equal(verifyCalculatorPortCommit(r,node),r);else assert.throws(()=>verifyCalculatorPortCommit(r,node),/modification not confirmed/);
});
for(const value of [undefined,null,0,1,'true'])test('rejects nonboolean modified '+String(value),async()=>{await assert.rejects(fixture(value).read(),/modified state unavailable/)});
for(const field of ['ReadOnly','path','account','proxy'])test('rejects package identity change during read '+field,async()=>{
 const f=fixture(true,({pack,connection})=>{if(field==='ReadOnly')pack.ReadOnly=true;if(field==='path')pack.PackageFileName='/own/other.lgp';if(field==='account')connection.UserName='other';if(field==='proxy')pack.Package={};});
 await assert.rejects(f.read(),/changed|writable/);
});
for(const field of ['origin','build','document','account','readonly','running','inventory'])test('refuses foreign or busy package before native read '+field,async()=>{
 const f=fixture(true),m=f.context.bg.app.Application.FInstance.FMainForm.FMapTree;
 if(field==='origin')f.context.location.origin='https://other.test';if(field==='build')f.context.bg.app.Version='other';
 if(field==='document')f.context.__loginomDockPreparationV1.id='other';if(field==='account')f.connection.UserName='other';
 if(field==='readonly')f.pack.ReadOnly=true;if(field==='running')f.pack.HasRunningNodes=()=>true;if(field==='inventory')m.PackageNodes.Count=2;
 await assert.rejects(f.read());assert.ok(!f.events.includes('modified'));
});
test('refuses a changed node after the native read',async()=>{const f=fixture(true);let reads=0;await assert.rejects(readCalculatorPortCommit({evaluate:async fn=>{f.context.arg={binding,origin:'https://example.test',build:'7.4.2'};return new vm.Script('('+fn.toString()+')(arg)').runInContext(f.context)}},binding,'https://example.test','7.4.2',async()=>({verified:true,...node,node_id:++reads===1?'calculator':'other',surface:'graph',locked:false})),/node changed/)});
test('preserves original native error including falsy cause',async()=>{const f=fixture(),error=Error('native',{cause:0});f.connection.Session.IsPackageModified=async()=>{throw error};await assert.rejects(f.read(),e=>e===error&&e.cause===0)});
test('serialized pinned code compiles and rejects foreign build/origin',()=>{assert.doesNotThrow(()=>new vm.Script('('+makeCalculatorPortCommitCode(binding,'https://example.test','7.4.2')+')'));assert.throws(()=>makeCalculatorPortCommitCode(binding,'file:///x','7.4.2'));assert.throws(()=>makeCalculatorPortCommitCode(binding,'https://example.test','other'))});
for(const kind of ['missing','false','foreign','true'])test('shell cannot publish applied or execute without commit proof '+kind,async()=>{
 const f=fixture(kind==='true'),proof=kind==='missing'?undefined:await f.read();if(kind==='foreign'){proof.modified=true;proof.node_context.node_id='other'}
 const r={operation_id:'commit',contract_revision:'1.0.0',document_id:'doc',workflow_ref:binding.workflow_ref,target:{kind:'existing',type:'transform.calculator',ref:node},inputs:[],mode:'expression',parameters:{expressions:[]},mappings:[],finish:'done',read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:10000,execute_ms:10000,total_ms:600000}};
 const v=(x={})=>({verified:true,cleanup_complete:true,effect_possible:true,...x}),events=[],records=[],operation={id:r.operation_id,parameters:r};
 const drivers={verifySource:async()=>v(),prepareTarget:async()=>v({node}),openWizard:async()=>v(),mapPorts:async(_m,c)=>v(c.receipt_id.endsWith(':output_mapping')?{port_commit:proof}:{}),finish:async mode=>v({mode,settings_applied:true,execution_started:false}),finishGraph:async mode=>{events.push('finish');return v({mode,settings_applied:true,execution_started:false})}};
 const result=await applyNode({request:r,operation,handlers:new Map([['transform.calculator',{revision:'test',modes:['expression'],output_wizard:'separate',validate:()=>{},configure:async()=>v()}]]),drivers,now:()=>1,record:async e=>{records.push(structuredClone(e));return structuredClone(e)}});
 assert.equal(operation.nodeApply.deadline,600001);
 if(kind==='true'){assert.equal(result.status,'SUCCEEDED');assert.equal(result.configuration.status,'applied');assert.equal(result.package_saved,false);assert.deepEqual(events,['finish']);}
 else {assert.equal(result.status,'AMBIGUOUS');assert.equal(result.configuration,undefined);assert.equal(result.pending_phase,'output_mapping');assert.deepEqual(events,[]);assert.ok(!records.some(e=>e.phase==='node_checkpoint'));}
});
