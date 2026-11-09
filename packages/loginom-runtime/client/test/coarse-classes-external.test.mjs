import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {validateCoarseClassesParameters} from '../lib/coarse-classes-parameters.mjs';
import {acceptCoarseClassesExternalPage,configureCoarseClasses,completeExternalLinks} from '../lib/coarse-classes-procedure.mjs';
import {readCoarseClassesBrowser} from '../lib/coarse-classes-context.mjs';
import {coarseClassesParametersSchema} from '../lib/node-api.mjs';
import {NODE_TYPES} from '../lib/node-contracts.mjs';

const external={input_field:'Segment',target_field:'Target',event_value:'yes',partition:'external',min_class_percent:5,max_classes:2,uniformity_percent:0};
const request=(inputs,kind='new')=>({target:{kind},inputs:inputs.map(input=>({input,source:{node_id:'n'+input},output:0})),mappings:[],finish:'execute',read:{ports:[0,1,2]}});

test('external partition is a public discrete mode with the ready class table on additional input 1',()=>{
 assert.ok(coarseClassesParametersSchema.properties.coarse_classes.properties.partition.enum.includes('external'));
 assert.equal(NODE_TYPES['preprocessing.coarse_classes'].additional_tabular_inputs,true);
 assert.doesNotThrow(()=>validateCoarseClassesParameters({coarse_classes:external},'internal',request([0,1])));
 assert.doesNotThrow(()=>validateCoarseClassesParameters({coarse_classes:external},'internal',request([],'existing')));
 for(const r of [request([0]),request([0,1,2]),request([0,0])])assert.throws(()=>validateCoarseClassesParameters({coarse_classes:external},'internal',r));
 for(const patch of [{frozen:true},{cut:7}])assert.throws(()=>validateCoarseClassesParameters({coarse_classes:{...external,...patch}},'internal'));
 assert.throws(()=>validateCoarseClassesParameters({coarse_classes:{...external,partition:'automatic'}},'internal',request([0,1])),/input 1 only with partition external/);
});

test('external links need one identifier, class number and category column',()=>{
 assert.equal(completeExternalLinks([{kind:1},{kind:2},{kind:3}]),true);
 assert.equal(completeExternalLinks([{kind:1},{kind:2},{kind:3},{kind:0}]),true);
 for(const links of [[{kind:1},{kind:2}],[{kind:1},{kind:2},{kind:3},{kind:4}],[{kind:1},{kind:1},{kind:2},{kind:3}],[]])assert.equal(completeExternalLinks(links),false);
});

function externalChannel({stage='coarse_classes_external',auto=true}={}){
 const names=['ColumnName','ClassNumber','UniqueValue'],gestures=[];let links=names.map((name,index)=>({index,name,kind:0}));
 const snapshot=()=>structuredClone({wizard:{stage,root_tid:'w'},prepared_node_context:{verified:true},
  node_coarse_classes:stage==='coarse_classes_external'?{verified:true,external:{links}}:{verified:true,fields:[],settings:{}},
  ui:{elements:[{tid:'w;btnNext',ref:'next',allowed_actions:['wizard_step']},{tid:'w;CoarseClassesWizard;grdExternalBinningLinks;colAutoMappingColumnKind',ref:'auto',allowed_actions:['click']}]}});
 return {gestures,channel:{observe:async o=>{const s=snapshot();assert.ok(o.ready(s),o.condition);return s;},perform:async o=>{
  const a=o.resolve(snapshot());gestures.push(a);
  if(a.ref==='auto'&&auto)links=links.map((l,i)=>({...l,kind:i+1}));
  if(a.verb==='wizard_step')stage=a.expected_stage;
 }}};
}

test('external page auto-links ColumnName/ClassNumber/UniqueValue and advances to field roles',async()=>{
 const {channel,gestures}=externalChannel();
 const result=await acceptCoarseClassesExternalPage(channel,{mode:'internal',parameters:{coarse_classes:external}});
 assert.deepEqual(result.links.map(l=>[l.name,l.kind]),[['ColumnName',1],['ClassNumber',2],['UniqueValue',3]]);
 assert.equal(result.auto_mapped,true);
 assert.deepEqual(gestures.map(a=>a.ref),['auto','next']);
});

test('external page refuses incomplete links and mismatched partitions before Next',async()=>{
 await assert.rejects(acceptCoarseClassesExternalPage(externalChannel({auto:false}).channel,{mode:'internal',parameters:{coarse_classes:external}}),/external class links readback/);
 const {channel,gestures}=externalChannel();
 await assert.rejects(acceptCoarseClassesExternalPage(channel,{mode:'internal',parameters:{coarse_classes:{...external,partition:'automatic'}}}),/use partition external/);
 assert.deepEqual(gestures,[]);
 await assert.rejects(acceptCoarseClassesExternalPage(externalChannel({stage:'coarse_classes'}).channel,{mode:'internal',parameters:{coarse_classes:external}}),/requires the ready class table/);
 assert.equal(await acceptCoarseClassesExternalPage(externalChannel({stage:'coarse_classes'}).channel,{mode:'internal',parameters:{coarse_classes:{...external,partition:'automatic'}}}),null);
});

test('external predictor enables ready classes last and records the locked native model',async()=>{
 const fields=[{name:'Segment',label:'Segment',type:'string',data_kind:'Дискретный',index:0,record_id:'s',role:'input',frozen:false},
  {name:'Target',label:'Target',type:'string',data_kind:'Дискретный',index:1,record_id:'t',role:'target',frozen:false}];
 let stage='coarse_classes',selected=fields[0],fine=false;const gestures=[];
 const root='w',settingsTid=root+';CoarseClassesWizard-1;CoarseClassesSettingsFrame;chkUseFineClassesBinning;ValueControl';
 const model={input_field:'Segment',locked:true,edited:false,classes:[{number:0,lower:null,upper:null},{number:1,lower:null,upper:null}]};
 const snapshot=()=>structuredClone({wizard:{stage,root_tid:root},prepared_node_context:{verified:true},
  node_coarse_classes:{verified:true,fields,selected,model,settings:{event_value:selected.name==='Target'?'yes':null,min_class_percent:5,max_classes:2,uniformity_percent:0,fine_classes:fine}},
  ui:{elements:[{tid:root+';btnNext',ref:'next',allowed_actions:['wizard_step']},{tid:settingsTid+';DisplayEl',ref:'fine',allowed_actions:['set_checked']},
   ...fields.map(f=>({tid:root+';CoarseClassesWizard-1;colColumnDisplayName_'+f.name,ref:f.name,allowed_actions:['click']}))]}});
 const channel={observe:async o=>{const s=snapshot();assert.ok(o.ready(s),o.condition);return s;},perform:async o=>{
  const a=o.resolve(snapshot());gestures.push(a);
  if(a.verb==='wizard_step')stage=a.expected_stage;
  else if(a.ref==='fine'){assert.equal(selected.name,'Segment');assert.equal(a.checked,true);fine=true;}
  else selected=fields.find(f=>f.name===a.ref);
 }};
 const links=[{index:0,name:'ColumnName',kind:1},{index:1,name:'ClassNumber',kind:2},{index:2,name:'UniqueValue',kind:3}];
 const result=await configureCoarseClasses(channel,{coarse_classes:external},{request:{mode:'internal'},inputMapping:{target_fields:fields},external:{links}});
 assert.deepEqual(result.configuration.external_partition,{links,fine_classes:true,model});
 assert.equal(result.configuration.partition,'external');
 assert.equal(gestures.filter(a=>a.ref==='fine').length,1);
 assert.equal(gestures.filter(a=>a.verb==='wizard_step').length,5);
});

test('external links page reader returns owned grid kinds and names',()=>{
 const prefix='MF;TF-1',elements=[],components={};
 const el=(tid,parent)=>{const e={id:'e'+elements.length,tid,parent,getAttribute:()=>tid,getBoundingClientRect:()=>({left:0,top:0,right:100,bottom:100,width:100,height:100}),checkVisibility:()=>true,contains:x=>x===e||x?.parent===e||x?.parent?.parent===e};elements.push(e);return e;};
 const wizard=el(prefix+';WizrdMCF'),page=el(prefix+';WizrdMCF;CoarseClassesWizard',wizard),grid=el(prefix+';WizrdMCF;CoarseClassesWizard;grdExternalBinningLinks',page);
 // Observed native record keys (run 1794207511032523192, events:514).
 const records=[['ColumnName',1],['ClassNumber',2],['UniqueValue',3]].map(([DisplayName,ClassParamsColumnKind],Index)=>({data:{Index,DisplayName,DataType:5,ClassParamsColumnKind,AllowedColumnKinds:[0,1]}}));
 const store={$className:'Ext.data.Store',getData:()=>({items:records}),getCount:()=>records.length,isLoading:()=>false};
 components[wizard.id]={el:{dom:wizard},[Symbol('LockQueue')]:{IsEmpty:true}};components[grid.id]={el:{dom:grid},getStore:()=>store};
 const context={innerWidth:1280,innerHeight:800,Ext:{getCmp:id=>components[id]},document:{querySelectorAll:q=>elements.filter(e=>e.tid===JSON.parse(q.slice(10,-1)))}};
 const read=()=>JSON.parse(JSON.stringify(vm.runInNewContext('('+readCoarseClassesBrowser.toString()+')('+JSON.stringify(prefix)+')',context)));
 assert.deepEqual(read(),{verified:true,external:{links:[{index:0,name:'ColumnName',kind:1},{index:1,name:'ClassNumber',kind:2},{index:2,name:'UniqueValue',kind:3}]},settings_applied:false});
 records[1].data.ClassParamsColumnKind='2';
 assert.deepEqual(read(),{verified:false,reason:'coarse_classes_external_link',record_keys:['Index','DisplayName','DataType','ClassParamsColumnKind','AllowedColumnKinds'],kind_type:'string'});
});

test('coarse classes add_input consumes its single native Input_Add (LAB-1324 events:439)',async()=>{
 const {verifyNodeTargetEffect}=await import('../lib/node-target.mjs');
 const ref={document_id:'d',workflow_id:'w',node_id:'cc'};
 const graph=(inputs,other_ports,type='preprocessing.coarse_classes')=>({complete:true,document_id:'d',workflow_ref:{prefix:'MF;TF-1',workflow_id:'w'},dom_epoch:1,foreign_links:[],links:[],
  nodes:[{ref,type,label:'Конечные классы',dom_epoch:2,position:{x:400,y:208},inputs,outputs:[0,1,2],other_ports,locked:false}]});
 const effect=(before)=>({kind:'add_input',parameters:{ref,input:1},before});
 assert.deepEqual(verifyNodeTargetEffect(effect(graph([0],['Input_Add'])),graph([0,1],[])),{});
 assert.equal(verifyNodeTargetEffect(effect(graph([0],['Input_Add'])),graph([0,1],['Input_Var-1'])),null);
 assert.equal(verifyNodeTargetEffect(effect(graph([0],['Input_Add'],'transform.col_union_data')),graph([0,1],[],'transform.col_union_data')),null);
});

test('a multi-category class on port 1 is one materialized class (expected-external-contrast rows)',async()=>{
 const {coarseClassesMaterializedModel}=await import('../lib/coarse-classes-output.mjs');
 const {readFile}=await import('node:fs/promises');
 const expected=JSON.parse(await readFile(new URL('../../../../docs/node-development/nodes/preprocessing-coarseclasses/acceptance/modes/expected-external-contrast.json',import.meta.url),'utf8'));
 const [p1,p2]=[1,2].map(port=>expected.outputs.find(o=>o.output_port===port));
 const cell=(type,value)=>({type,value:type==='integer'?String(value):value,is_null:false,precision:type==='real'?'17_significant_digits':type==='integer'?'exact_integer':'display_text'});
 const names=['ColumnName','ClassNumber','ClassMark','WoE','IV'],types=['string','integer','string','real','real'];
 const port=(n,o,cols,ts)=>({port:n,fresh:true,sample_complete:true,row_count:o.rows.length,schema:cols.map(name=>({name})),sample:o.rows.map(r=>cols.map((c,i)=>cell(ts[i],r[c])))});
 const ports=[port(1,p1,names,types),port(2,p2,['ColumnName','IV'],['string','real'])];
 const model=coarseClassesMaterializedModel(ports);
 assert.deepEqual(model.classes.map(c=>[c.number,c.woe]),[[0,p1.rows[0].WoE],[1,p1.rows[1].WoE]]);
 assert.equal(model.total_iv,p2.rows[0].IV);
 const split=structuredClone(ports);split[0].sample[2][3].value=0;
 assert.throws(()=>coarseClassesMaterializedModel(split),/class rows differ/);
 const apart=structuredClone(ports);apart[0].sample.push(structuredClone(apart[0].sample[0]));apart[0].row_count=4;
 assert.throws(()=>coarseClassesMaterializedModel(apart),/duplicate model class identity/);
});

test('external internal readback matches the published node result schema',async()=>{
 const {coarseClassesConfigurationReadback}=await import('../lib/coarse-classes-readback.mjs');
 const {nodeApplyResultSchema}=await import('../lib/node-result-schema.mjs');
 const {AjvJsonSchemaValidator}=await import('@modelcontextprotocol/sdk/validation/ajv');
 const node={document_id:'doc',workflow_id:'flow',node_id:'node'},operation_id='op',ref=id=>({document_id:'doc',workflow_id:'flow',node_id:id});
 const cell=(type,value)=>({type,value,is_null:false,precision:type==='real'?'17_significant_digits':type==='integer'?'exact_integer':'display_text'});
 const ports=[{port:1,fresh:true,sample_complete:true,row_count:3,schema:['ColumnName','ClassNumber','ClassMark','WoE','IV'].map(name=>({name})),sample:[['Segment','0','[B]',-1,.3],['Segment','1','[A,C]',.5,.2],['Segment','1','[A,C]',.5,.2]].map(r=>r.map((v,i)=>cell(['string','integer','string','real','real'][i],v)))},{port:2,fresh:true,sample_complete:true,row_count:1,schema:[{name:'ColumnName'},{name:'IV'}],sample:[[cell('string','Segment'),cell('real',.5)]]}];
 const links=[{index:0,name:'ColumnName',kind:1},{index:1,name:'ClassNumber',kind:2},{index:2,name:'UniqueValue',kind:3}];
 const model={input_field:'Segment',locked:true,edited:false,classes:[{number:0,lower:null,upper:null},{number:1,lower:null,upper:null}]};
 const configuration={verified:true,node_context:node,mode:'internal',state:'settings',classes:[],total_iv:null,input_field:'Segment',target_field:'Target',event_value:'yes',partition:'external',frozen:false,min_class_percent:5,max_classes:2,uniformity_percent:0,roles:[{name:'Segment',role:'input'},{name:'Target',role:'target'}],external_partition:{links,fine_classes:true,model}};
 const training={status:'trained',node,execution_id:'train',source:[{node:ref('main'),output:0,input:0},{node:ref('classes'),output:0,input:1}]};
 const values={input_mapping:{},configure:{configuration,validation:{status:'accepted_by_loginom_next'}},node_finish:{settings_applied:true},output_mapping:{ports:[0,1,2].map(port=>({port,schema:[{name:'X',label:'X',type:'string',data_kind:'Дискретный'}]}))},finish:{mode:'execute',settings_applied:true,execution_id:'execute',training},read:{ports}};
 const phases=Object.entries(values).map(([phase,value])=>({phase,status:'verified',receipt_id:operation_id+':'+phase,value:{verified:true,cleanup_complete:true,...value}}));
 const readback=coarseClassesConfigurationReadback({node,phases,operation_id});
 assert.deepEqual(readback.external_partition,{links,fine_classes:true,model});
 const validate=new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema.properties.configuration.properties.readback);
 const r=validate(readback);assert.equal(r.valid,true,JSON.stringify(r.errorMessage??r).slice(0,600));
});
