import test from 'node:test';
import assert from 'node:assert/strict';
import {NODE_TYPES} from '../lib/node-contracts.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {validateLgdImportParameters,validateLgdExportParameters} from '../lib/lgd-parameters.mjs';
import {readFileSync} from 'node:fs';
import {describeNodeTypes} from '../lib/node-contracts.mjs';
import {nodeApiTools} from '../lib/node-api.mjs';
import {userNodeTool,createUserWorkflowBindings} from '../lib/user-workflow.mjs';
import {makeNativeOutputDownloadCode} from '../lib/executor.mjs';
import {lgdExportNext} from '../lib/lgd-export-procedure.mjs';
import {applyNode} from '../lib/node-apply.mjs';
import {verifyLgdOutputMapping} from '../lib/lgd-import-node.mjs';
import {createNodeProcedure} from '../lib/node-procedure.mjs';
test('native LGD preserves Variant with its observed undefined data kind',()=>{
 const source={record_id:'native-source',index:0,name:'Values',label:'Значения',type:'variant'};
 const mapping={inventory_complete:true,source_identity_verified:true,source_fields:[source],target_fields:[{...source,record_id:'native-target',data_kind:'Неопределенное',excluded:false,source}]};
 assert.equal(verifyLgdOutputMapping(mapping),mapping);
 for(const kind of ['Дискретный','Непрерывный','unknown']){
  const changed=structuredClone(mapping);changed.target_fields[0].data_kind=kind;assert.throws(()=>verifyLgdOutputMapping(changed));
 }
});
test('LGD reads native Variant tags through the existing completed-port reader',async()=>{
 const node={document_id:'doc',workflow_id:'flow',node_id:'node'},binding={document_id:'doc',workflow_ref:{workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'crumb',label:'Scenario'}]},node};
 const operation={id:'lgd-read',deadline:10000,action:{action_key:'node.apply',revision:'1'},parameters:{target:{type:'imports.lgd'},mode:'native'}};
 let calls=0;
 const channel=createNodeProcedure({operation,preparedNodeContext:binding,targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2',now:()=>1,
  record:async r=>structuredClone(r),wrapMutation:()=>assert.fail('read cannot mutate'),execute:async code=>{
   calls++;assert.match(code,/"typedVariants":true/);return {verified:true,cleanup_complete:true,node_context:{...node,verified:true},output:{port:0,fresh:true,execution_id:'execution',freshness_basis:'completed_execution_port_source'}};
  }});
 await channel.readOutputPort({port:0,sampleRows:100,requireExactNumbers:true,execution:{verified:true,owner_verified:true,status:'completed',execution_id:'execution',process_id:'1',process_record_id:'process'}});
 assert.equal(calls,1);assert.equal(operation.cleanupConfirmed,true);
});
test('LGD native source inventory omits kind while target retains observed kind and exact source order',()=>{
 const sources=[{record_id:'1',index:0,name:'RecordId',label:'Идентификатор',type:'integer'},
  {record_id:'2',index:1,name:'Amount',label:'Сумма',type:'real'}];
 const mapping={verified:true,inventory_complete:true,source_identity_verified:true,source_fields:sources,
  target_fields:sources.map((s,i)=>({...s,record_id:'target'+i,excluded:false,data_kind:i?'Непрерывный':'Дискретный',source:structuredClone(s)}))};
 assert.equal(verifyLgdOutputMapping(mapping),mapping);
 for(const mutate of [m=>m.target_fields.reverse(),m=>m.target_fields[0].name='Other',m=>m.target_fields[0].label='Other',
  m=>m.target_fields[0].type='real',m=>m.target_fields[0].excluded=true,m=>m.target_fields[0].source.record_id='foreign',
  m=>m.target_fields[0].data_kind='unknown']){
  const changed=structuredClone(mapping);mutate(changed);assert.throws(()=>verifyLgdOutputMapping(changed),/properties changed/);
 }
});
const request=type=>({target:{kind:'new',type},inputs:type==='exports.lgd'?[{}]:[],mappings:[],read:{ports:type==='exports.lgd'?[]:[0],sample_rows:0,require_exact_numbers:false}});
test('LGD checksum refusal releases only a proven discarded own wizard and never executes',async()=>{
 for(const foreign of [false,true]){
  const node={document_id:'doc',workflow_id:'workflow',node_id:'node'},operation={id:'lgd-corrupt'},phases=[];
  const request={operation_id:operation.id,contract_revision:'1.0.0',document_id:'doc',workflow_ref:{workflow_id:'workflow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Сервер',label:''}]},target:{kind:'new',type:'imports.lgd'},inputs:[],mode:'native',parameters:{},mappings:[],finish:'execute',read:{ports:[0],sample_rows:5,require_exact_numbers:true},budgets:{configure_ms:1000,execute_ms:1000,total_ms:10000}};
  const ok=async()=>({verified:true,cleanup_complete:true,effect_possible:false});
  const refusal={phase:'configure',status:'FAILED',effect_possible:true,cleanup_complete:true,settings_unchanged:true,execution_started:false,verification:'lgd_import_native_refused',proof:{closed:{verified:true,cleanup_complete:true,draft_discarded:true,settings_applied:false,execution_started:false,node_context:{...node,node_id:foreign?'other':'node',verified:true,surface:'graph'}}}};
  const h=new Map([['imports.lgd',{revision:'test',modes:['native'],validate:()=>{},configure:async()=>{throw Object.assign(Error('Контрольная сумма блока не совпадает'),{nodePhaseRefusal:refusal});}}]]);
  const drivers={verifySource:ok,prepareTarget:async()=>({...await ok(),node}),mapPorts:ok,openWizard:ok,finish:()=>assert.fail('must not finish'),waitExecution:()=>assert.fail('must not execute')};
  const r=await applyNode({operation,request,handlers:h,drivers,now:()=>1,record:async e=>{phases.push(e);return structuredClone(e);}});
  assert.equal(r.status,foreign?'AMBIGUOUS':'FAILED');assert.equal(r.cleanup_complete,!foreign);
  assert.equal(r.pending_phase,foreign?'configure':null);assert.match(r.error.message,/Контрольная сумма/);
 }
});
test('LGD import and export register distinct native palette types and sink ports',()=>{
 const h=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'}).nodeApplyHandlers;
 for(const type of ['imports.lgd','exports.lgd']){
  assert.deepEqual(NODE_TYPES[type].modes,['native']);assert.deepEqual(h.get(type).modes,['native']);
  assert.equal(NODE_TYPES[type].palette_group,type==='imports.lgd'?'Импорт':'Экспорт');
  assert.equal(NODE_TYPES[type].tabular_outputs,type==='imports.lgd'?1:0);
 }
 assert.equal(h.get('exports.lgd').fileOutput,true);
});
test('LGD file sink defaults and bound file download preserve the existing native lifecycle',()=>{
 const b=createUserWorkflowBindings();b.remember({document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',navigation_path:[]}});
 assert.deepEqual(b.expandNode({document_id:'doc',workflow_ref:{workflow_id:'wf'},target:{type:'exports.lgd'},finish:'execute'}).read,{ports:[],sample_rows:0,require_exact_numbers:false});
 const directory='/operator/exports',name='roundtrip.lgd';
 assert.equal(typeof makeNativeOutputDownloadCode({output_binding:{execution_id:'exec',node_id:'sink',session_id:'session',directory,destination:directory+'/'+name},artifact:{name},file_ref:'ui-file',expected_bytes:334,
  storage_directories:{packages:'/operator/packages',inputs:'/operator/inputs',exports:directory},snapshot:{workflow_ref:{prefix:'MF;TF-1'},file_storage:{directory},ui:{elements:[{ref:'ui-file',allowed_actions:['double_click'],label:name,tid:'MF;TF-1;FileStorageForm;colName_'+name,storage_entry:{bytes:334}}]}}}),'string');
});
test('LGD Next rejects an existing destination and never repeats an uncertain click',async()=>{
 for(const uncertain of [false,true]){
  let clicked=false,question=false;const gestures=[];
  const node={verified:true,surface:'wizard',node_id:'sink'},before={verified:true,stage:'lgd_export',values:{destination:{value:'/test-2/out.lgd'}},node_context:node};
  const task={operation_id:'lgd-next',origin:'https://example.test',deadline:Date.now()+5000,overwrite:'reject',destination:'/test-2/out.lgd',before,binding:{node:{node_id:'sink'},workflow_ref:{prefix:'MF;TF-1'}}};
  const page={evaluate:async fn=>fn.toString().includes('location.origin')?true:{present:question,exact:question},locator:selector=>({count:async()=>1,elementHandle:async()=>({evaluate:async()=>true,dispose:async()=>{},click:async()=>{
   gestures.push(selector);if(uncertain)throw Error('unknown click');if(clicked)question=false;else{clicked=true;question=true;}
  }})}),waitForTimeout:async()=>{}};
  const r=await lgdExportNext(page,task,async()=>node,async()=>structuredClone(before),()=>{},{});
  assert.equal(gestures.length,uncertain?1:2);assert.equal(r.status,uncertain?'AMBIGUOUS':'SUCCEEDED');
  if(!uncertain){assert.equal(r.output.rejected,true);assert.match(gestures[1],/msgbox;tlb;no/);}
 }
});
test('model-visible LGD cards and routing fit their budgets',()=>{
 const h=createCandidateNodeSupport({}).nodeApplyHandlers;
 const tool=userNodeTool(nodeApiTools.find(t=>t.name==='dock_node_apply'));
 assert.ok(Buffer.byteLength(JSON.stringify({name:tool.name,description:tool.description,inputSchema:tool.inputSchema}))<=20000);
 for(const c of describeNodeTypes(['imports.lgd','exports.lgd'],{},new Map(),h))assert.ok(Buffer.byteLength(JSON.stringify(c))<=12000);
 for(const n of ['imports.lgd','exports.lgd']){
  const content=readFileSync(new URL('../../../product/skills/loginom-automation/references/nodes/'+n+'.md',import.meta.url),'utf8');
  assert.ok(Buffer.byteLength(content)<=6000);assert.doesNotMatch(content,/\$[1-9]|\$ARGUMENTS/);
 }
});
test('LGD preflight rejects disabled checksums, foreign format options and synthetic sink output',()=>{
 const source={artifact_id:'fixture',upload_operation_id:'delivery'};
 assert.doesNotThrow(()=>validateLgdImportParameters({source,lgd_import:{checksum:'verify'}},'native',request('imports.lgd')));
 for(const p of [{source,lgd_import:{checksum:'ignore'}},{source,excel:{}},{}])assert.throws(()=>validateLgdImportParameters(p,'native',request('imports.lgd')));
 assert.doesNotThrow(()=>validateLgdImportParameters({},'native',{...request('imports.lgd'),target:{kind:'existing'}}));
 const p={lgd_export:{destination:'/test-2/out.lgd',compression:'lz4',checksum:'compressed',overwrite:'reject'}};
 assert.doesNotThrow(()=>validateLgdExportParameters(p,'native',request('exports.lgd')));
 for(const change of [{compression:'lzo'},{checksum:'none'},{overwrite:'replace'},{destination:'/test-2/out.xlsx'}])assert.throws(()=>validateLgdExportParameters({lgd_export:{...p.lgd_export,...change}},'native',request('exports.lgd')));
 assert.throws(()=>validateLgdExportParameters(p,'native',{...request('exports.lgd'),read:{ports:[0]}}));
});
