import test from 'node:test';
import assert from 'node:assert/strict';
import {auditCrossTableStage3} from '../crosstable-stage3-audit.mjs';
const node=id=>({document_id:'doc',workflow_id:'wf',node_id:id});
const standard=['Region','C_1_Amount_Sum','C_1_Amount_Count','C_2_Amount_Sum','C_2_Amount_Count'];
function fixture(){
 const events=[];
 const tool=(id,input,readback,names,result)=>{
  result??={operation_id:id,state:'settled',status:'SUCCEEDED',cleanup_complete:true,effect_possible:true,
   node:input.target.ref??node(id),configuration:{readback},execution:{status:'completed',execution_id:id},
   output:{ports:[{port:0,fresh:true,execution_id:id,sample_complete:true,sample_rows:2,row_count:2,precision:{numbers_verified:true},schema:names.map(name=>({name,label:name,type:'real'}))}]}};
  events.push({type:'tool_use',part:{id,tool:'loginom_dock_node_apply',state:{status:'completed',input:{operation_id:id,...input},output:JSON.stringify(result)}}});
 };
 const create=(id,label,readback,names,type='transform.cross_table',source=node('typed'))=>tool(id,{target:{kind:'new',type,label},inputs:[{source,input:0,output:0}]},readback,names);
 const edit=(id,owner,readback,names,extra={})=>tool(id,{target:{kind:'existing',type:'transform.cross_table',ref:node(owner)},...extra},readback,names);
 const bindings=changed=>Object.fromEntries([['limit','Limit',4,changed?0:1],['unique_names','Names',1,changed],['separator','Separator',5,changed?'.':'|']]
  .map(([key,name,type,value],id)=>[key,{name,type,value,id,selected_proxy_equal:true}]));
 create('variables','Управляемая схема',{options:{variable_bindings:bindings(false)}},standard.slice(0,3));
 edit('changed','variables',{options:{variable_bindings:bindings(true)}},['Region','A_Amount_Sum','A_Amount_Count','B_Amount_Sum','B_Amount_Count'],
  {parameters:{local_variables:[{name:'Limit',value:0},{name:'Names',value:true},{name:'Separator',value:'.'}]}});
 create('reserve','Резерв категорий',{options:{separator:'|'}},standard);
 for(const [id,separator] of [['arrow','->'],['space',' '],['pipe','|']])edit(id,'reserve',{options:{separator}},standard);
 create('boundary','Граница исключения',{},standard);
 const sources=standard.map((name,record_id)=>({name,record_id,required:true}));
 edit('boundary-map','boundary',{output_mapping:{source_fields:sources}},standard);
 tool('negative',{target:{kind:'existing',type:'transform.cross_table',ref:node('boundary')},mappings:[{direction:'output',port:0,changes:[{source:{name:'C_2_Amount_Count'},excluded:true}]}]},null,[],
  {status:'FAILED',phase:'request_rejected',request_rejected:true,effect_possible:false,error:{code:'REQUEST_REJECTED',message:'CrossTable: CrossTable own output fields are required; exclude fields in a separate downstream node'}});
 create('downstream','Представление без количества B',{},standard.slice(0,4),'transform.reform_columns',node('boundary'));
 create('edited','Редактирование выхода',{},standard);
 const order=['C_2_Amount_Sum','RevenueA','C_1_Amount_Count','Region','C_2_Amount_Count'];
 edit('output-edit','edited',{output_mapping:{autosync:false,source_fields:sources,target_fields:order.map(name=>({name,source:{name:name==='RevenueA'?'C_1_Amount_Sum':name}}))}},order);
 const changedResult=JSON.parse(events.at(-1).part.state.output);changedResult.output.ports[0].schema[1].label='Доход A';events.at(-1).part.state.output=JSON.stringify(changedResult);
 create('auto','Автосинхронизация выхода',{options:{limit:1}},['Region','C_1']);
 edit('off','auto',{output_mapping:{autosync:false}},['Region','C_1']);
 edit('on','auto',{output_mapping:{autosync:true}},['Region','C_1']);
 edit('expanded','auto',{options:{limit:0}},['Region','C_1','C_2']);
 create('transition','Переходы режимов',{category_mode:'fixed'},['Region','C_1','C_2'],undefined,node('separate-input'));
 edit('sliding','transition',{category_mode:'sliding'},['Region','C_1','C_2']);
 edit('fixed','transition',{category_mode:'fixed'},['Region','C_1','C_2']);
 tool('reorder',{target:{kind:'existing',type:'imports.text',ref:node('separate-input')}},{},['When','Flag','Text','Units','Amount','Channel','Category','Month','Region']);
 const reordered=JSON.parse(events.at(-1).part.state.output),types={When:'datetime',Flag:'boolean',Text:'string',Units:'integer',Amount:'real',Channel:'string',Category:'string',Month:'string',Region:'string'};
 reordered.output.ports[0].schema=reordered.output.ports[0].schema.map((f,index)=>({...f,index,type:types[f.name],data_kind:f.name==='Amount'?'Непрерывный':'Дискретный'}));
 events.at(-1).part.state.output=JSON.stringify(reordered);
 edit('reapply','transition',{category_mode:'fixed'},['Region','C_1','C_2'],{parameters:{row_keys:[{name:'Region'}],column:{name:'Category'},facts:[{field:{name:'Amount'}}]}});
 return events;
}
test('stage three requires intermediate actions alongside the separate cold oracle',()=>{
 const result=auditCrossTableStage3(fixture());assert.equal(result.status,'PASS');assert.equal(result.criteria.length,6);
});
test('reapplied roles accept the canonical single columns entry and the legacy column alias',()=>{
 const xs=fixture(),p=xs.find(e=>e.part.id==='reapply').part.state.input.parameters;
 p.columns=[p.column];delete p.column;
 assert.equal(auditCrossTableStage3(xs).status,'PASS');
});
test('reapplied category roles reject extra dimensions, wrong fields and conflicting aliases',()=>{
 for(const columns of [[],null,[{name:'Month'}],[{name:'Category'},{name:'Month'}]]){
  const xs=fixture(),p=xs.find(e=>e.part.id==='reapply').part.state.input.parameters;
  p.columns=columns;delete p.column;
  assert.throws(()=>auditCrossTableStage3(xs),/same roles reapplied/);
 }
 const xs=fixture(),p=xs.find(e=>e.part.id==='reapply').part.state.input.parameters;
 p.columns=[p.column];assert.throws(()=>auditCrossTableStage3(xs),/same roles reapplied/);
});
test('a structured zero-effect request refusal in the tool error channel is still verified',()=>{
 const xs=fixture(),state=xs.find(e=>e.part.id==='negative').part.state;
 state.status='error';state.error=state.output;delete state.output;
 assert.equal(auditCrossTableStage3(xs).status,'PASS');
 state.error='transport lost';assert.throws(()=>auditCrossTableStage3(xs),/required own exclusion/);
});
test('static substitutions, changed variable IDs, foreign downstream and incomplete intermediate reads refuse',()=>{
 for(const damage of [r=>delete r.configuration.readback.options.variable_bindings,
  r=>r.configuration.readback.options.variable_bindings.limit.id=99,
  r=>r.output.ports[0].precision.numbers_verified=false,
  r=>r.output.ports[0].sample_complete=false]){
  const xs=fixture(),p=xs.find(e=>e.part.id==='changed').part.state,r=JSON.parse(p.output);damage(r);p.output=JSON.stringify(r);
  assert.throws(()=>auditCrossTableStage3(xs));
 }
 const xs=fixture();xs.find(e=>e.part.id==='downstream').part.state.input.inputs[0].source=node('foreign');assert.throws(()=>auditCrossTableStage3(xs),/same boundary/);
});
test('unknown exclusion effects and fake autosync or input reorder evidence refuse',()=>{
 for(const [id,damage] of [['negative',r=>r.effect_possible=true],['negative',r=>r.error.message='Other validation failure'],
  ['space',r=>r.configuration.readback.options.separator='_'],
  ['on',r=>r.configuration.readback.output_mapping.autosync=false],['reorder',r=>r.output.ports[0].schema.reverse()],
  ['output-edit',r=>r.configuration.readback.output_mapping.target_fields[1].source.name='C_2_Amount_Sum']]){
  const xs=fixture(),p=xs.find(e=>e.part.id===id).part.state,r=JSON.parse(p.output);damage(r);p.output=JSON.stringify(r);assert.throws(()=>auditCrossTableStage3(xs));
 }
});

test('reordered source may request zero sampled rows with full fresh owned schema; CrossTable reads stay complete',()=>{
 const xs=fixture(),p=xs.find(e=>e.part.id==='reorder').part.state,r=JSON.parse(p.output);
 r.output.ports[0].sample_rows=0;r.output.ports[0].sample_complete=false;r.output.ports[0].sample=[];p.output=JSON.stringify(r);
 assert.equal(auditCrossTableStage3(xs).criteria.length,6);
 const cross=xs.find(e=>e.part.id==='reapply').part.state,result=JSON.parse(cross.output);
 result.output.ports[0].sample_complete=false;result.output.ports[0].sample_rows=0;cross.output=JSON.stringify(result);
 assert.throws(()=>auditCrossTableStage3(xs),/same roles reapplied/);
});
test('schema-only source still rejects foreign, stale, incomplete, relabelled or retyped evidence',()=>{
 for(const damage of [r=>r.node.node_id='foreign',r=>r.execution.status='running',r=>delete r.execution.execution_id,
  r=>r.output.ports[0].fresh=false,r=>r.output.ports[0].execution_id='stale',r=>r.output.ports[0].port=1,
  r=>r.output.ports[0].schema.pop(),r=>r.output.ports[0].schema[0].index=8,r=>r.output.ports[0].schema[0].label='renamed',
  r=>r.output.ports[0].schema[0].type='real',r=>r.output.ports[0].schema[0].data_kind='Непрерывный',
  r=>r.output.ports[0].precision.numbers_verified=false,r=>r.output.ports[0].row_count=-1]){
  const xs=fixture(),p=xs.find(e=>e.part.id==='reorder').part.state,r=JSON.parse(p.output);
  r.output.ports[0].sample_rows=0;r.output.ports[0].sample_complete=false;damage(r);p.output=JSON.stringify(r);
  assert.throws(()=>auditCrossTableStage3(xs),/same roles reapplied/);
 }
});
