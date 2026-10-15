import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {verifyCalculatorOutputMutation,verifyCalculatorPortCommit} from '../lib/calculator-port-commit.mjs';
import {applyNode} from '../lib/node-apply.mjs';
import {configureOutputAutosync,configureOutputFields,resolveConfiguredOutputMapping,reorderOutputFields} from '../lib/port-mapping-procedure.mjs';
import {readOutputDefinitionPages} from '../lib/import-definition-pages.mjs';
const marker=(verb='apply_output_column',root='wizard')=>({verb,wizard_root_ref:root,...(verb==='click'?{control:'autosync'}:{})});
const changed=m=>({verified:true,effect_possible:true,mutation:m});
for(const kind of ['empty','noop','exclusion','reorder','missing','foreign','unverified','unknown-click','column','autosync'])test('only an applied column or actual autosync in this wizard permits Done: '+kind,()=>{
 let changes=[];
 if(kind==='noop')changes=[{verified:true,effect_possible:false,edits:[]}];
 if(kind==='exclusion')changes=[{verified:true,effect_possible:true,edits:[{verified:true,effect_possible:true,excluded:true}]}];
 if(kind==='reorder')changes=[{verified:true,effect_possible:true,moves:1}];
 if(kind==='missing')changes=[changed(undefined)];
 if(kind==='foreign')changes=[changed(marker('apply_output_column','other'))];
 if(kind==='unverified')changes=[{...changed(marker()),verified:false}];
 if(kind==='unknown-click')changes=[changed({...marker('click'),control:'other'})];
 if(kind==='column')changes=[{verified:true,effect_possible:true,edits:[changed(marker())]}];
 if(kind==='autosync')changes=[changed(marker('click'))];
 if(['column','autosync'].includes(kind))assert.doesNotThrow(()=>verifyCalculatorOutputMutation(changes,'wizard'));
 else assert.throws(()=>verifyCalculatorOutputMutation(changes,'wizard'),/Done withheld/);
});

// Real Calculator mapPorts, finishWizard and applyNode phase shell. Earlier
// configured state, channel/Page/native transitions and mapping helpers are
// doubles. The linked controls use production autosync or field editing,
// batch mapping and definition paging; their markers are never fabricated.
// This verifies dispatch/publication boundaries, not native commit.
const source=await readFile(process.env.CALCULATOR_NODE_SOURCE??new URL('../lib/calculator-node.mjs',import.meta.url),'utf8');
const declaration='let channel,activeSignal,configured,mapping,columns,executionDriver,executionReceipt,multipleOutputs,preconfiguration,inputCheckpoint,outputCheckpoint,configurationGraph;';
assert.ok(source.includes(declaration));
const code=source.replace(/^import .*;\n/gm,'').replaceAll('export ','').replace(declaration,declaration+'configured=fixtureConfiguration;');
for(const mode of ['noop','column-true','autosync-true','column-false','foreign','linked-autosync-false','linked-column-false'])test('real output driver/shell preserves pending or commits after one mutation: '+mode,async()=>{
 const node={document_id:'doc',workflow_id:'flow',node_id:'node'},events=[],records=[];
 const configuration={expressions:[],input_fields:[{name:'Region',label:'Region',type:'string'}]};
 const native={verified:true,inventory_complete:true,source_identity_verified:true,target_fields:[{name:'Region',label:'Region',type:'string',data_kind:'Дискретный',excluded:false}],node_context:{...node,verified:true,surface:'wizard',locked:false}};
 const linkedColumn=mode==='linked-column-false';
 if(linkedColumn){
  const source={record_id:'source-region',field_id:'4',index:0,name:'Region',label:'Region',type:'string',required:false};
  native.mapping_wizard='DerivedDataSourceOutputSocketWizard';native.source_fields=[source];native.rendered_indices=[0];
  Object.assign(native.target_fields[0],{record_id:'target-region',field_id:'4',index:0,required:false,inherited:false,group_index:0,source:structuredClone(source)});
 }
 const originalColumn=structuredClone(native.target_fields[0]);
 const definition={total_columns:1,fields:structuredClone(native.target_fields)};
 const linked=mode==='linked-autosync-false';
 let finished=false,autosync=!linked;native.autosync=autosync;
 let editor=false,draft={};
 const state=()=>({wizard:finished?{status:'absent'}:{status:'observed',stage:'output_mapping',root_ref:'wizard',root_tid:'W',
  column_parameters:editor?{status:'observed',root_ref:'editor',selected_column:{...originalColumn,status:'observed'},fields:{name:{value:draft.name,input_ref:'name'},label:{value:draft.label,input_ref:'label'}}}:undefined,
  output_columns:{auto_sync:{status:'observed',value:autosync,ref:'auto'},
   page:{status:'complete_definition_page',schema_id:autosync?'on':'off',offset:0,limit:8,total_columns:1,returned:1,next_offset:null},
   fields:[{...native.target_fields[0],status:'observed',index:0,name_ref:'column-name',label_ref:'column-label',selected:editor,source:{cell_ref:'cell',status:'rendered_source',label:'Region',type:'string'}}]}},node_mapping:native,
  prepared_node_context:{...node,verified:true,surface:finished?'graph':'wizard',locked:false},ui:{elements:editor?[
   ...['name','label'].map(name=>({ref:name,wizard_field:{scope:'output_column',name},allowed_actions:['set_wizard_field']})),
   {ref:'apply',column_close:{scope:'output'},allowed_actions:['apply_output_column']}]:[
   {ref:'column-name',allowed_actions:['double_click']},{tid:'W;ColumnsMappingEngineOutputPortWizard;btnAutoSyncThroughColumns',ref:'auto',allowed_actions:['click']},{tid:'W;btnDone',ref:'done',allowed_actions:['finish_wizard']}]}});
 const channel={openOutputPort:async()=>events.push('open'),observe:async o=>{const s=structuredClone(state());assert.ok(o.ready(s),o.condition);return s},
  perform:async o=>{const s=structuredClone(state());assert.ok(o.ready(s));const action=o.resolve(s);
   if(action.verb==='double_click'){assert.ok(linkedColumn);assert.equal(action.ref,'column-name');editor=true;draft={name:originalColumn.name,label:originalColumn.label};events.push('column-editor');}
   else if(action.verb==='set_wizard_field'){assert.ok(linkedColumn&&editor);assert.equal(action.ref,'label');draft.label=action.text;events.push('column-label');}
   else if(action.verb==='apply_output_column'){assert.ok(linkedColumn&&editor);assert.equal(action.ref,'apply');native.target_fields[0]={...native.target_fields[0],...draft};editor=false;events.push('apply_output_column');}
   else if(action.verb==='click'){assert.ok(linked);assert.equal(action.ref,'auto');assert.equal(autosync,false);events.push('autosync-click');autosync=true;native.autosync=true;}
   else {assert.equal(action.verb,'finish_wizard');events.push('done');finished=true;}}};
 const fieldChange=['noop','autosync-true'].includes(mode)?{verified:true,effect_possible:false,edits:[]}:{verified:true,effect_possible:true,edits:[changed(marker('apply_output_column',mode==='foreign'?'other':'wizard'))]};
 const options={fixtureConfiguration:configuration,calculatorConfigurationReadback:()=>{},calculatorParametersSchema:{},createNodeProcedure:()=>channel,
  resolveConfiguredOutputMapping:linkedColumn?resolveConfiguredOutputMapping:()=>({fields:null}),reorderOutputFields,configureOutputFields:linkedColumn?configureOutputFields:async()=>{events.push(mode==='noop'?'field-noop':'apply_output_column');return fieldChange},
  configureOutputAutosync:linked?configureOutputAutosync:async()=>{events.push(mode==='autosync-true'?'autosync-click':'autosync-noop');return mode==='autosync-true'?changed(marker('click')):{verified:true,effect_possible:false}},
  readOutputDefinitionPages:linkedColumn?readOutputDefinitionPages:async()=>definition,inputMappingGraph:g=>g,outputMappingOrigin:x=>x,outputMappingState:x=>x,outputRecoveryCalculatorState:x=>x,
  sameInputRecovery:(a,b)=>JSON.stringify(a)===JSON.stringify(b),verifyCalculatorOutputMutation,verifyCalculatorPortCommit,makeCalculatorPortCommitCode:()=>'',structuredClone};
 const support=vm.runInNewContext(code+';createCalculatorNodeSupport({targetOrigin:"https://own.test",targetBuild:"7.4.2"})',options);
 const request={operation_id:mode,contract_revision:'1.0.0',document_id:'doc',workflow_ref:{workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Сервер',label:''}]},target:{kind:'existing',type:'transform.calculator',ref:node},inputs:[],mode:'expression',parameters:{expressions:[]},
  mappings:[{direction:'output',port:0,...(linkedColumn?{changes:[{source:{kind:'configured_field',name:'Region'},label:'Region display'}]}:{autosync:true,...(linked?{}:{changes:[{source:{kind:'configured_field',name:'Region'},excluded:false}]})})}],finish:'done',read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:10000,execute_ms:10000,total_ms:600000}};
 const operation={id:mode,parameters:request,nodeTargetAdapter:{observe:async()=>({})}};
 const record=async e=>{records.push(structuredClone(e));return structuredClone(e)};
 const proof={verified:true,modified:!['column-false','linked-autosync-false','linked-column-false'].includes(mode),observation:'after_output_port_done',package_saved:false,persisted_content_verified:false,node_context:{...node,verified:true,surface:'graph',locked:false}};
 const driver=support.nodeApplyDriverFactory({operation,now:()=>1,execute:async()=>{events.push('modified-read');return proof},onRecord:record});
 const good=()=>({verified:true,cleanup_complete:true,effect_possible:true});
 const drivers={verifySource:async()=>good(),prepareTarget:async()=>({...good(),node}),openWizard:async()=>good(),finish:async()=>({...good(),mode:'done',settings_applied:true,execution_started:false}),finishGraph:async()=>{events.push('final-finish');return {...good(),mode:'done',settings_applied:true,execution_started:false}},
  mapPorts:async(m,c)=>c.receipt_id.endsWith(':input_mapping')?good():driver.mapPorts(m,c)};
 const handlers=new Map([['transform.calculator',{revision:'fixture',modes:['expression'],output_wizard:'separate',validate:()=>{},configure:async()=>good()}]]);
 const result=await applyNode({request,operation,handlers,drivers,now:()=>1,record});
 const allowed=['column-true','autosync-true'].includes(mode);
 assert.equal(result.status,allowed?'SUCCEEDED':'AMBIGUOUS',JSON.stringify({result,events}));assert.equal(operation.nodeApply.deadline,600001);
 if(allowed){assert.equal(result.configuration.status,'applied');assert.equal(events.filter(x=>x==='done').length,1);assert.ok(events.includes('modified-read'));}
 else {assert.equal(result.configuration,undefined);assert.equal(result.pending_phase,'output_mapping');assert.ok(!events.includes('final-finish'));assert.ok(!records.some(r=>r.phase==='node_checkpoint'));}
 if(['noop','foreign'].includes(mode)){assert.ok(!events.includes('done'));assert.ok(!events.includes('modified-read'));assert.ok(!records.some(r=>r.phase==='node_output_mapping_commit_prepared'));}
 if(linked){
  assert.deepEqual(events,['open','autosync-click','done','modified-read']);
  const commit=records.find(r=>r.phase==='node_output_mapping_commit_prepared');assert.ok(commit);
  const changes=commit.checkpoint.value.changes;assert.equal(changes.length,1);
  assert.deepEqual(changes[0].autosync,{before:false,value:true});assert.equal(changes[0].effect_possible,true);assert.equal(changes[0].verified,true);
  assert.deepEqual(changes[0].mutation,{verb:'click',control:'autosync',wizard_root_ref:'wizard'});
  const state=records.find(r=>r.phase==='node_output_mapping_package_state');assert.equal(state.proof.modified,false);assert.equal(result.error.message,'Calculator port commit: package modification not confirmed');
 }
 if(linkedColumn){
  assert.deepEqual(events,['open','column-editor','column-label','apply_output_column','done','modified-read']);
  const commit=records.find(r=>r.phase==='node_output_mapping_commit_prepared');assert.ok(commit);
  const changes=commit.checkpoint.value.changes,fields=changes.find(change=>Array.isArray(change.edits));
  assert.equal(fields.verified,true);assert.equal(fields.effect_possible,true);assert.equal(fields.edits.length,1);
  assert.equal(fields.edits[0].verified,true);assert.equal(fields.edits[0].effect_possible,true);
  assert.deepEqual(fields.edits[0].mutation,{verb:'apply_output_column',wizard_root_ref:'wizard'});
  assert.equal(commit.checkpoint.value.native_mapping.target_fields[0].label,'Region display');
  assert.equal(commit.checkpoint.value.native_mapping.target_fields[0].source.name,'Region');
  assert.equal(records.find(r=>r.phase==='node_output_mapping_package_state').proof.modified,false);
  assert.equal(result.error.message,'Calculator port commit: package modification not confirmed');
 }
 if(mode==='column-false'){assert.equal(events.filter(x=>x==='done').length,1);assert.ok(events.includes('modified-read'));}
});
