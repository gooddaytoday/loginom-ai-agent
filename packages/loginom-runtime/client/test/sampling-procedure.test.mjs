import test from 'node:test';
import assert from 'node:assert/strict';
import {configureSampling} from '../lib/sampling-procedure.mjs';
function fixture(partition=false,{clipped=false,scrollFault=null}={}){
 const base='MF;TF-1;WizrdMCF;'+(partition?'PartitionComponentWizard':'SamplingComponentWizard')+';',owner={verified:true,document_id:'d',workflow_id:'w',node_id:'n'};
 const state={stage:partition?'data_partition':'sampling',counts:partition?[0,0]:[0],groups:partition?['train','test','unused']:['sample','unused'],selected:null,draft:null,method:'Последовательный',seed:7,generation:0,units:partition?['rows','rows']:['rows'],groupCounts:partition?[2,3]:[2],testPriority:false,priorityPosition:'algorithm'},actions=[];
 const labels={sample:'Выбранные',unused:'Неиспользуемые',train:'Обучающее множество',test:'Тестовое множество'};
 let top=0;
 const scroll=()=>({ref:'pane',top,max_top:47});
 const seed=()=>({ref:'seed',identity:{anchor_tid:base+'RandSeedEdit;edtRandSeed;ValueControl',path:[1,0,0,0]},allowed_actions:['fill','press'],enabled:true,scroll:scroll(),bounding_box:{x:338,y:760-top,width:136,height:21},interaction:clipped&&top<47?{state:'point_not_observed',point:null,covering:[{anchor_tid:'MF;TF-1;WizrdMCF;rgpBottom'}]}:{state:'point_observed',point:{x:406,y:770.5-top}}});
 const editor=i=>base+'SizeGridForm;colAbsoluteSize;FloatPropEdit'+(i?'-'+i:'')+';PropContainer;ValueContainer;ValueControl';
 const snapshot=()=>({geometry:{viewport:{width:1280,height:800}},prepared_node_context:owner,wizard:{stage:state.stage,root_tid:'W'},node_sampling:{verified:true,inventory_complete:true,node_context:owner,base,kind:partition?'data_partition':'sampling',method:state.method,seed:state.seed,test_priority:state.testPriority,test_priority_position:state.priorityPosition,groups_base:base+'RandomUniformMethodForm;SizeGridForm',group_units:state.groupCounts.map((n,i)=>({unit:'rows',absolute_size:n,absolute_control_tid:base+'RandomUniformMethodForm;SizeGridForm;colAbsoluteSize;editor'+i})),sequence_materialized:state.method==='Последовательный',
  strata:{base:base+'StratifiedMethodForm',rows:['RowID','X','Noise','Target','Note'].map(name=>({record_id:name,values:{Name:name,UsageFlag:name==='RowID'}}))},
  sizes:state.counts.map((_,index)=>({record_id:'size'+index,values:{SizePath:'Sampling.'+index}})),units:state.counts.map((count,index)=>({record_id:'size'+index,icon_ref:'unit'+index,absolute_size:count,absolute_control_tid:editor(index),unit:state.units[index],text:'',title:'',tooltip:'',class_name:''})),
  sequence:(state.method==='Последовательный'?state.groups:[]).map(group=>({record_id:group+':'+state.generation,text:labels[group],values:{Name:labels[group]},tids:[base+'group_'+group],selected:state.selected===group}))},
  ui:{elements:[...state.groupCounts.map((_,i)=>({ref:'g-edit'+i,tid:base+'RandomUniformMethodForm;SizeGridForm;colAbsoluteSize;editor'+i,allowed_actions:['fill','press']})),{ref:'priority',tid:base+'cntTestPriority;cnt;chb;InputEl',allowed_actions:['click']},{ref:'priority-picker',tid:base+'pedTestPriorityPosition;ValueControl;trg_picker',allowed_actions:['click']},...['beginning','end'].map((v,i)=>({ref:v,tid:base+'pedTestPriorityPosition;ValueControl;boundlist;'+['В_начале_набора','В_конце_набора'][i],allowed_actions:['click']})),{ref:'method',tid:base+'pedSamplingMethod;ValueControl;trg_picker',allowed_actions:['click']},{ref:'sequential',tid:base+'pedSamplingMethod;ValueControl;boundlist;Последовательный',role:'option',label:'Последовательный',allowed_actions:['click']},...['Случайный','Стратифицированный','Отбор со смещением','Равномерный случайный'].map((label,i)=>({ref:'mode'+i,tid:base+'pedSamplingMethod;ValueControl;boundlist;'+label,role:'option',label,allowed_actions:['click']})),seed(),
   {ref:'foreign',tid:'OTHER;StratifiedMethodForm;txtStratifiedFilter',enabled:true,interaction:{state:'point_observed'},scroll:scroll(),allowed_actions:['scroll']},
   {ref:'anchor',identity:{anchor_tid:base+'StratifiedMethodForm;txtStratifiedFilter',path:[1,0,0,0]},enabled:true,interaction:{state:'point_observed',point:{x:653,y:507.5}},scroll:scrollFault==='foreign'?{ref:'other',top:0,max_top:47}:scroll(),allowed_actions:scrollFault==='missing'?[]:['scroll']},...state.counts.flatMap((_,index)=>[
   // Partition's summary repeats colSizeType_1, so the actual second-row
   // image is anchored at the unique table, not the duplicated cell tid.
   {ref:'unit'+index,identity:index?{anchor_tid:base+'SizeGridForm;grdDataSet;tbl',path:[0,1,0,0,1,0,0]}:{anchor_tid:base+'SizeGridForm;colSizeType_'+index,path:[0,0]},signature:{tag:'img'},role:'button',allowed_actions:['click']},
   {ref:'edit'+index,tid:editor(index),allowed_actions:['fill','press']}]),
   ...state.groups.map(group=>({ref:group,tid:base+'group_'+group,allowed_actions:['click']})),
   {ref:'up',tid:base+'SequenceMethodForm;btnGroupPositionUp',allowed_actions:['click']},
   {ref:'next',tid:'W;btnNext',allowed_actions:['wizard_step']} ]}});
 const channel={observe:async({ready})=>{const s=snapshot();assert.ok(ready(s));return s;},perform:async spec=>{
  const s=snapshot();assert.ok(spec.ready(s));const a=spec.resolve(s);actions.push(a);
  if(a.verb==='scroll'){assert.equal(a.ref,'anchor');if(scrollFault!=='stuck')top=Math.min(47,top+a.delta_y);}
  if(['fill','press'].includes(a.verb)&&a.ref==='seed')assert.equal(seed().interaction.state,'point_observed','seed is obscured by rgpBottom');
  if(a.verb==='fill'&&a.ref==='seed')state.draftSeed=Number(a.text);
  if(a.verb==='press'&&a.ref==='seed')state.seed=state.draftSeed;
  if(a.verb==='fill'&&a.ref.startsWith('g-edit'))state.groupDraft={i:Number(a.ref.slice(6)),n:Number(a.text)};
  if(a.verb==='press'&&a.ref.startsWith('g-edit'))state.groupCounts[state.groupDraft.i]=state.groupDraft.n;
  if(a.verb==='click'&&a.ref==='priority')state.testPriority=!state.testPriority;
  if(a.verb==='click'&&['beginning','end'].includes(a.ref))state.priorityPosition=a.ref;
  if(a.verb==='fill'&&a.ref!=='seed'&&!a.ref.startsWith('g-edit')){assert.equal(state.units[Number(a.ref.slice(4))],'rows');state.draft={index:Number(a.ref.slice(4)),count:Number(a.text)};}
  if(a.verb==='press'&&a.ref!=='seed'&&!a.ref.startsWith('g-edit')){assert.equal(a.key,'Tab');state.counts[state.draft.index]=state.draft.count;}
  if(a.verb==='click'&&state.groups.includes(a.ref))state.selected=a.ref;
  if(a.verb==='click'&&a.ref.startsWith('mode'))state.method=['Случайный','Стратифицированный','Отбор со смещением','Равномерный случайный'][Number(a.ref.slice(4))];
  if(a.verb==='click'&&a.ref==='sequential')state.method='Последовательный';
  if(a.verb==='click'&&a.ref.startsWith('unit'))state.units[Number(a.ref.slice(4))]='rows';
  if(a.verb==='click'&&a.ref==='up'){const at=state.groups.indexOf(state.selected);[state.groups[at-1],state.groups[at]]=[state.groups[at],state.groups[at-1]];state.generation++;}
  if(a.verb==='wizard_step')state.stage='done';
 }};
 const run=(p,finish='execute',mode='sequential')=>configureSampling(channel,p,{request:{target:{kind:'new'},finish,mode},inputMapping:{verified:true,inventory_complete:true,target_fields:[{name:'RowID',label:'RowID',type:'integer',data_kind:'Дискретный'}]}});
 return {state,actions,run};
}
test('production procedure binds embedded row editors and moves the observed unused group for last sampling',async()=>{
 const f=fixture();const r=await f.run({count:5,position:'last'});
 assert.deepEqual(r.configuration.counts,[5]);assert.deepEqual(r.configuration.groups,['unused','sample']);
 assert.equal(f.actions.filter(a=>a.verb==='fill').length,1);
 assert.equal(f.actions.filter(a=>a.verb==='wizard_step').length,1);
 assert.equal(r.validation.status,'accepted_by_loginom_next');
});

test('stratified partition reveals seed below the footer at 1280x800 before filling',async()=>{
 const f=fixture(true,{clipped:true});f.state.method='Стратифицированный';
 const result=await f.run({train_count:48,test_count:16,seed:42},'execute','stratified');
 assert.equal(result.configuration.seed,42);assert.deepEqual(result.configuration.counts,[48,16]);
 assert.equal(result.configuration.method,'Стратифицированный');
 assert.deepEqual(f.actions.filter(a=>a.verb==='scroll'),[{verb:'scroll',ref:'anchor',delta_y:47}]);
 assert.ok(f.actions.findIndex(a=>a.verb==='scroll')<f.actions.findIndex(a=>a.verb==='fill'&&a.ref==='seed'));
});

for(const scrollFault of ['missing','foreign','stuck'])test('clipped seed refuses '+scrollFault+' scroll without filling or switching method',async()=>{
 const f=fixture(true,{clipped:true,scrollFault});f.state.method='Стратифицированный';
 await assert.rejects(f.run({seed:42},'execute','stratified'));
 assert.equal(f.actions.some(a=>a.verb==='fill'),false);assert.equal(f.state.method,'Стратифицированный');
});
test('partition edits train and test separately, verifies test-first allocation and retains source schema',async()=>{
 const f=fixture(true);f.state.units=['percent','percent'];
 const r=await f.run({train_count:10,test_count:5,allocation_order:'test_train_unused'});
 assert.deepEqual(r.configuration.counts,[10,5]);assert.deepEqual(r.configuration.groups,['test','train','unused']);
 assert.deepEqual(f.actions.filter(a=>a.verb==='fill').map(a=>a.ref),['edit0','edit1']);
 assert.deepEqual(f.actions.filter(a=>a.ref.startsWith('unit')).map(a=>a.ref),['unit0','unit1']);
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

test('random S/P switch method, commit seed and retain omitted parameters without sequential moves',async()=>{
 for(const partition of [false,true]){
  const f=fixture(partition);f.state.units=partition?['percent','percent']:['percent'];
  const r=await f.run(partition?{train_count:8,test_count:4,seed:42}:{count:8,seed:42},'execute','random');
  assert.equal(r.configuration.mode,'random');assert.equal(r.configuration.seed,42);
  assert.deepEqual(r.configuration.counts,partition?[8,4]:[8]);assert.deepEqual(r.configuration.groups,[]);
  assert.equal(f.actions.some(a=>a.ref==='up'),false);
  assert.equal(f.actions.filter(a=>a.ref==='seed'&&a.verb==='press').length,1);
  f.state.stage=partition?'data_partition':'sampling';const retained=await f.run({},'execute','random');assert.equal(retained.configuration.seed,42);
 }
});

test('uniform configures group editors, seed and test priority on the same node',async()=>{
 for(const partition of [false,true]){
  const f=fixture(partition),p=partition?{train_count:6,test_count:4,train_group_size_rows:1,test_group_size_rows:1,test_priority:true,test_priority_position:'beginning'}:{count:6,group_size_rows:1};
  const r=await f.run({...p,seed:42},'execute','uniform');
  assert.deepEqual(r.configuration.counts,partition?[6,4]:[6]);assert.deepEqual(r.configuration.group_units.map(u=>u.absolute_size),partition?[1,1]:[1]);
  assert.equal(r.configuration.seed,42);assert.equal(r.configuration.mode,'uniform');
  f.state.stage=partition?'data_partition':'sampling';
  const again=await f.run(partition?{test_priority_position:'end'}:{},'execute','uniform');
  assert.deepEqual(again.configuration.group_units.map(u=>u.absolute_size),partition?[1,1]:[1]);
  if(partition){assert.equal(again.configuration.test_priority,true);assert.equal(again.configuration.test_priority_position,'end');}
 }
});
