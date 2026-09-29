import {resolveCrossTableParameters} from './crosstable-parameters.mjs';

const need=(condition,message)=>{if(!condition)throw Error(message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const control=(state,suffix,verb='click')=>{
 const matches=state.ui.elements.filter(element=>element.tid===state.wizard.root_tid+suffix&&element.allowed_actions.includes(verb));
 need(matches.length===1,'Unique CrossTable control required: '+suffix);return matches[0];
};

export async function configureCrossTable(channel,parameters,{inputMapping}){
 const ready=state=>state.wizard?.stage==='cross_table'&&state.node_cross_table?.verified===true;
 const observe=condition=>channel.observe({condition,readCrossTable:true,ready});
 const before=await observe('complete CrossTable input inventory');
 need(before.node_cross_table.options.pedSlidingUniqueValuesLimit===0
  &&before.node_cross_table.options.pedUniqueValueNames===false
  &&before.node_cross_table.options.pedDisplayNameSeparator==='|',
  'CrossTable requires the observed unbounded width and label policy');
 const source=inputMapping?.target_fields;
 need(inputMapping?.verified===true&&inputMapping.inventory_complete===true&&Array.isArray(source),
  'Complete CrossTable input mapping required');
 const fields=before.node_cross_table.input_fields.filter(field=>!field.is_count_case).map(field=>{
  const matches=source.filter(item=>item.index===field.source_index);
  need(matches.length===1&&matches[0].label===field.label&&matches[0].type===field.type,
   'CrossTable native input field differs from mapped source');
  return {...field,name:matches[0].name,data_kind:matches[0].data_kind};
 });
 need(fields.length===source.length,'CrossTable source field coverage differs');
 const plan=resolveCrossTableParameters(parameters,fields),byName=name=>{
  const field=fields.find(item=>item.name===name);need(field,'CrossTable source field missing: '+name);return field;
 };
 const wanted=new Map([[plan.column.name,1],...plan.rows.map(field=>[field.name,2]),...plan.facts.map(fact=>[fact.field.name,3])]);
 const select=async(field,role)=>{
  const selectedRecords=state=>role==='available'?state.node_cross_table.selected_available_records:state.node_cross_table.selected_records;
  for(let attempt=0;attempt<128;attempt++){
   const state=await observe('CrossTable field selection');
   const current=state.node_cross_table.input_fields.find(item=>item.record_id===field.record_id);
   need(current&&current.disposition===({available:0,column:1,row:2,fact:3}[role]),'CrossTable field role changed');
   const element=state.ui.elements.find(item=>item.grouping_field?.record_id===field.record_id
    &&item.grouping_field.role===role&&item.allowed_actions.includes('click'));
   if(element){
    if(same(selectedRecords(state),[field.record_id]))return state;
    await channel.perform({condition:'select exact CrossTable '+role+' field',initialObservation:state,ready,
     identity:()=>({record_id:field.record_id,role}),resolve:()=>({verb:'click',ref:element.ref})});
    const selected=await observe('CrossTable field selected');
    need(same(selectedRecords(selected),[field.record_id]),'CrossTable selection differs');
    return selected;
   }
   const scroll=state.ui.elements.find(item=>item.grouping_field?.role===role&&item.scroll?.ref===item.ref
    &&item.allowed_actions.includes('scroll'));
   need(scroll&&attempt<127,'CrossTable field cannot be revealed');
   await channel.perform({condition:'reveal CrossTable field',initialObservation:state,ready,
    identity:()=>({record_id:field.record_id,role,scroll:scroll.ref}),resolve:()=>({verb:'scroll',ref:scroll.ref,delta_y:400})});
  }
 };
 for(const field of fields.filter(item=>item.disposition!==0&&wanted.get(item.name)!==item.disposition)){
  const role={1:'column',2:'row',3:'fact'}[field.disposition],selected=await select(field,role);
  await channel.perform({condition:'remove old CrossTable role',initialObservation:selected,ready,
   identity:()=>({record_id:field.record_id,role}),resolve:state=>{
    const element=state.ui.elements.find(item=>item.grouping_field?.record_id===field.record_id
     &&item.grouping_field.role===role&&item.allowed_actions.includes('press'));
    need(element,'Old CrossTable field is not selected');return {verb:'press',ref:element.ref,key:'Delete'};
   }});
  need((await observe('old CrossTable role removed')).node_cross_table.input_fields.find(item=>item.record_id===field.record_id)?.disposition===0,
   'Old CrossTable role remains');
 }
 for(const [items,disposition,role] of [[ [plan.column],1,'column'],[plan.rows,2,'row'],[plan.facts.map(fact=>fact.field),3,'fact']]){
  for(const [index,item] of items.entries()){
   const field=byName(item.name);
   let state=await observe('requested CrossTable role');
   if(state.node_cross_table.input_fields.find(entry=>entry.record_id===field.record_id)?.disposition!==disposition){
    state=await select(field,'available');
    await channel.perform({condition:'assign CrossTable '+role+' role',initialObservation:state,ready,
     identity:()=>({record_id:field.record_id,role}),resolve:state=>({verb:'click',ref:control(state,';CrossTabWizard;frmMoveButtons;btnMove'+(disposition-1)).ref})});
    state=await observe('CrossTable role assigned');
    need(state.node_cross_table.input_fields.find(entry=>entry.record_id===field.record_id)?.disposition===disposition,
     'CrossTable role assignment differs');
   }
   state=await select(field,role);
   let current=state.node_cross_table.input_fields.find(entry=>entry.record_id===field.record_id);
   while(current.order>index){
    const old=current.order;
    await channel.perform({condition:'order CrossTable '+role+' field',initialObservation:state,ready,
     identity:()=>({record_id:field.record_id,order:old}),resolve:state=>({verb:'click',ref:control(state,';CrossTabWizard;btnUp').ref})});
    state=await observe('CrossTable field moved up');
    current=state.node_cross_table.input_fields.find(entry=>entry.record_id===field.record_id);
    need(current?.order===old-1,'CrossTable field order did not move');
   }
   need(current.order===index,'CrossTable field order differs');
  }
 }
 for(const fact of plan.facts){
  const field=byName(fact.field.name),selected=await select(field,'fact');
  if(selected.node_cross_table.facts.find(item=>item.record_id===field.record_id)?.functions===fact.mask)continue;
  await channel.perform({condition:'open exact CrossTable fact editor',initialObservation:selected,ready,
   identity:()=>({record_id:field.record_id}),resolve:state=>{
    const element=state.ui.elements.find(item=>item.grouping_field?.record_id===field.record_id
     &&item.grouping_field.role==='fact'&&item.allowed_actions.includes('double_click'));
    need(element,'CrossTable fact editor unavailable');return {verb:'double_click',ref:element.ref};
   }});
  const editorReady=state=>ready(state)&&state.wizard.factor_editor?.status==='rendered_factor_options'
   &&state.wizard.factor_editor.selected_field?.field_key===field.label
   &&same(state.node_cross_table.selected_records,[field.record_id]);
  const functions=['sum','count','min','max','average','standard_deviation','sum_squares','unique_count','null_count','first','last'];
  for(const functionName of functions){
   const state=await channel.observe({condition:'CrossTable fact function options',readCrossTable:true,ready:editorReady});
   const option=state.wizard.factor_editor.options.find(item=>item.aggregation===functionName);
   need(option,'CrossTable fact function is missing');
   const wanted=fact.functions.includes(functionName==='average'?'avg':functionName);
   if(option.checked===wanted)continue;
   need(option.enabled,'CrossTable fact function disabled');
   await channel.perform({condition:'set CrossTable fact '+functionName,initialObservation:state,ready:editorReady,
    identity:()=>({record_id:field.record_id,functionName,wanted}),
    resolve:()=>({verb:'set_checked',ref:option.display_ref,checked:wanted})});
  }
  const done=await channel.observe({condition:'complete CrossTable fact function set',readCrossTable:true,ready:editorReady});
  need(done.wizard.factor_editor.options.every(option=>option.checked===fact.functions.includes(option.aggregation==='average'?'avg':option.aggregation)),
   'CrossTable fact functions differ before Apply');
  await channel.perform({condition:'apply CrossTable fact functions',initialObservation:done,ready:editorReady,
   identity:()=>({record_id:field.record_id,mask:fact.mask}),resolve:state=>({verb:'click',ref:control(state,';FactorEditDialog;btnApply').ref})});
  need((await observe('CrossTable fact functions applied')).node_cross_table.facts.find(item=>item.record_id===field.record_id)?.functions===fact.mask,
   'CrossTable fact functions differ after Apply');
 }
 const columnField=byName(plan.column.name),sliding=parameters.columns.mode==='sliding';
 const modeState=await observe('CrossTable global column mode');
 if(modeState.node_cross_table.options.pedSlidingUniqueValues!==sliding){
  await channel.perform({condition:'set CrossTable global column mode',initialObservation:modeState,ready,
   identity:()=>({record_id:columnField.record_id,sliding}),resolve:state=>({verb:'set_checked',
    ref:control(state,';CrossTabWizard;pedSlidingUniqueValues;ValueControl;DisplayEl','set_checked').ref,checked:sliding})});
 }
 need((await observe('CrossTable global mode applied')).node_cross_table.options.pedSlidingUniqueValues===sliding,
  'CrossTable global column mode differs');
 if(!sliding){
  const selected=await select(columnField,'column');
  await channel.perform({condition:'open CrossTable column editor',initialObservation:selected,ready,
   identity:()=>({record_id:columnField.record_id}),resolve:state=>{
    const element=state.ui.elements.find(item=>item.grouping_field?.record_id===columnField.record_id
     &&item.grouping_field.role==='column'&&item.allowed_actions.includes('double_click'));
    need(element,'CrossTable column editor unavailable');return {verb:'double_click',ref:element.ref};
   }});
  const editorReady=state=>ready(state)&&state.wizard.column_editor?.status==='rendered_column_options'
   &&state.wizard.column_editor.selected_field?.record_id===columnField.record_id;
  for(const [key,wanted] of [['cbNullGroup',parameters.columns.include_null],['cbOtherGroup',parameters.columns.include_other]]){
  const state=await channel.observe({condition:'CrossTable fixed category policy',readCrossTable:true,ready:editorReady});
  const element=control(state,';ColumnEditDialog;'+key+';DisplayEl');
  if(element.check_state?.checked===wanted)continue;
  await channel.perform({condition:'set CrossTable '+key,initialObservation:state,ready:editorReady,
   identity:()=>({record_id:columnField.record_id,key,wanted}),resolve:()=>({verb:'set_checked',ref:element.ref,checked:wanted})});
  }
  const applied=await channel.observe({condition:'CrossTable column policy before Apply',readCrossTable:true,ready:editorReady});
  await channel.perform({condition:'apply CrossTable column policy',initialObservation:applied,ready:editorReady,
   identity:()=>({record_id:columnField.record_id,mode:parameters.columns.mode}),
   resolve:state=>({verb:'click',ref:control(state,';ColumnEditDialog;btnApply').ref})});
 }
 const after=await observe('complete CrossTable configuration');
 need(same(after.node_cross_table.columns.map(item=>item.source_index),[columnField.source_index])
  &&same(after.node_cross_table.rows.map(item=>item.source_index),plan.rows.map(item=>byName(item.name).source_index))
  &&same(after.node_cross_table.facts.map(item=>({index:item.source_index,mask:item.functions})),
   plan.facts.map(fact=>({index:byName(fact.field.name).source_index,mask:fact.mask}))),
  'CrossTable roles or functions differ after configuration');
 need(after.node_cross_table.options.pedSlidingUniqueValues===(parameters.columns.mode==='sliding')
  &&after.node_cross_table.options.pedSlidingUniqueValuesLimit===0
  &&after.node_cross_table.options.pedUniqueValueNames===false,
  'CrossTable column mode or width policy differs');
 if(parameters.columns.mode==='fixed')need(after.node_cross_table.columns[0].null_group===parameters.columns.include_null
  &&after.node_cross_table.columns[0].other_group===parameters.columns.include_other,'CrossTable fixed groups differ');
 return {verified:true,cleanup_complete:true,effect_possible:true,
  configuration:{...after.node_cross_table,input_fields:fields,requested_categories:parameters.columns.mode==='fixed'?parameters.columns.categories:null}};
}
