import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const need=(v,m)=>{if(!v)throw Error('CrossTable stage three transcript: '+m);};
const same=(a,b)=>['document_id','workflow_id','node_id'].every(k=>typeof a?.[k]==='string'&&a[k]===b?.[k]);
const parse=v=>{if(typeof v!=='string')return v;try{return JSON.parse(v);}catch{return null;}};
const complete=r=>r?.status==='SUCCEEDED'&&r.cleanup_complete===true&&r.execution?.status==='completed'
 &&r.output?.ports?.length===1&&r.output.ports[0].fresh===true&&r.output.ports[0].execution_id===r.execution.execution_id
 &&r.output.ports[0].sample_complete===true&&r.output.ports[0].sample_rows===r.output.ports[0].row_count
 &&r.output.ports[0].precision?.numbers_verified===true;

// The final cold oracle proves saved values independently. This audit proves
// the intermediate business actions that a final table alone cannot show.
export function auditCrossTableStage3(events){
 const calls=[],settled=new Map(),seen=new Map();
 for(const [index,event] of events.entries()){
  if(event.type!=='tool_use')continue;const p=event.part;
  if(!p?.state||!['completed','error'].includes(p.state.status))continue;
  const prior=seen.get(p.id);if(prior){need(JSON.stringify(prior)===JSON.stringify(p),'changed tool event');continue;}seen.set(p.id,p);
  const result=parse(p.state.output);calls.push({index,tool:p.tool,input:p.state.input,result,error:p.state.error});
  if(result?.state==='settled'&&result.operation_id){
   const old=settled.get(result.operation_id);need(!old||JSON.stringify(old)===JSON.stringify(result),'conflicting settled result');settled.set(result.operation_id,result);
  }
 }
 const applies=calls.filter(c=>c.tool==='loginom_dock_node_apply');
 const reply=c=>settled.get(c.input?.operation_id)??c.result;
 const created=(label,type='transform.cross_table')=>{
  const xs=applies.filter(c=>c.input?.target?.kind==='new'&&c.input.target.type===type&&c.input.target.label===label&&complete(reply(c)));
  need(xs.length===1,'one complete creation required: '+label);return {...xs[0],node:reply(xs[0]).node};
 };
 const history=c=>applies.filter(a=>a===c||a.index===c.index||a.input?.target?.kind==='existing'&&same(a.input.target.ref,c.node))
  .filter(a=>complete(reply(a))&&same(reply(a).node,c.node));
 const readback=c=>reply(c)?.configuration?.readback;
 const schema=c=>reply(c).output.ports[0].schema;
 const names=c=>schema(c).map(f=>f.name);
 const columns=(c,expected)=>need(JSON.stringify(names(c))===JSON.stringify(expected),'ordered intermediate schema: '+c.input.operation_id);
 const parameters=c=>c.input.parameters?.settings??c.input.parameters??{};
 const evidence=[];
 const controlled=created('Управляемая схема'),changes=history(controlled),initial=readback(controlled);
 const values=[['limit','Limit',4,1,0],['unique_names','Names',1,false,true],['separator','Separator',5,'|','.']];
 need(values.every(([key,name,type,value])=>{
  const v=initial?.options?.variable_bindings?.[key];return v?.name===name&&v.type===type&&v.value===value&&Number.isSafeInteger(v.id)&&v.selected_proxy_equal===true;
 }),'three initial native variable bindings');
 columns(controlled,['Region','C_1_Amount_Sum','C_1_Amount_Count']);
 const changed=changes.find(c=>c.index>controlled.index&&values.every(([key,name,type,,value])=>{
  const v=readback(c)?.options?.variable_bindings?.[key],old=initial.options.variable_bindings[key];
  return v?.name===name&&v.type===type&&v.id===old.id&&v.value===value&&v.selected_proxy_equal===true;
 }));
 need(changed,'same three variable identities changed and remained bound');
 columns(changed,['Region','A_Amount_Sum','A_Amount_Count','B_Amount_Sum','B_Amount_Count']);
 need(values.every(([,name,, ,value])=>parameters(changed).local_variables?.some(v=>v.name===name&&v.value===value)), 'all three defaults changed through the public request');
 evidence.push({criterion:'three_bound_variables',node:controlled.node,operations:[controlled.input.operation_id,changed.input.operation_id]});

 const boundary=created('Граница исключения'),boundaryHistory=history(boundary);
 const own=boundaryHistory.find(c=>readback(c)?.output_mapping?.source_fields?.length===5&&readback(c).output_mapping.source_fields.every(f=>f.required===true));
 need(own,'complete native Required=true own output');
 const negative=applies.find(c=>same(c.input?.target?.ref,boundary.node)&&c.input.mappings?.some(m=>(m.fields??m.changes??[]).some(f=>f.source?.name==='C_2_Amount_Count'&&f.excluded===true)));
 const refusal=negative&&reply(negative),admission=refusal?.phase==='request_rejected'&&refusal.request_rejected===true
  &&refusal.error?.code==='REQUEST_REJECTED'&&refusal.error.message==='CrossTable: CrossTable own output fields are required; exclude fields in a separate downstream node';
 need(negative&&refusal?.status!=='SUCCEEDED'&&refusal?.effect_possible===false&&(refusal?.cleanup_complete===true||admission),
  'required own exclusion refused before mutation');
 const downstream=created('Представление без количества B','transform.reform_columns');
 need(downstream.input.inputs?.length===1&&same(downstream.input.inputs[0].source,boundary.node),'downstream uses the same boundary report');
 columns(downstream,['Region','C_1_Amount_Sum','C_1_Amount_Count','C_2_Amount_Sum']);
 evidence.push({criterion:'required_refusal_and_downstream',node:boundary.node,downstream:downstream.node,operations:[own.input.operation_id,negative.input.operation_id,downstream.input.operation_id]});

 const edited=created('Редактирование выхода'),mapped=history(edited).find(c=>readback(c)?.output_mapping?.autosync===false&&names(c).includes('RevenueA'));
 need(mapped,'own output edited with autosync disabled');columns(mapped,['C_2_Amount_Sum','RevenueA','C_1_Amount_Count','Region','C_2_Amount_Count']);
 const mapping=readback(mapped).output_mapping;
 need(mapping.source_fields.length===5&&mapping.source_fields.every(f=>f.required===true)&&mapping.target_fields.length===5
  &&mapping.target_fields.find(f=>f.name==='RevenueA')?.source?.name==='C_1_Amount_Sum'
  &&schema(mapped).find(f=>f.name==='RevenueA')?.label==='Доход A','own edited output lineage and label');
 evidence.push({criterion:'own_output_edit',node:edited.node,operation:mapped.input.operation_id});

 const auto=created('Автосинхронизация выхода'),autoHistory=history(auto);
 const off=autoHistory.find(c=>readback(c)?.output_mapping?.autosync===false),on=autoHistory.find(c=>off&&c.index>off.index&&readback(c)?.output_mapping?.autosync===true);
 need(off&&on,'own autosync off then on on the same report');
 columns(off,['Region','C_1']);columns(on,['Region','C_1']);
 const expanded=autoHistory.find(c=>on&&c.index>on.index&&readback(c)?.options?.limit===0&&schema(c).length===3);
 need(expanded,'categories expanded after autosync enabled');columns(expanded,['Region','C_1','C_2']);
 evidence.push({criterion:'autosync_off_on_expand',node:auto.node,operations:[off.input.operation_id,on.input.operation_id,expanded.input.operation_id]});

 const transitions=created('Переходы режимов'),transitionHistory=history(transitions);
 need(readback(transitions)?.category_mode==='fixed','initial fixed report');
 const sliding=transitionHistory.find(c=>c.index>transitions.index&&readback(c)?.category_mode==='sliding');
 const fixed=transitionHistory.find(c=>sliding&&c.index>sliding.index&&readback(c)?.category_mode==='fixed');need(sliding&&fixed,'same report fixed/sliding/fixed');
 const source=transitions.input.inputs?.[0]?.source;
 const reordered=applies.find(c=>fixed&&c.index>fixed.index&&c.input.target?.type==='imports.text'&&same(c.input.target.ref,source)&&complete(reply(c))
  &&JSON.stringify(reply(c).output.ports[0].schema.map(f=>f.name))===JSON.stringify(['When','Flag','Text','Units','Amount','Channel','Category','Month','Region']));
 const reapplied=transitionHistory.find(c=>reordered&&c.index>reordered.index&&parameters(c).row_keys?.[0]?.name==='Region'
  &&parameters(c).column?.name==='Category'&&parameters(c).facts?.[0]?.field?.name==='Amount');
 need(reordered&&reapplied,'same roles reapplied after own input reorder');columns(reapplied,['Region','C_1','C_2']);
 evidence.push({criterion:'mode_transitions_and_input_reorder',node:transitions.node,operations:[transitions.input.operation_id,sliding.input.operation_id,fixed.input.operation_id,reordered.input.operation_id,reapplied.input.operation_id]});
 return {status:'PASS',phase:'cross_table_stage_three_transcript_audit',criteria:evidence};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [input,output]=process.argv.slice(2);need(input&&output,'events and result paths required');
 const events=(await readFile(input,'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
 const result=auditCrossTableStage3(events);await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
