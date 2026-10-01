import {resolveDataPartitionParameters} from './datapartition-parameters.mjs';
const need=(value,message)=>{if(!value)throw Error(message);};

export async function configureDataPartition(channel,parameters,{mode,newNode=false}={}){
 const ready=s=>s.wizard?.stage==='data_partition'&&s.node_data_partition?.verified===true;
 const before=await channel.observe({condition:'complete initial DataPartition settings',readDataPartition:true,ready});
 const desired=resolveDataPartitionParameters(parameters,mode,before.node_data_partition,{newNode});
 await selectDataPartitionMode(channel,mode);
 for(const role of ['training','test'])await setDataPartitionSize(channel,role,desired[role]);
 await setDataPartitionPriority(channel,desired.priority,desired.test_position);
 await setDataPartitionField(channel,'seed',desired.seed.policy==='fixed'?desired.seed.value:'');
 if(mode==='uniform')for(const role of ['training','test'])await setDataPartitionSize(channel,role,desired.uniform[role],{group:true});
 if(mode==='sequential')await setDataPartitionSequence(channel,desired.sequential.order);
 if(mode==='stratified')await setDataPartitionStrata(channel,desired.stratified.fields,desired.stratified.complete_unique_values);
 if(mode==='biased')await setDataPartitionBias(channel,desired.biased);
 const after=await channel.observe({condition:'complete final DataPartition settings',readDataPartition:true,ready});
 const actual=after.node_data_partition.parameters;
 need(after.node_data_partition.mode===mode&&['training','test','seed'].every(key=>JSON.stringify(actual[key])===JSON.stringify(desired[key]))
  &&actual.priority===desired.priority&&(actual.priority==='training'||actual.test_position===desired.test_position),'Final DataPartition common settings differ');
 if(mode==='uniform'||mode==='sequential')need(JSON.stringify(actual[mode])===JSON.stringify(desired[mode]),'Final DataPartition method settings differ');
 if(mode==='stratified')need(actual.stratified.complete_unique_values===desired.stratified.complete_unique_values
  &&actual.stratified.fields.length===desired.stratified.fields.length&&desired.stratified.fields.every(name=>actual.stratified.fields.includes(name)),'Final DataPartition strata differ');
 return {verified:true,cleanup_complete:true,effect_possible:true,configuration:after.node_data_partition,
  requested_parameters:desired,preservation:{inactive_test_position:actual.priority!=='training'||actual.test_position===before.node_data_partition.parameters.test_position},settings_applied:false};
}

export async function selectDataPartitionOption(channel,name,label){
 const ready=s=>s.wizard?.stage==='data_partition'&&s.node_data_partition?.verified===true;
 const before=await channel.observe({condition:'DataPartition choice '+name+' owned',readDataPartition:true,ready});
 if(before.wizard.data_partition.fields[name]?.value===label)return before;
 await channel.perform({condition:'open DataPartition choice '+name,initialObservation:before,ready,identity:s=>s.prepared_node_context,
  resolve:s=>{
   const es=s.ui.elements.filter(e=>e.wizard_combo?.kind==='picker'&&e.wizard_combo.field.scope==='data_partition'&&e.wizard_combo.field.name===name&&e.allowed_actions.includes('click'));
   need(es.length===1,'Unique DataPartition picker required');return {verb:'click',ref:es[0].ref};
  }});
 const choices=await channel.observe({condition:'DataPartition owned options '+name,readDataPartition:true,ready:s=>ready(s)&&s.ui.elements.some(e=>e.wizard_combo?.kind==='option'&&e.wizard_combo.field.name===name)});
 await channel.perform({condition:'select DataPartition choice '+label,initialObservation:choices,ready,identity:s=>s.prepared_node_context,
  resolve:s=>{
   const es=s.ui.elements.filter(e=>e.wizard_combo?.kind==='option'&&e.wizard_combo.field.scope==='data_partition'&&e.wizard_combo.field.name===name&&e.wizard_combo.label===label&&e.allowed_actions.includes('select_wizard_option'));
   need(es.length===1,'Unique DataPartition option required');return {verb:'select_wizard_option',ref:es[0].ref};
  }});
 const after=await channel.observe({condition:'DataPartition selected choice readback',readDataPartition:true,ready});
 need(after.wizard.data_partition.fields[name]?.value===label,'DataPartition option readback differs');
 return after;
}

export async function selectDataPartitionMode(channel,mode){
 const labels={random:'Случайный',uniform:'Равномерный случайный',stratified:'Стратифицированный',sequential:'Последовательный',biased:'Отбор со смещением'};
 need(Object.hasOwn(labels,mode),'Unknown DataPartition mode');
 const result=await selectDataPartitionOption(channel,'pedSamplingMethod',labels[mode]);
 need(result.node_data_partition.mode===mode,'DataPartition native method differs');
 return result;
}

export async function setDataPartitionField(channel,name,value){
 const ready=s=>s.wizard?.stage==='data_partition'&&s.node_data_partition?.verified===true;
 const before=await channel.observe({condition:'DataPartition field '+name+' owned',readDataPartition:true,ready});
 const fields=before.ui.elements.filter(e=>e.wizard_field?.scope==='data_partition'&&e.wizard_field.name===name&&e.allowed_actions.includes('set_wizard_field'));
 need(fields.length===1,'Unique active DataPartition editor required: '+name);
 if(fields[0].value===String(value))return before;
 await channel.perform({condition:'set DataPartition field '+name,initialObservation:before,ready,identity:s=>s.prepared_node_context,
  resolve:s=>{
   const es=s.ui.elements.filter(e=>e.wizard_field?.scope==='data_partition'&&e.wizard_field.name===name&&e.allowed_actions.includes('set_wizard_field'));
   need(es.length===1,'DataPartition editor changed');return {verb:'set_wizard_field',ref:es[0].ref,text:String(value)};
  }});
 const after=await channel.observe({condition:'DataPartition field '+name+' readback',readDataPartition:true,ready});
 need(after.wizard.data_partition.fields[name]?.value===String(value),'DataPartition field readback differs');
 return after;
}

export async function setDataPartitionSize(channel,role,size,{group=false}={}){
 const ready=s=>s.wizard?.stage==='data_partition'&&s.node_data_partition?.verified===true;
 const before=await channel.observe({condition:'DataPartition '+role+' size owned',readDataPartition:true,ready});
 const rows=s=>group?s.node_data_partition.group_rows:s.node_data_partition.size_rows;
 const observed=rows(before)?.find(r=>r.role===role);
 need(observed,'DataPartition size row missing');
 if(observed.unit!==size.unit){
  await channel.perform({condition:'switch DataPartition '+role+' size unit',initialObservation:before,ready,
   identity:()=>({record_id:observed.record_id,size_path:observed.size_path}),resolve:s=>{
    const es=s.ui.elements.filter(e=>e.data_partition_cell?.kind===(group?'group':'size')&&e.data_partition_cell.part==='unit'
     &&e.data_partition_cell.record_id===observed.record_id&&e.data_partition_cell.size_path===observed.size_path&&e.allowed_actions.includes('click'));
    need(es.length===1,'Unique DataPartition unit cell required');return {verb:'click',ref:es[0].ref};
   }});
  const after=await channel.observe({condition:'DataPartition size unit readback',readDataPartition:true,ready});
  need(rows(after).find(r=>r.role===role)?.unit===size.unit,'DataPartition unit did not change once');
 }
 const form=group?'RandomUniformMethodForm;SizeGridForm':'SizeGridForm';
 const result=await setDataPartitionField(channel,form+':'+role+':'+size.unit,size.value);
 need(rows(result).find(r=>r.role===role)?.value===size.value,'DataPartition native size readback differs');
 return result;
}

export async function setDataPartitionSequence(channel,order){
 need(Array.isArray(order)&&order.length===3&&['training','test','unused'].every(role=>order.includes(role)),'Invalid DataPartition sequence');
 const ready=s=>s.wizard?.stage==='data_partition'&&s.node_data_partition?.verified===true&&s.node_data_partition.mode==='sequential';
 for(const [position,role] of order.entries()){
  const before=await channel.observe({condition:'owned DataPartition sequence row',readDataPartition:true,ready});
  const row=before.node_data_partition.method_rows.find(r=>r.role===role);
  need(row,'DataPartition sequence role disappeared');
  const current=before.node_data_partition.parameters.sequential.order.indexOf(role);
  if(current===position)continue;
  need(current>position,'Unexpected DataPartition sequence order');
  await channel.perform({condition:'select DataPartition sequence '+role,initialObservation:before,ready,identity:()=>({record_id:row.record_id,role}),
   resolve:s=>{
    const es=s.ui.elements.filter(e=>e.data_partition_cell?.kind==='sequence'&&e.data_partition_cell.record_id===row.record_id&&e.allowed_actions.includes('click'));
    need(es.length===1,'Unique DataPartition sequence cell required');return {verb:'click',ref:es[0].ref};
   }});
  for(const offset of Array.from({length:current-position},(_,index)=>index)){
   const selected=await channel.observe({condition:'DataPartition selected sequence row',readDataPartition:true,ready});
   need(selected.node_data_partition.selected_records.length===1&&selected.node_data_partition.selected_records[0]===row.record_id,'DataPartition selected sequence owner differs');
   await channel.perform({condition:'move owned DataPartition sequence up once',initialObservation:selected,ready:s=>ready(s)&&s.node_data_partition.selected_records.length===1&&s.node_data_partition.selected_records[0]===row.record_id,identity:()=>({record_id:row.record_id,from:current-offset}),
    resolve:s=>{
     const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';PartitionComponentWizard;SequenceMethodForm;btnGroupPositionUp'&&e.allowed_actions.includes('click'));
     need(es.length===1,'DataPartition sequence Up unavailable');return {verb:'click',ref:es[0].ref};
    }});
   const after=await channel.observe({condition:'DataPartition moved sequence readback',readDataPartition:true,ready});
   need(after.node_data_partition.parameters.sequential.order.indexOf(role)===current-offset-1,'DataPartition sequence did not move once');
  }
 }
 const final=await channel.observe({condition:'complete DataPartition sequence',readDataPartition:true,ready});
 need(JSON.stringify(final.node_data_partition.parameters.sequential.order)===JSON.stringify(order),'DataPartition sequence readback differs');
 return final;
}

export async function setDataPartitionPriority(channel,priority,position){
 need(['training','test'].includes(priority)&&['algorithm','start','end'].includes(position),'Invalid DataPartition priority');
 const ready=s=>s.wizard?.stage==='data_partition'&&s.node_data_partition?.verified===true;
 const before=await channel.observe({condition:'DataPartition priority owned',readDataPartition:true,ready});
 if(before.node_data_partition.parameters.priority!==priority){
  await channel.perform({condition:'set owned DataPartition test priority',initialObservation:before,ready,identity:s=>s.prepared_node_context,
   resolve:s=>{
    const es=s.ui.elements.filter(e=>['InputEl','DisplayEl'].some(part=>e.tid===s.wizard.root_tid+';PartitionComponentWizard;cntTestPriority;cnt;chb;'+part)&&e.interaction?.state==='point_observed'&&e.allowed_actions.includes('set_checked'));
    need(es.length===1,'Unique DataPartition priority checkbox required');return {verb:'set_checked',ref:es[0].ref,checked:priority==='test'};
   }});
 }
 const after=priority==='test'?await selectDataPartitionOption(channel,'pedTestPriorityPosition',
  {algorithm:'Определяется алгоритмом',start:'В начале набора',end:'В конце набора'}[position])
  :await channel.observe({condition:'DataPartition training priority readback',readDataPartition:true,ready});
 need(after.node_data_partition.parameters.priority===priority,'DataPartition priority readback differs');
 need(priority!=='test'||after.node_data_partition.parameters.test_position===position,'DataPartition position readback differs');
 need(priority!=='training'||after.node_data_partition.parameters.test_position===before.node_data_partition.parameters.test_position,'Inactive DataPartition position changed');
 return after;
}

export async function setDataPartitionStrata(channel,fields,completeUniqueValues){
 need(Array.isArray(fields)&&fields.length>0&&new Set(fields).size===fields.length&&typeof completeUniqueValues==='boolean','Invalid DataPartition strata');
 const ready=s=>s.wizard?.stage==='data_partition'&&s.node_data_partition?.verified===true&&s.node_data_partition.mode==='stratified';
 const before=await channel.observe({condition:'complete DataPartition stratum inventory',readDataPartition:true,ready});
 need(fields.every(name=>before.node_data_partition.input_fields.filter(f=>f.name===name).length===1),'DataPartition stratum field missing');
 for(const field of before.node_data_partition.input_fields){
  if(field.used===fields.includes(field.name))continue;
  const current=await channel.observe({condition:'DataPartition stratum field owned',readDataPartition:true,ready});
  await channel.perform({condition:'toggle exact DataPartition stratum '+field.name,initialObservation:current,ready,
   identity:()=>({record_id:field.record_id,name:field.name}),resolve:s=>{
    const es=s.ui.elements.filter(e=>e.data_partition_cell?.kind==='stratum'&&e.data_partition_cell.part==='used'
     &&e.data_partition_cell.record_id===field.record_id&&e.data_partition_cell.field_key===field.name&&e.allowed_actions.includes('click'));
    need(es.length===1,'DataPartition stratum checkbox not uniquely rendered');return {verb:'click',ref:es[0].ref};
   }});
  const after=await channel.observe({condition:'DataPartition stratum selection readback',readDataPartition:true,ready});
  need(after.node_data_partition.input_fields.find(f=>f.record_id===field.record_id)?.used===fields.includes(field.name),'DataPartition stratum selection differs');
 }
 const current=await channel.observe({condition:'DataPartition complete unique values owned',readDataPartition:true,ready});
 if(current.node_data_partition.parameters.stratified.complete_unique_values!==completeUniqueValues){
  await channel.perform({condition:'set DataPartition complete unique values',initialObservation:current,ready,identity:s=>s.prepared_node_context,
   resolve:s=>{
    const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';PartitionComponentWizard;StratifiedMethodForm;pedCompleteUniqueValues;ValueControl;DisplayEl'&&e.allowed_actions.includes('set_checked'));
    need(es.length===1,'DataPartition complete unique checkbox unavailable');return {verb:'set_checked',ref:es[0].ref,checked:completeUniqueValues};
   }});
 }
 const after=await channel.observe({condition:'complete DataPartition strata readback',readDataPartition:true,ready});
 need(after.node_data_partition.parameters.stratified.fields.length===fields.length&&fields.every(name=>after.node_data_partition.parameters.stratified.fields.includes(name))
  &&after.node_data_partition.parameters.stratified.complete_unique_values===completeUniqueValues,'DataPartition strata readback differs');
 return after;
}

export async function setDataPartitionBias(channel,bias){
 const ready=s=>s.wizard?.stage==='data_partition'&&s.node_data_partition?.verified===true&&s.node_data_partition.mode==='biased';
 const before=await channel.observe({condition:'owned DataPartition bias source',readDataPartition:true,ready});
 const field=before.node_data_partition.input_fields.find(f=>f.name===bias.field);
 need(field,'DataPartition bias field missing');
 if(before.node_data_partition.parameters.biased?.field!==bias.field){
  await channel.perform({condition:'select exact DataPartition bias field',initialObservation:before,ready,
   identity:()=>({record_id:field.record_id,name:field.name}),resolve:s=>{
    const es=s.ui.elements.filter(e=>e.data_partition_cell?.kind==='bias_field'&&e.data_partition_cell.record_id===field.record_id&&e.data_partition_cell.field_key===bias.field&&e.allowed_actions.includes('click'));
    need(es.length===1,'Unique available DataPartition bias field required');return {verb:'click',ref:es[0].ref};
   }});
 }
 const selected=await channel.observe({condition:'DataPartition bias field selected',readDataPartition:true,ready});
 // Loginom disables the load button once the selected field's cached inventory is ready.
 const inventory=selected.node_data_partition.parameters.biased?.field===bias.field
  &&selected.node_data_partition.parameters.biased.adjustments.length>0?selected:await (async()=>{
  await channel.perform({condition:'load DataPartition unique values',initialObservation:selected,ready,
   identity:()=>({record_id:field.record_id,name:field.name}),resolve:s=>{
    const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';PartitionComponentWizard;BiasedMethodForm;btnGetUniqueValues'&&e.allowed_actions.includes('click'));
    need(es.length===1,'DataPartition unique value button unavailable');return {verb:'click',ref:es[0].ref};
   }});
  return channel.observe({condition:'complete DataPartition unique value inventory',readDataPartition:true,
   ready:s=>ready(s)&&s.node_data_partition.parameters.biased?.field===bias.field&&s.node_data_partition.parameters.biased.adjustments.length>0});
 })();
 const identity=value=>JSON.stringify([value.type,value.is_null,value.value]);
 for(const adjustment of bias.adjustments){
  need(adjustment.value.type===field.type,'DataPartition bias key type differs from source');
  const matches=inventory.node_data_partition.parameters.biased.adjustments.map((r,index)=>({r,index})).filter(({r})=>identity(r.value)===identity(adjustment.value));
  need(matches.length===1,'DataPartition bias value absent or ambiguous');
  const row=inventory.node_data_partition.method_rows[matches[0].index],property=Object.hasOwn(adjustment,'factor')?'factor':'count',value=adjustment[property];
  if(row[property]===value)continue;
  const current=await channel.observe({condition:'owned DataPartition bias value editor',readDataPartition:true,ready});
  await channel.perform({condition:'open exact DataPartition bias '+property,initialObservation:current,ready,
   identity:()=>({record_id:row.record_id,property}),resolve:s=>{
    const es=s.ui.elements.filter(e=>e.data_partition_cell?.kind==='bias_value'&&e.data_partition_cell.record_id===row.record_id&&e.data_partition_cell.part===property&&e.allowed_actions.includes('double_click'));
    need(es.length===1,'Unique DataPartition bias value cell required');return {verb:'double_click',ref:es[0].ref};
   }});
  const editorReady=s=>ready(s)&&s.node_data_partition.bias_editor?.record_id===row.record_id&&s.node_data_partition.bias_editor.property===property;
  const editing=await channel.observe({condition:'DataPartition exact bias editor open',readDataPartition:true,ready:editorReady});
  const resolve=(s,verb)=>{
   const es=s.ui.elements.filter(e=>e.wizard_field?.scope==='data_partition'&&e.wizard_field.record_id===row.record_id&&e.wizard_field.property===(property==='factor'?'Factor':'Count')&&e.allowed_actions.includes(verb));
   need(es.length===1,'DataPartition bias editor binding changed');return es[0];
  };
  await channel.perform({condition:'fill owned DataPartition bias editor',initialObservation:editing,ready:editorReady,
   identity:()=>({record_id:row.record_id,property}),resolve:s=>({verb:'fill',ref:resolve(s,'fill').ref,text:String(value)})});
  const filled=await channel.observe({condition:'DataPartition bias draft typed',readDataPartition:true,ready:editorReady});
  need(resolve(filled,'press').value===String(value),'DataPartition bias editor value differs');
  await channel.perform({condition:'commit owned DataPartition bias cell',initialObservation:filled,ready:editorReady,
   identity:()=>({record_id:row.record_id,property,value}),resolve:s=>({verb:'press',ref:resolve(s,'press').ref,key:'Enter'})});
  const after=await channel.observe({condition:'DataPartition bias native value readback',readDataPartition:true,ready:s=>ready(s)&&s.node_data_partition.bias_editor===null});
  need(after.node_data_partition.method_rows.find(r=>r.record_id===row.record_id)?.[property]===value,'DataPartition bias adjustment readback differs');
 }
 return channel.observe({condition:'complete DataPartition bias readback',readDataPartition:true,ready});
}
