import test from 'node:test';
import assert from 'node:assert/strict';
import {configureSampling} from '../lib/sampling-procedure.mjs';
function fixture(partition=false){
 const base='MF;TF-1;WizrdMCF;'+(partition?'PartitionComponentWizard':'SamplingComponentWizard')+';',owner={verified:true,document_id:'d',workflow_id:'w',node_id:'n'};
 const state={stage:partition?'data_partition':'sampling',counts:partition?[0,0]:[0],groups:partition?['train','test','unused']:['sample','unused'],selected:null,draft:null,method:'Последовательный',generation:0,units:partition?['rows','rows']:['rows']},actions=[];
 const labels={sample:'Выбранные',unused:'Неиспользуемые',train:'Обучающее множество',test:'Тестовое множество'};
 const editor=i=>base+'SizeGridForm;colAbsoluteSize;FloatPropEdit'+(i?'-'+i:'')+';PropContainer;ValueContainer;ValueControl';
 const snapshot=()=>({prepared_node_context:owner,wizard:{stage:state.stage,root_tid:'W'},node_sampling:{verified:true,inventory_complete:true,node_context:owner,base,kind:partition?'data_partition':'sampling',method:state.method,sequence_materialized:state.method==='Последовательный',
  sizes:state.counts.map((_,index)=>({record_id:'size'+index,values:{SizePath:'Sampling.'+index}})),units:state.counts.map((count,index)=>({record_id:'size'+index,absolute_size:count,absolute_control_tid:editor(index),unit:state.units[index],text:'',title:'',tooltip:'',class_name:''})),
  sequence:(state.method==='Последовательный'?state.groups:[]).map(group=>({record_id:group+':'+state.generation,text:labels[group],values:{Name:labels[group]},tids:[base+'group_'+group],selected:state.selected===group}))},
  ui:{elements:[{ref:'method',tid:base+'pedSamplingMethod;ValueControl;trg_picker',allowed_actions:['click']},{ref:'sequential',tid:base+'pedSamplingMethod;ValueControl;boundlist;Последовательный',role:'option',label:'Последовательный',allowed_actions:['click']},...state.counts.flatMap((_,index)=>[
   {ref:'unit'+index,identity:{anchor_tid:base+'SizeGridForm;colSizeType_'+index},signature:{tag:'img'},role:'button',allowed_actions:['click']},
   {ref:'edit'+index,tid:editor(index),allowed_actions:['fill','press']}]),
   ...state.groups.map(group=>({ref:group,tid:base+'group_'+group,allowed_actions:['click']})),
   {ref:'up',tid:base+'SequenceMethodForm;btnGroupPositionUp',allowed_actions:['click']},
   {ref:'next',tid:'W;btnNext',allowed_actions:['wizard_step']} ]}});
 const channel={observe:async({ready})=>{const s=snapshot();assert.ok(ready(s));return s;},perform:async spec=>{
  const s=snapshot();assert.ok(spec.ready(s));const a=spec.resolve(s);actions.push(a);
  if(a.verb==='fill'){assert.equal(state.units[Number(a.ref.slice(4))],'rows');state.draft={index:Number(a.ref.slice(4)),count:Number(a.text)};}
  if(a.verb==='press'){assert.equal(a.key,'Tab');state.counts[state.draft.index]=state.draft.count;}
  if(a.verb==='click'&&state.groups.includes(a.ref))state.selected=a.ref;
  if(a.verb==='click'&&a.ref==='sequential')state.method='Последовательный';
  if(a.verb==='click'&&a.ref.startsWith('unit'))state.units[Number(a.ref.slice(4))]='rows';
  if(a.verb==='click'&&a.ref==='up'){const at=state.groups.indexOf(state.selected);[state.groups[at-1],state.groups[at]]=[state.groups[at],state.groups[at-1]];state.generation++;}
  if(a.verb==='wizard_step')state.stage='done';
 }};
 const run=(p,finish='execute')=>configureSampling(channel,p,{request:{target:{kind:'new'},finish},inputMapping:{verified:true,inventory_complete:true,target_fields:[{name:'RowID',label:'RowID',type:'integer',data_kind:'Дискретный'}]}});
 return {state,actions,run};
}
test('production procedure binds embedded row editors and moves the observed unused group for last sampling',async()=>{
 const f=fixture();const r=await f.run({count:5,position:'last'});
 assert.deepEqual(r.configuration.counts,[5]);assert.deepEqual(r.configuration.groups,['unused','sample']);
 assert.equal(f.actions.filter(a=>a.verb==='fill').length,1);
 assert.equal(f.actions.filter(a=>a.verb==='wizard_step').length,1);
 assert.equal(r.validation.status,'accepted_by_loginom_next');
});
test('partition edits train and test separately, verifies test-first allocation and retains source schema',async()=>{
 const f=fixture(true),r=await f.run({train_count:10,test_count:5,allocation_order:'test_train_unused'});
 assert.deepEqual(r.configuration.counts,[10,5]);assert.deepEqual(r.configuration.groups,['test','train','unused']);
 assert.deepEqual(f.actions.filter(a=>a.verb==='fill').map(a=>a.ref),['edit0','edit1']);
 assert.equal(r.configuration.input_fields[0].type,'integer');
});
test('an omitted size remains unchanged and Close performs no edits or validation',async()=>{
 const f=fixture(true);f.state.counts=[10,5];
 const r=await f.run({test_count:2});assert.deepEqual(r.configuration.counts,[10,2]);
 assert.deepEqual(r.configuration.groups,['train','test','unused']);
 const closed=fixture(),discarded=await closed.run({count:7,position:'last'},'close');
 assert.deepEqual(closed.actions,[]);assert.equal(discarded.draft_edits_skipped,true);
});

test('actual initial random method can create the sequence form, switch percent to rows and use the observed editor path',async()=>{
 const f=fixture();f.state.method='Случайный';f.state.units=['percent'];f.state.counts=[10];
 const r=await f.run({count:5,position:'last'});assert.deepEqual(r.configuration.counts,[5]);assert.deepEqual(r.configuration.groups,['unused','sample']);
 assert.equal(f.actions.filter(a=>a.ref==='unit0').length,1);assert.equal(f.state.method,'Последовательный');
});
