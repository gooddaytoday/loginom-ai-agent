import test from 'node:test';
import assert from 'node:assert/strict';
import {validateFactorAnalysisParameters,resolveFactorAnalysisFeatures} from '../lib/factor-analysis-parameters.mjs';
import {factorAnalysisOutputColumns,alignFactorAnalysisOutput} from '../lib/factor-analysis-output.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {nodeApplyInputSchema} from '../lib/node-api.mjs';
import {NODE_TYPES} from '../lib/node-contracts.mjs';
const request={target:{kind:'new'},inputs:[{input:0}],mappings:[],read:{ports:[0,1]}};
const parameters={factor_analysis:{features:['X','Y','Z'],factors:2,rotation:'none'}};
const fields=['RowID','X','Y','Z','Tag'].map((name,i)=>({name,label:name,type:i===0?'integer':i===4?'string':'real',data_kind:i===4?'Дискретный':'Непрерывный',usage_type:i>0&&i<4?3:0}));
test('factor analysis is registered with separate parameters and two outputs',()=>{
 const h=createCandidateNodeSupport({}).nodeApplyHandlers.get('research.factor_analysis');
 assert.deepEqual(h.modes,['pca_fixed']);
 assert.equal(NODE_TYPES['research.factor_analysis'].tabular_outputs,2);
 assert.ok(nodeApplyInputSchema.properties.parameters.properties.factor_analysis);
 h.validate(parameters,'pca_fixed',request);
});
test('reject incomplete, unsupported or inconsistent PCA settings before UI',()=>{
 for(const p of [{},{factor_analysis:{features:['X','X'],factors:2,rotation:'none'}},{factor_analysis:{features:['X','Y'],factors:3,rotation:'none'}},{factor_analysis:{features:['X','Y'],factors:2,rotation:'varimax'}},{factor_analysis:{...parameters.factor_analysis,seed:42}}])assert.throws(()=>validateFactorAnalysisParameters(p,'pca_fixed',request));
 validateFactorAnalysisParameters({},'pca_fixed',{...request,target:{kind:'existing'}});
 assert.throws(()=>validateFactorAnalysisParameters(parameters,'apply',request));
 assert.throws(()=>resolveFactorAnalysisFeatures({factor_analysis:{features:['Tag']}},fields));
 assert.throws(()=>resolveFactorAnalysisFeatures({factor_analysis:{features:['Z','X']}},fields));
 resolveFactorAnalysisFeatures(parameters,fields);
});
test('native P factor fields persist for K<P and order is strict',()=>{
 const c={fields,factors:2};
 const scores=factorAnalysisOutputColumns(c,0),loadings=factorAnalysisOutputColumns(c,1);
 assert.deepEqual(scores.map(f=>f.name),['Factor1','Factor2','Factor3','RowID','X','Y','Z','Tag']);
 assert.deepEqual(loadings.map(f=>f.name),['ColumnName','ColumnDisplayName','Factor1','Factor2','Factor3']);
 assert.deepEqual(alignFactorAnalysisOutput(scores,scores),scores);
 assert.throws(()=>alignFactorAnalysisOutput([...scores.slice(0,3),scores[4],scores[3],...scores.slice(5)],scores));
 assert.throws(()=>alignFactorAnalysisOutput(scores.slice(1),scores));
});

test('PCA controls are read from owned visible DOM and cached native values',async()=>{
 const {readFactorAnalysisBrowser,readFactorAnalysisContext}=await import('../lib/factor-analysis-context.mjs');
 const {runInNewContext}=await import('node:vm');
 const base='MF;TF;WizrdMCF;FactorAnalysisWizard;',elements=[],components={};
 const add=(tid,value)=>{const element={id:'c'+elements.length,tid,checkVisibility:()=>true};elements.push(element);components[element.id]={el:{dom:element},getValue:()=>value};return element;};
 add(base.slice(0,-1));
 for(const [name,value] of Object.entries({pedSignificanceCriterion:{'enumRadioPropEdit-2609enumGroup':'2'},pedEigenValuesThreshold:1,pedCumDispersion:90,pedNFactors:2,pedRotationType:{'enumRadioPropEdit-2639enumGroup':'0'},pedNOutFactorsMax:1}))add(base+name+';ValueControl',value);
 const cap=add(base+'cntOutFactorsMax;cnt;chb',false);
 const context={Ext:{getCmp:id=>components[id]},document:{querySelectorAll:q=>q.startsWith('[data-tid=')?elements.filter(e=>e.tid===JSON.parse(q.slice(10,-1))):[]}};
 const read=()=>runInNewContext('('+readFactorAnalysisBrowser.toString()+')("MF;TF")',context);
 assert.equal(read().verified,true);assert.equal(read().criterion,2);assert.equal(read().rotation,0);assert.equal(read().output_cap,false);
 components[cap.id].el.dom={};assert.equal(read().verified,false);
 let owner=0;
 assert.equal((await readFactorAnalysisContext({evaluate:async()=>({verified:true})},{workflow_ref:{prefix:'MF;TF'}},async()=>({verified:true,surface:'wizard',node_id:++owner}))).verified,false);
});

test('factor type and compact tool stay within the approved model-visible budgets',async()=>{
 const {nodeApiTools}=await import('../lib/node-api.mjs');
 const {userNodeTool}=await import('../lib/user-workflow.mjs');
 const {describeNodeTypes}=await import('../lib/node-contracts.mjs');
 const {readFileSync}=await import('node:fs');
 const tool=userNodeTool(nodeApiTools.find(t=>t.name==='dock_node_apply'));
 assert.ok(Buffer.byteLength(JSON.stringify({name:tool.name,description:tool.description,parameters:tool.inputSchema}))<=20000);
 const card=describeNodeTypes(['research.factor_analysis'],{},new Map(),createCandidateNodeSupport({}).nodeApplyHandlers,'7.4.2')[0];
 assert.ok(Buffer.byteLength(JSON.stringify(card))<=12000);
 const route=readFileSync(new URL('../../../product/skills/loginom-automation/SKILL.md',import.meta.url),'utf8').split('\n').find(l=>l.includes('references/nodes/research.factor_analysis.md'));
 assert.ok(route&&Buffer.byteLength(route)<=200);
 const reference=readFileSync(new URL('../../../product/skills/loginom-automation/references/nodes/research.factor_analysis.md',import.meta.url),'utf8');
 assert.ok(Buffer.byteLength(reference)<=6000);assert.doesNotMatch(reference,/\$(?:\d+|ARGUMENTS)/);
});

test('PCA settings commit follows native role binding and preserves existing supported settings',async()=>{
 const {configureFactorAnalysis}=await import('../lib/factor-analysis-procedure.mjs');
 const node={verified:true,document_id:'doc',workflow_id:'wf',node_id:'pca'};
 const nativeFields=fields.map((f,index)=>({...f,index,field_id:String(index),record_id:'role'+index}));
 const source_fields=nativeFields.map((f,index)=>({...f,record_id:'source'+index}));
 const inputMapping={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'TuneDataSourceMappingWizard',node_context:{...node,input_port:{port:0}},source_fields,
  target_fields:nativeFields.map((f,i)=>({...f,source:source_fields[i]}))};
 let stage='input_mapping';const actions=[];
 const values={pedEigenValuesThreshold:1,pedCumDispersion:90,pedNOutFactorsMax:1};
 const channel={
  async observe({ready}){
   const state={prepared_node_context:node,wizard:{stage,root_tid:'wizard'},ui:{elements:[{tid:'wizard;btnNext',ref:'next',allowed_actions:['wizard_step']}]},
    node_factor_analysis:stage==='input_mapping'?{verified:true,inventory_complete:true,node_context:node,fields:nativeFields}
     :{verified:true,kind:'parameters',criterion:2,rotation:0,factors:2,output_cap:false,values,switches:{}}};
   assert.equal(ready(state),true);return state;
  },
  async perform(task){const state=await this.observe({ready:task.ready});const action=task.resolve(state);actions.push(action);stage=action.expected_stage;return {verified:true};},
 };
 const result=await configureFactorAnalysis(channel,{}, {inputMapping,request:{target:{kind:'existing'}}});
 assert.equal(result.validation.status,'accepted_by_loginom_next');
 assert.equal(result.configuration.factors,2);assert.equal(result.configuration.rotation,'none');
 assert.deepEqual(result.configuration.fields.filter(f=>f.usage_type===3).map(f=>f.name),['X','Y','Z']);
 assert.deepEqual(actions.map(a=>a.expected_stage),['factor_analysis','done']);
 const foreign=structuredClone(inputMapping);foreign.node_context.node_id='foreign';stage='input_mapping';
 await assert.rejects(()=>configureFactorAnalysis(channel,{}, {inputMapping:foreign}),/owned input/);
});

test('PCA readback requires distinct completed training and execution receipts',async()=>{
 const {factorAnalysisConfigurationReadback}=await import('../lib/factor-analysis-readback.mjs');
 const node={document_id:'doc',workflow_id:'wf',node_id:'pca'},operation_id='factor';
 const mapped=[0,1].map(port=>({port,mapping:{target_fields:factorAnalysisOutputColumns({fields},port).map(f=>({...f,source:{name:f.name}}))}}));
 const phases=['input_mapping','configure','node_finish','output_mapping','finish'].map(phase=>({phase,status:'verified',receipt_id:operation_id+':'+phase,value:{verified:true,cleanup_complete:true,
  ...(phase==='configure'?{configuration:{verified:true,node_context:node,fields,factors:2,rotation:'none',criterion:'fixed',output_cap:false},validation:{status:'accepted_by_loginom_next'}}:{}),
  ...(phase==='node_finish'?{settings_applied:true}:{}),...(phase==='output_mapping'?{ports:mapped}:{}),
  ...(phase==='finish'?{mode:'execute',settings_applied:true,execution_id:'execute',training:{status:'trained',execution_id:'train',source:[{node:{...node,node_id:'source'},output:0,input:0}]}}:{})}}));
 const readback=factorAnalysisConfigurationReadback({node,phases,operation_id});
 assert.equal(readback.kind,'factor_analysis');assert.equal(readback.output_mappings.length,2);assert.deepEqual(readback.features,['X','Y','Z']);
 for(const change of [p=>p.at(-1).value.training.execution_id='execute',p=>p.at(-1).value.training.status='not_requested',p=>p[1].value.configuration.rotation='varimax',p=>p[1].value.configuration.node_context={...node,node_id:'foreign'}]){
  const bad=structuredClone(phases);change(bad);assert.throws(()=>factorAnalysisConfigurationReadback({node,phases:bad,operation_id}));
 }
});

test('observed PCA radio DisplayEl controls select fixed count and no rotation',async()=>{
 const {configureFactorAnalysis}=await import('../lib/factor-analysis-procedure.mjs');
 const owner={verified:true,document_id:'doc',workflow_id:'wf',node_id:'pca'};
 const nativeFields=fields.map((f,index)=>({...f,index,field_id:String(index),record_id:'r'+index}));
 const source_fields=nativeFields.map((f,i)=>({...f,record_id:'s'+i}));
 const inputMapping={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'TuneDataSourceMappingWizard',node_context:{...owner,input_port:{port:0}},source_fields,target_fields:nativeFields.map((f,i)=>({...f,source:source_fields[i]}))};
 let stage='input_mapping',criterion=0,rotation=1,output_cap=true;const actions=[];
 const control=key=>({tid:'wizard;FactorAnalysisWizard;'+key,ref:key,allowed_actions:['set_checked']});
 const state=()=>({prepared_node_context:owner,wizard:{stage,root_tid:'wizard'},ui:{elements:[{tid:'wizard;btnNext',ref:'next',allowed_actions:['wizard_step']},
  ...['pedSignificanceCriterion;ValueControl;radiofield-2;DisplayEl','pedRotationType;ValueControl;radiofield;DisplayEl','cntOutFactorsMax;cnt;chb;InputEl'].map(control)]},
  node_factor_analysis:stage==='input_mapping'?{verified:true,inventory_complete:true,node_context:owner,fields:nativeFields}
   :{verified:true,kind:'parameters',criterion,rotation,factors:2,output_cap,values:{pedEigenValuesThreshold:1,pedCumDispersion:90,pedNOutFactorsMax:1},switches:{}}});
 const channel={async observe({ready}){const s=state();assert.equal(ready(s),true);return s;},async perform(task){const s=state();assert.equal(task.ready(s),true);const a=task.resolve(s);actions.push(a);
  if(a.verb==='wizard_step')stage=a.expected_stage;
  else if(a.ref.startsWith('pedSignificanceCriterion'))criterion=2;
  else if(a.ref.startsWith('pedRotationType'))rotation=0;
  else if(a.ref.startsWith('cntOutFactorsMax'))output_cap=false;
  return {verified:true};}};
 const r=await configureFactorAnalysis(channel,parameters,{inputMapping,request:{target:{kind:'new'}}});
 assert.equal(r.configuration.rotation,'none');assert.equal(r.configuration.factors,2);assert.equal(r.configuration.output_cap,false);
 assert.deepEqual(actions.filter(a=>a.verb==='set_checked').map(a=>a.ref),['pedSignificanceCriterion;ValueControl;radiofield-2;DisplayEl','pedRotationType;ValueControl;radiofield;DisplayEl','cntOutFactorsMax;cnt;chb;InputEl']);
});
