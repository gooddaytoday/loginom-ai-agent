// The node adapter supplies an owned editor, row identity and exact picker
// predicate. Every gesture stays in the original procedure channel/receipt.
export async function configureVariableBinding({channel,observe,state,base,identity,option,committed,ready}){
 const one=(s,p,verb)=>{const es=s.ui.elements.filter(e=>p(e)&&e.allowed_actions.includes(verb));if(es.length!==1)throw Error('Owned variable binding control unavailable');return es[0];};
 const perform=(condition,s,resolve)=>channel.perform({condition,initialObservation:s,ready:x=>ready(x)&&x.wizard?.root_ref===s.wizard.root_ref,identity,resolve});
 const click=async(condition,s,p)=>perform(condition,s,x=>({verb:'click',ref:one(x,p,'click').ref}));
 const trigger=e=>e.tid===base+';VariableControl;trg_picker';
 let s=state;
 if(!s.ui.elements.some(trigger)){
  await click('select variable parameter mode',s,e=>e.tid===base+';SwitchButton');
  s=await observe('variable parameter mode ready',s=>s.ui.elements.some(trigger));
 }
 await click('open mapped variable choices',s,trigger);
 s=await observe('exact mapped variable choice',s=>s.ui.elements.some(option));
 await click('select exact mapped variable',s,option);
 s=await observe('mapped variable selected');
 const input=e=>e.signature.tag==='input'&&e.identity.anchor_tid===base+';VariableControl';
 await perform('commit parameter binding',s,x=>({verb:'press',ref:one(x,input,'press').ref,key:'Tab'}));
 return observe('parameter binding committed',committed);
}
export async function configureBooleanBinding(channel,{type,bindings,bindingSource,bindingMapping}){
 const grouping=type==='transform.group_data',key=grouping?'node_grouping':'node_sorting',stage=grouping?'grouping':'sorting',field=grouping?'pedSortResult':'chkLocaleAware';
 const ready=s=>s.wizard?.stage===stage&&s[key]?.verified===true;
 const observe=(condition,predicate=()=>true)=>channel.observe({condition,...(grouping?{readGrouping:true}:{readSorting:true}),ready:s=>ready(s)&&predicate(s)});
 let s=await observe('boolean binding baseline');
 if(!bindings?.length)return s[key];
 const b=bindings[0],fields=bindingMapping?.fields?.filter(f=>f.name===b.variable.name);
 if(fields?.length!==1)throw Error('BINDING_VARIABLE_MISSING');
 const f=fields[0];if(f.type!==1||f.source?.type!==1)throw Error('BINDING_TYPE_MISMATCH');
 if(bindingSource){
  const vs=bindingSource.variables.filter(v=>v.id===f.source.id&&v.name===f.source.name);
  if(vs.length!==1)throw Error('BINDING_VARIABLE_MISSING');
  if(vs[0].type!=='boolean'||vs[0].cell?.type!=='boolean')throw Error('BINDING_TYPE_MISMATCH');
  if(vs[0].cell.is_null!==false)throw Error('BINDING_NULL_UNSUPPORTED');
 }else if(f.is_null!==false)throw Error('BINDING_NULL_UNSUPPORTED');
 const base=s.wizard.root_tid+';'+(grouping?'GroupDataWizard;':'SortingWizard;SortingColumnCollection;')+field;
 s=await configureVariableBinding({channel,observe,ready,state:s,base,identity:x=>({node:x.prepared_node_context,parameter:b.parameter,variable_id:f.id}),
  option:e=>e.boolean_binding?.name===f.name&&e.boolean_binding.index===f.index&&e.boolean_binding.type==='boolean',
  committed:s=>{const o=s[key].options[field];return o.switch_pressed&&o.binding?.name===f.name&&o.binding.index===f.index;}});
 return s[key];
}
