import test from 'node:test';
import assert from 'node:assert/strict';
import {coarseClassesMaterializedModel} from '../lib/coarse-classes-output.mjs';
import {coarseClassesConfigurationReadback} from '../lib/coarse-classes-readback.mjs';
import {configureCoarseClasses} from '../lib/coarse-classes-procedure.mjs';
const cell=(type,value)=>({type,value,is_null:false,precision:type==='real'?'17_significant_digits':type==='integer'?'exact_integer':'display_text'});
function ports(){return [{port:1,fresh:true,sample_complete:true,row_count:2,schema:['ColumnName','ClassNumber','ClassMark','WoE','IV'].map(name=>({name})),sample:[['Segment','0','[B]',-Math.log(4),.8],['Segment','1','[A]',Math.log(4),.8]].map(r=>r.map((v,i)=>cell(['string','integer','string','real','real'][i],v)))},{port:2,fresh:true,sample_complete:true,row_count:1,schema:[{name:'ColumnName'},{name:'IV'}],sample:[[cell('string','Segment'),cell('real',1.6)]]}];}
test('materialized classes come from fresh complete native report ports after Execute',()=>{
 const model=coarseClassesMaterializedModel(ports());assert.equal(model.state,'materialized');assert.equal(model.input_field,'Segment');assert.equal(model.classes.length,2);assert.equal(model.total_iv,1.6);
 for(const mutate of [p=>p[0].fresh=false,p=>p[0].sample_complete=false,p=>p[0].row_count=0,p=>p[1].sample[0][0].value='Other',p=>p[0].sample[0][3].precision='display_text',p=>p[0].sample[1][1].value='0']){const p=ports();mutate(p);assert.throws(()=>coarseClassesMaterializedModel(p));}
});
test('apply projects materialized reports while preserving the discarded settings receipt',()=>{
 const node={document_id:'doc',workflow_id:'flow',node_id:'node'},operation_id='op';
 const configuration={verified:true,node_context:node,mode:'apply',state:'settings',classes:[],total_iv:null,input_field:'Segment',target_field:'Target',event_value:'yes',partition:'automatic',min_class_percent:5,max_classes:2,uniformity_percent:0,roles:[]};
 const values={input_mapping:{},configure:{configuration},node_finish:{settings_applied:false,draft_discarded:true},output_mapping:{ports:[0,1,2].map(port=>({port,schema:[{name:'X',type:'string'}]}))},finish:{mode:'execute',settings_applied:false,execution_id:'execute'},read:{ports:ports()}};
 const phases=Object.entries(values).map(([phase,value])=>({phase,status:'verified',receipt_id:operation_id+':'+phase,value:{verified:true,cleanup_complete:true,...value}}));
 const result=coarseClassesConfigurationReadback({node,phases,operation_id});
 assert.equal(result.state,'materialized');assert.deepEqual(result.training,{status:'not_requested'});assert.equal(result.receipt_ids.length,6);assert.equal(configuration.state,'settings');
 values.read.ports[0].sample_complete=false;assert.throws(()=>coarseClassesConfigurationReadback({node,phases:phases.map(p=>p.phase==='read'?{...p,value:{...p.value,ports:values.read.ports}}:p),operation_id}));
});
test('apply reads saved settings without entering the class editor on a NULL-target holdout',async()=>{
 const fields=['Segment','Target'].map((name,index)=>({name,label:name,type:'string',data_kind:'Дискретный',index,record_id:name,role:index?'target':'input'}));
 const root='MF;TF-1;WizrdMCF';let selected=fields[1];const gestures=[];
 const state=()=>({wizard:{stage:'coarse_classes',root_tid:root},node_coarse_classes:{verified:true,fields,selected,settings:{fine_classes:false,event_value:'yes',min_class_percent:5,max_classes:2,uniformity_percent:0}},ui:{elements:fields.map(f=>({tid:root+';CoarseClassesWizard-1;colColumnDisplayName_'+f.name,ref:f.name,allowed_actions:['click']}))}});
 const channel={observe:async o=>{const s=state();assert.ok(o.ready(s));return s;},perform:async o=>{const action=o.resolve(state());gestures.push(action);assert.equal(action.verb,'click');selected=fields.find(f=>f.name===action.ref);assert.ok(selected);}};
 const result=await configureCoarseClasses(channel,{}, {request:{mode:'apply'},preconfiguration:{target_fields:fields}});
 assert.equal(result.settings_applied,false);assert.equal(result.configuration.event_value,'yes');assert.equal(result.configuration.state,'settings');assert.equal(gestures.length,1);
});
