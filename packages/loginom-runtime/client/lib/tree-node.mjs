import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {makeNodeOutputContextCode} from './node-output-context.mjs';
import {jsonToTreeParametersSchema,treeToTableParametersSchema,validateTreeParameters,validateTreeJsonScope,validateSelectedTreePaths} from './tree-parameters.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'
 ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const owned=(state)=>state.prepared_node_context?.verified===true&&state.prepared_node_context.surface==='wizard';
const ready=s=>owned(s)&&s.node_tree?.verified===true;
const one=(state,predicate,message)=>{const matches=state.ui.elements.filter(predicate);need(matches.length===1,message);return matches[0];};

export function treeConfigurationReadback({node,phases,operation_id}){
 const phase=name=>{const matches=phases.filter(p=>p.phase===name),p=matches[0];
  need(matches.length===1&&p.status==='verified'&&p.receipt_id===operation_id+':'+name&&p.value?.verified&&p.value.cleanup_complete,'Verified tree '+name+' receipt required');return p;};
 const incoming=phase('input_mapping'),configured=phase('configure'),saved=phase('node_finish'),mapped=phase('output_mapping'),finished=phase('finish');
 const c=configured.value.configuration;
 need(c?.verified&&c.inventory_complete&&['document_id','workflow_id','node_id'].every(k=>c.node_context?.[k]===node[k])
  &&configured.value.validation?.status==='accepted_by_loginom_next'&&saved.value.settings_applied===true&&finished.value.settings_applied===true,'Tree settings readback or commit differs');
 const common={kind:c.kind,mode:c.kind==='json_to_tree'?'auto_structure':'selected_nodes',scope:'observed_before_verified_finish',values_are:'observed_ui_values',
  node:structuredClone(node),receipt_ids:[incoming,configured,saved,mapped,finished].map(p=>p.receipt_id),package_persistence_verified:false};
 return c.kind==='json_to_tree'?{...common,json_field:c.json_field,root_mode:c.root_mode,auto_structure:c.auto_structure,strict:c.strict,exclude_root:c.exclude_root}:
  {...common,selected_paths:c.nodes.filter(n=>!n.is_container&&n.selected).map(n=>n.path),repeat_parents:c.repeat_parents,
   composite_names:c.composite_names,composite_labels:c.composite_labels,label_separator:c.label_separator};
}

export function createTreeNodeSupport(config,{json}){
 const type=json?'trees.from_json':'trees.to_table',stage=json?'json_tree':'tree_table';
 return createTabularTransformNodeSupport(config,{
  type,mode:json?'auto_structure':'selected_nodes',revision:'tree-stage1-v1',
  parameterSchema:json?jsonToTreeParametersSchema:treeToTableParametersSchema,validate:validateTreeParameters,readback:treeConfigurationReadback,
  configurationObservation:{condition:'owned tree component wizard',ready:s=>owned(s)&&['input_mapping','tree_input_mapping',stage].includes(s.wizard?.stage)},
  async preflight(options,ctx){
   const request=options.operation.parameters,graph=await options.operation.nodeTargetAdapter.observe(request,ctx.deadline,ctx.signal);
   const links=request.inputs.length?request.inputs:graph.links.filter(e=>request.target.kind==='existing'&&e.target===request.target.ref.node_id&&e.input===0)
    .map(e=>({source:graph.nodes.find(n=>n.ref.node_id===e.source)?.ref,input:e.input,output:e.output}));
   need(links.length===1&&links[0].input===0&&links[0].source,'Tree stage 1 requires exactly one bound input 0');
   const input=links[0],history=options.nodeHistory?.()??[];
   const related=history.filter(h=>same(h.outcome?.output?.node,input.source));
   const latest=related.at(-1),outcome=latest?.outcome,source=outcome?.output;
   need(latest?.cleanup_confirmed&&outcome.status==='SUCCEEDED'&&outcome.cleanup_complete===true&&source?.cleanup_complete===true
    &&source.execution?.status==='completed','Read/execute the same source node successfully before tree conversion');
   const port=source.output?.ports?.find(p=>p.port===input.output);
   need(port?.fresh===true&&port.sample_complete===true&&port.execution_id===source.execution.execution_id,'Tree stage 1 requires complete source readback from the same execution');
   const binding={document_id:request.document_id,workflow_ref:request.workflow_ref,node:input.source};
   const inventory=await options.execute(makeNodeOutputContextCode(binding),{timeout:Math.max(5000,ctx.deadline-(options.now??Date.now)()+5000)});
   const observed=inventory?.ports?.find(p=>p.index===input.output);
   need(inventory?.verified&&observed?.active&&observed.port_guid===port.port_guid,'Tree source port is inactive or changed');
   const previous=request.target.kind==='existing'?history.filter(h=>same(h.outcome?.output?.node,request.target.ref)).at(-1)?.outcome?.output?.configuration?.readback:null;
   if(json){
    const field=request.parameters.json_field??previous?.json_field,index=port.schema?.findIndex(c=>c.name===field&&c.type==='string');
    need(port.port_kind!=='tree'&&port.row_count===1&&port.sample?.length===1&&index>=0&&port.sample[0][index]?.is_null===false
     &&typeof port.sample[0][index].value==='string','Tree stage 1 needs one non-NULL JSON string row in the exact input field');
    validateTreeJsonScope(port.sample[0][index].value);
   }else{
    need(port.port_kind==='tree'&&port.tree?.complete===true,'Tree-to-table needs the actual complete typed tree port');
    validateSelectedTreePaths(port.tree.schema,request.parameters.selected_paths??previous?.selected_paths);
   }
   const event={phase:'tree_source_scope_verified',operation_id:options.operation.id,node:input.source,port:input.output,port_guid:port.port_guid,
    source_execution_id:source.execution.execution_id,source_kind:json?'table':'tree'};
   const ack=await options.onRecord(event);
   need(same(Object.fromEntries(Object.keys(event).map(k=>[k,ack?.[k]])),event),'Tree source scope journal acknowledgement differs');
   return {verified:true,cleanup_complete:true,effect_possible:false};
  },
  ...(!json?{async configureInputs(_channel,mappings){need(mappings.length===0,'Tree mapping edits are deferred');return {verified:true,cleanup_complete:true,effect_possible:false,default_tree_mapping:true};}}:{}),
  async configure(channel,p,{request}){
   const observe=condition=>channel.observe({condition,readTrees:true,ready});
   const step=async(s,destination)=>channel.perform({condition:'advance owned tree wizard',initialObservation:s,ready:owned,identity:s=>s.prepared_node_context,
    resolve:s=>({verb:'wizard_step',ref:one(s,e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'),'Tree Next unavailable').ref,expected_stage:destination})});
   let s=await channel.observe({condition:'initial tree page',ready:owned});
   if(['input_mapping','tree_input_mapping'].includes(s.wizard.stage)){await step(s,stage);s=await observe('native tree settings');}
   else s=await observe('native tree settings');
   const click=async(tid,condition)=>{
    s=await observe(condition);await channel.perform({condition,initialObservation:s,ready,identity:s=>s.prepared_node_context,
     resolve:s=>({verb:'click',ref:one(s,e=>e.tid===tid&&e.allowed_actions.includes('click'),condition+' control unavailable').ref})});
   };
   const setBool=async(key,value)=>{
    s=await observe('tree boolean '+key);const fields={pedBuildTreeAuto:'auto_structure',pedStrictMode:'strict',pedRootExcluded:'exclude_root',
     pedRepeatParentNodeValues:'repeat_parents',pedCompositeColumnNames:'composite_names',pedCompositeColumnDisplayNames:'composite_labels'};
    if(value===undefined||s.node_tree[fields[key]]===value)return;
    const base=s.node_tree.base+key+';ValueControl';
    const candidates=s.ui.elements.filter(e=>(e.tid===base||e.tid===base+';DisplayEl')&&e.allowed_actions.includes('click'));
    const display=candidates.filter(e=>e.tid.endsWith(';DisplayEl'));need(display.length===1||candidates.length===1,'Unique tree checkbox required');
    await click((display[0]??candidates[0]).tid,'set tree '+fields[key]);
    s=await observe('tree checkbox readback');need(s.node_tree[fields[key]]===value,'Tree checkbox did not settle');
   };
   if(request.finish==='close')return {verified:true,cleanup_complete:true,effect_possible:false,configuration:s.node_tree};
   if(json){
    if(p.json_field!==undefined&&s.node_tree.json_field!==p.json_field){
     await click(s.node_tree.base+'pedSourceColumn;ValueControl;trg_picker','open JSON input column');
     s=await channel.observe({condition:'JSON column option',readTrees:true,ready:s=>ready(s)&&s.ui.elements.some(e=>e.label===p.json_field&&e.allowed_actions.includes('click'))});
     await channel.perform({condition:'choose exact JSON input field',initialObservation:s,ready,identity:s=>s.prepared_node_context,
      resolve:s=>({verb:'click',ref:one(s,e=>e.label===p.json_field&&e.allowed_actions.includes('click')&&(e.role==='option'||e.tid?.includes(';boundlist;')),'Unique JSON column option required').ref})});
    }
    await setBool('pedBuildTreeAuto',true);await setBool('pedStrictMode',true);await setBool('pedRootExcluded',false);
    s=await observe('complete JSON tree settings');need(s.node_tree.json_field&&(p.json_field===undefined||s.node_tree.json_field===p.json_field)
     &&s.node_tree.auto_structure&&s.node_tree.strict&&!s.node_tree.exclude_root&&s.node_tree.root_mode==='auto','JSON tree stage 1 settings differ');
   }else{
    for(let attempt=0;attempt<16&&!s.node_tree.inventory_complete;attempt++){
     const node=s.node_tree.nodes.find(n=>n.is_container&&!n.loaded&&n.expander_tid);need(node,'Tree schema is not completely loaded');
     await click(node.expander_tid,'expand owned tree schema');s=await observe('expanded tree schema');
    }
    need(s.node_tree.inventory_complete,'Complete tree schema required');
    if(p.selected_paths){
     const actual=s.node_tree.nodes.filter(n=>!n.is_container&&p.selected_paths.includes(n.path)).map(n=>n.path);
     need(same(actual,p.selected_paths),'Selected paths differ from the native schema');
     if(s.node_tree.nodes.some(n=>n.selected))await click(s.node_tree.base+'btnDeselectAll','clear owned tree leaf selection');
     for(const path of p.selected_paths){s=await observe('tree path '+path);const node=s.node_tree.nodes.find(n=>n.path===path&&!n.is_container);
      need(node?.checkbox_tid,'Selected schema leaf is not rendered');if(!node.selected)await click(node.checkbox_tid,'select tree leaf '+path);}
    }
    await setBool('pedRepeatParentNodeValues',p.repeat_parents);await setBool('pedCompositeColumnNames',p.composite_names);
    await setBool('pedCompositeColumnDisplayNames',p.composite_labels);
    s=await observe('complete tree-to-table settings');
    need(!s.node_tree.composite_names&&!s.node_tree.composite_labels&&s.node_tree.label_separator==='.'
     &&s.node_tree.nodes.every(n=>!n.selected_global_index)&&s.node_tree.nodes.some(n=>!n.is_container&&n.selected),'Tree table stage 1 settings differ');
    if(p.selected_paths)need(same(s.node_tree.nodes.filter(n=>!n.is_container&&n.selected).map(n=>n.path),p.selected_paths),'Tree leaf selection did not settle');
   }
   const configuration=structuredClone(s.node_tree);
   await step(s,json?'tree_output_mapping':['output_mapping','done']);
   s=await channel.observe({condition:'tree output mapping or completion',ready:s=>owned(s)&&['tree_output_mapping','output_mapping','done'].includes(s.wizard?.stage)});
   if(s.wizard.stage!=='done'){await step(s,'done');s=await channel.observe({condition:'tree completion',ready:s=>owned(s)&&s.wizard?.stage==='done'});}
   return {verified:true,cleanup_complete:true,effect_possible:true,configuration,validation:{status:'accepted_by_loginom_next',node_context:s.prepared_node_context}};
  },
  async configureAllOutputs(_channel,configuration){return {verified:true,cleanup_complete:true,effect_possible:false,deferred_schema:true,configuration,ports:[{port:0,schema:null}]};},
  async readOutputs(channel,read,ctx,mapped){
   need(same(read.ports,[0]),'Tree stage 1 reads output 0');
   const {output}=await channel.readOutputPort({port:0,execution:ctx.portExecution,sampleRows:read.sample_rows,requireExactNumbers:true});
   if(json){need(output.port_kind==='tree'&&output.tree?.complete===true,'Complete native tree required');validateSelectedTreePaths(output.tree.schema);}
   else{
    need(output.port_kind!=='tree'&&output.sample_complete===true,'Tree table must be read completely');
    const names=mapped.configuration.nodes.filter(n=>!n.is_container&&n.selected).map(n=>n.name);
    need(same(output.schema.map(n=>n.name),names),'Native tree table field names or order differ');
   }
   return {verified:true,cleanup_complete:true,effect_possible:true,status:'complete',execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,ports:[output]};
  },
 });
}
