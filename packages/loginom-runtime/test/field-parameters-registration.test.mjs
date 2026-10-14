import test from 'node:test';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
import {nativeEditorDouble} from './support/fp-native-editor-double.mjs';
const root=process.env.FP_RUNTIME??new URL('..',import.meta.url).pathname;
const {createReformNodeSupport}=await import(pathToFileURL(root+'/client/lib/reform-node.mjs'));
const {validateStartInput}=await import(pathToFileURL(root+'/src/start-input.mjs'));
const binding={revision:1,harness:'field-parameters-preservation-v1',owner:'owner',run:'run',lease:'owner:run',generation:1,chat:'chat',account:'worker',session:'session',packagePath:'/worker/fp.lgp',admission:'admission',expires:Date.now()+60000};
const input={protocol:1,generation:1,chat:'chat',stateDir:process.cwd(),connection:{username:'worker'},acceptanceCapture:Object.fromEntries(Object.entries(binding).filter(([k])=>k!=='session'))};
test('FP fixed runtime admission accepts host-bound grant without extra oracle/callback fields',()=>{assert.equal(validateStartInput(input).acceptanceCapture.harness,binding.harness);for(const k of ['script','callback','expected','inputMapping'])assert.throws(()=>validateStartInput({...input,acceptanceCapture:{...input.acceptanceCapture,[k]:'foreign'}}));});
const ref={workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'flow',label:'Scenario'}]};
const encode=x=>'ui-'+Buffer.from(x).toString('hex');
function transform(v,key=''){if(Array.isArray(v))return v.map(x=>transform(x));if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,transform(x,k)]));return typeof v==='string'&&(key==='ref'||key.endsWith('_ref'))?encode(v):v;}
function jsonAt(code,marker){const start=code.indexOf(marker);let quote=false,escape=false,depth=0;for(let i=start;i<code.length;i++){const c=code[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quote=false}else if(c==='"')quote=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0)return JSON.parse(code.slice(start,i+1));}throw Error('serialized options absent')}
async function driver(fault,providedOperation,privateContext){
 const f=nativeEditorDouble(fault),journal=[];let contexts=0;const identity={session_id:'session',account:'worker',package_path:'/worker/fp.lgp',document_id:'doc',workflow_id:'flow',node_id:'node',type:'transform.reform_columns',input_port:0};
 const operation=providedOperation??{id:'owned-fp',action:{action_key:'node.apply',revision:'1'},deadline:binding.expires,nodeApply:{request:{target:{type:identity.type},workflow_ref:ref},phases:[{phase:'input_mapping',value:{native_mapping:f.inputMapping}}]},fpCapture:{binding,async context(){contexts++;if(fault==='dirty')throw Error('LOGINOM_FP_NATIVE_RESOURCES_REFUSED');return {binding,identity,resources:{...binding,...identity,observed_at:Date.now(),deadline:binding.expires,dirty:false,running:false,unsettled:false,pending:false,unknown_effect:false}}}}};
 const snapshot=async()=>{const s=transform(await f.channel.observe({ready:()=>true}));s.workflow_ref=ref;s.dom_epoch={document:'doc',revision:1};s.origin='https://worker.invalid';s.loginom_build='7.4.2';s.scan={complete:true};s.ui.masks=[];s.ui.dialogs=[];s.ui.truncated={elements:false,masks:false,dialogs:false};s.node_reform.node_context={...s.prepared_node_context};for(const [name,field] of Object.entries(s.wizard.reform_parameters?.fields??{}))s.ui.elements.push({ref:field.input_ref,allowed_actions:[name==='excluded'?'set_checked':'set_wizard_field'],check_state:{kind:'checkbox'}});for(const e of s.ui.elements)e.wizard_field={max_length_utf16:256};return s};
 if(privateContext)operation.fpCapture=privateContext;
 const namespaces=[];
 const support=createReformNodeSupport({targetOrigin:'https://worker.invalid',targetBuild:'7.4.2'});
 const nativeExecute=async code=>{
  if(code.includes('"mode":"act"')){assert.ok(code.includes('"receipt_namespace":"original-namespace"'));namespaces.push('original-namespace');const o=jsonAt(code,'{"mode":"act"');const a={...o.action};a.ref=Buffer.from(a.ref.slice(3),'hex').toString();await f.channel.perform({resolve:()=>a});return {status:'SUCCEEDED',cleanup_complete:true,action_key:'ui.act',operation_id:o.operation_id,effect_possible:true,output:await snapshot()};}
  if(code.includes('async function readReformContext'))return (await snapshot()).node_reform;
  return {status:'SUCCEEDED',output:await snapshot()};
 };
 const d=support.nodeApplyDriverFactory({operation,now:Date.now,onRecord:async e=>{journal.push(e);return structuredClone(e)},receiptOptions:(id,key,signature)=>({receipt_namespace:'original-namespace',receipt_id:id,receipt_signature:signature}),execute:nativeExecute
 });
 const ctx={deadline:binding.expires,document_id:'doc',workflow_ref:ref,node:{document_id:'doc',workflow_id:'flow',node_id:'node'}};
 return {f,d,ctx,operation,journal,namespaces,nativeExecute,support,get contexts(){return contexts}};
}
test('FP tabular hook constructs actual typed channel, stops before Next/Done and retains original receipt namespace',async()=>{const f=await driver();await assert.rejects(f.d.configureCalculator(f.ctx,{}),/LOGINOM_FP_DRAFT_RETAINED/);assert.equal(f.operation.fpDraft.configured.applied_editors,3);assert.ok(f.contexts>10);assert.equal(f.namespaces.length,13);assert.ok(f.journal.some(e=>e.phase==='node_step_prepared'));assert.ok(f.f.events.every(e=>!['wizard_step','finish_wizard','cancel_wizard','execute_wizard'].includes(e.verb)));await assert.rejects(f.d.configureCalculator(f.ctx,{}),/cannot replay/);assert.equal(f.f.events.filter(e=>e.verb==='apply_reform_column').length,3);});
for(const fault of ['dirty','lost_response','collateral'])test('FP hook retains refusal/uncertainty without next/replay '+fault,async()=>{const f=await driver(fault);await assert.rejects(f.d.configureCalculator(f.ctx,{}),fault==='dirty'?/NATIVE_RESOURCES_REFUSED/:fault==='lost_response'?/Response lost/:/inventory|Reform|configuration|BASELINE/i);const before=f.f.events.length;await assert.rejects(f.d.configureCalculator(f.ctx,{}));assert.equal(f.f.events.length,before);assert.equal(f.operation.fpDraft,undefined);});

for(const [name,change] of Object.entries({foreignType:f=>f.operation.nodeApply.request.target.type='transform.calculator',missingMapping:f=>f.operation.nodeApply.phases=[],partialMapping:f=>f.f.inputMapping.inventory_complete=false,foreignPort:f=>f.f.inputMapping.node_context.input_port.port=1,duplicateID:f=>f.f.inputMapping.target_fields[1].field_id='0'}))test('actual channel refuses before gesture '+name,async()=>{const f=await driver();change(f);await assert.rejects(f.d.configureCalculator(f.ctx,{}));assert.equal(f.f.events.length,0);});

const {createActionRuntime}=await import(pathToFileURL(root+'/client/lib/executor.mjs'));
test('whole executor admission retains real configure operation/input mapping and delivers FP draft without release',async()=>{
 let active;const events=[],fp={binding,context:async op=>{const observed=runtime.fieldParametersState(op.id);assert.equal(observed.owned,true);assert.equal(observed.foreign_pending,false);return {binding,identity:{session_id:binding.session,account:binding.account,package_path:binding.packagePath,document_id:'doc',workflow_id:'flow',node_id:'node',type:'transform.reform_columns',input_port:0},resources:{...binding,session_id:binding.session,account:binding.account,package_path:binding.packagePath,document_id:'doc',workflow_id:'flow',node_id:'node',observed_at:Date.now(),deadline:binding.expires,dirty:false,running:false,pending:observed.foreign_pending,unsettled:observed.delivery_unsettled,unknown_effect:observed.unknown}}}};
 const node={document_id:'doc',workflow_id:'flow',node_id:'node'};
 const graph={complete:true,document_id:'doc',workflow_ref:ref,nodes:[{ref:node,type:'transform.reform_columns',label:'FP',position:{x:100,y:100},inputs:[0],outputs:[0]}],links:[],foreign_links:[]};
 const ok=extra=>async()=>({verified:true,cleanup_complete:true,effect_possible:false,...extra});
 const handlers=new Map([['transform.reform_columns',{revision:'fp-private-1',modes:['scalar'],output_wizard:'separate',validate:()=>{},configure:(ctx,p,drivers)=>drivers.configureCalculator(ctx,p)}]]);
 const runtime=createActionRuntime({pinned:{actions:new Map(),selectors:new Map(),pins:{}},fieldParametersCapture:fp,nodeApplyHandlers:handlers,
  nodeTargetAdapterFactory:()=>({observe:async()=>structuredClone(graph),reconcile:async()=>({verified:true,cleanup_complete:true}),preflight:async()=>{}}),
  nodeApplyDriverFactory:context=>{const lazy={};return {...lazy,verifySource:ok({}),mapPorts:async()=>({verified:true,cleanup_complete:true,effect_possible:false,native_mapping:active.f.inputMapping}),openWizard:ok({}),finishGraph:async()=>{throw Error('Done forbidden')},finish:async()=>{throw Error('Done forbidden')},waitExecution:async()=>{throw Error('execute forbidden')},readOutput:async()=>{throw Error('read forbidden')},verifyContinuation:ok({}),configureCalculator:async(ctx,p)=>{active=await driver(undefined,context.operation,fp);return active.d.configureCalculator(ctx,p)}}},
  execute:async()=>{throw Error('No unrelated executor transport')},onRecord:async e=>{events.push(e);return structuredClone(e)}});
 // Native mapping phase driver is a labelled native-store double; actual
 // executor owns creation, phase journal, pending and final private dispatch.
 const initial=await driver();active=initial;
 const request={operation_id:'owned-fp',contract_revision:'1.0.0',document_id:'doc',workflow_ref:ref,target:{kind:'existing',type:'transform.reform_columns',ref:node},inputs:[],mode:'scalar',parameters:{},mappings:[],finish:'done',read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:30000,execute_ms:10000,total_ms:40000}};
 const result=await runtime.runNodeApply(request);assert.equal(result.status,'AMBIGUOUS',JSON.stringify(result));assert.ok(active.operation.fpDraft,JSON.stringify(result));
 const draft=await runtime.captureFieldParametersPreservation(binding);assert.equal(draft.stopped_before_done,true);assert.equal(draft.configured.applied_editors,3);assert.equal(runtime.fieldParametersState('owned-fp').owned,true);assert.throws(()=>runtime.assertPreparationAllowed());assert.equal(active.f.events.filter(e=>e.verb==='apply_reform_column').length,3);await runtime.captureFieldParametersPreservation(binding);assert.equal(active.f.events.filter(e=>e.verb==='apply_reform_column').length,3);
 await assert.rejects(runtime.captureFieldParametersPreservation({...binding,owner:'foreign'}));
 assert.ok(events.some(e=>e.phase==='fp_draft_delivery'));
});
