import test from 'node:test';
import assert from 'node:assert/strict';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {validateCoarseClassesParameters,resolveCoarseClassesFields} from '../lib/coarse-classes-parameters.mjs';
import {coarseClassesOutputColumns} from '../lib/coarse-classes-output.mjs';

const parameters={coarse_classes:{input_field:'Segment',target_field:'Target',event_value:'yes',partition:'automatic',min_class_percent:5,max_classes:2,uniformity_percent:0}};
const fields=[{name:'RowID',type:'integer'},{name:'Segment',type:'string',data_kind:'Дискретный'},{name:'Target',type:'string',data_kind:'Дискретный'},{name:'Note',type:'string'}];
test('coarse classes registers train and saved-model apply with three exact output schemas',()=>{
 const h=createCandidateNodeSupport({}).nodeApplyHandlers.get('preprocessing.coarse_classes');
 assert.deepEqual(h.modes,['internal','apply']);
 const c={fields,input_field:'Segment'};
 assert.deepEqual(coarseClassesOutputColumns(c,0).map(f=>f.name),['RowID','Segment','Segment_ClassNum','Segment_ClassMark','Segment_ClassSignificant','Target','Note']);
 assert.equal(coarseClassesOutputColumns(c,1).length,17);
 assert.deepEqual(coarseClassesOutputColumns(c,1).filter(f=>/Bound$/.test(f.name)).map(f=>f.type),['variant','variant','boolean']);
 assert.equal(coarseClassesOutputColumns(c,2).length,9);
});
test('coarse classes rejects edits in apply, invalid analytic settings and non-discrete predictors',()=>{
 assert.doesNotThrow(()=>validateCoarseClassesParameters(parameters,'internal'));
 assert.doesNotThrow(()=>validateCoarseClassesParameters({},'apply',{target:{kind:'existing'},inputs:[],mappings:[],finish:'execute',read:{ports:[0,1,2]}}));
 for(const patch of [{max_classes:0},{min_class_percent:51},{uniformity_percent:-1},{target_field:'Segment'},{partition:'external'},{event_value:''}])assert.throws(()=>validateCoarseClassesParameters({coarse_classes:{...parameters.coarse_classes,...patch}},'internal'));
 assert.throws(()=>validateCoarseClassesParameters(parameters,'apply'));
 assert.deepEqual(resolveCoarseClassesFields(parameters,fields).input_field,'Segment');
 assert.throws(()=>resolveCoarseClassesFields(parameters,fields.map(f=>({...f,data_kind:'Непрерывный'}))));
});
test('serialized observer binds coarse classes stages and actionable named role cells',async()=>{
 const {Page}=await import('./support/workspace-ui-fixture.mjs');
 for(const [suffix,stage] of [['CoarseClassesWizard-1','coarse_classes'],['CoarseClassesWizard-2','coarse_classes_model'],['DerivedDataSourceMappingEngineOutputPortWizard-2;btnAddMappingColumn','coarse_classes_mapping_2']]){
  const p=new Page(),base='MF;TF-1;WizrdMCF',root=p.add('div',base,'',{x:0,y:70,width:900,height:600});
  const card=p.add('div',base+';'+suffix,'',{x:10,y:80,width:500,height:400},root);
  if(stage==='coarse_classes')p.add('td',base+';CoarseClassesWizard-1;colColumnDisplayName_Segment','Segment',{x:40,y:120,width:100,height:25},card);
  const s=await p.observe();assert.equal(s.wizard.stage,stage);
  if(stage==='coarse_classes')assert.ok(s.ui.elements.find(e=>e.tid?.endsWith(';colColumnDisplayName_Segment'))?.allowed_actions.includes('click'));
 }
});

test('production envelope admits explicit three-port coarse classes requests',async()=>{
 const {validateNodeApplyEnvelope}=await import('../lib/node-api.mjs');
 assert.doesNotThrow(()=>validateNodeApplyEnvelope({target:{type:'preprocessing.coarse_classes'},parameters,mode:'internal',finish:'execute',read:{ports:[0,1,2]}}));
});

test('compact coarse classes request defaults to all three ports',async()=>{
 const {createUserWorkflowBindings}=await import('../lib/user-workflow.mjs');
 const b=createUserWorkflowBindings();b.remember({document_id:'doc',workflow_ref:{workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'tab',navigation_path:[]}});
 const r=b.expandNode({operation_id:'coarse',document_id:'doc',workflow_ref:{workflow_id:'flow'},target:{kind:'new',type:'preprocessing.coarse_classes'},parameters,finish:'execute'});
 assert.deepEqual(r.read.ports,[0,1,2]);
});
