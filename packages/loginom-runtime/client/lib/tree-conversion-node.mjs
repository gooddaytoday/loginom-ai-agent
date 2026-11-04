import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {makeNodeOutputContextCode} from './node-output-context.mjs';
import {tableToTreeParametersSchema,treeToJsonParametersSchema,validateTreeConversionParameters,validateTableTreeSource,validateSerializationTree} from './tree-conversion-parameters.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const declared=n=>Object.fromEntries(['path','name','label','type','is_array','source_field'].filter(k=>Object.hasOwn(n,k)).map(k=>[k,n[k]]));
const owned=s=>s.prepared_node_context?.verified===true&&s.prepared_node_context.surface==='wizard';
const ready=s=>owned(s)&&s.node_tree?.verified===true;
const one=(s,p,m)=>{const found=s.ui.elements.filter(p);need(found.length===1,m);return found[0];};
export function treeConversionReadback({node,phases,operation_id}){
 const receipts=['input_mapping','configure','node_finish','output_mapping','finish'].map(phase=>{
  const found=phases.filter(p=>p.phase===phase);need(found.length===1&&found[0].status==='verified'&&found[0].receipt_id===operation_id+':'+phase&&found[0].value?.verified&&found[0].value.cleanup_complete,'Verified conversion phase required');return found[0];
 });
 const c=receipts[1].value.configuration;
 need(c?.verified&&c.inventory_complete&&['document_id','workflow_id','node_id'].every(k=>c.node_context?.[k]===node[k])
  &&receipts[1].value.validation?.status==='accepted_by_loginom_next'&&receipts[2].value.settings_applied===true&&receipts[4].value.settings_applied===true,'Conversion settings/commit differ');
 const common={kind:c.kind,mode:c.kind==='table_to_tree'?'manual_structure':'serialize',scope:'observed_before_verified_finish',values_are:'observed_ui_values',node:structuredClone(node),
  input_port:0,output_port:0,receipt_ids:receipts.map(p=>p.receipt_id),package_persistence_verified:false};
 return c.kind==='table_to_tree'?{...common,nodes:c.nodes.map(declared)}:{...common,...Object.fromEntries(Object.keys(treeToJsonParametersSchema.properties).map(k=>[k,c[k]]))};
}
export function createTreeConversionNodeSupport(config,{table}){
 const type=table?'trees.from_table':'trees.to_json',stage=table?'table_tree':'tree_json';
 return createTabularTransformNodeSupport(config,{
  type,mode:table?'manual_structure':'serialize',revision:'tree-conversion-stage1-v1',parameterSchema:table?tableToTreeParametersSchema:treeToJsonParametersSchema,
  validate:validateTreeConversionParameters,readback:treeConversionReadback,
  configurationObservation:{condition:'owned conversion wizard',ready:s=>owned(s)&&['input_mapping','tree_input_mapping',stage].includes(s.wizard?.stage)},
  async preflight(options,ctx){
   const r=options.operation.parameters,g=await options.operation.nodeTargetAdapter.observe(r,ctx.deadline,ctx.signal);
   const links=r.inputs.length?r.inputs:g.links.filter(l=>r.target.kind==='existing'&&l.target===r.target.ref.node_id&&l.input===0)
    .map(l=>({source:g.nodes.find(n=>n.ref.node_id===l.source)?.ref,input:l.input,output:l.output}));
   need(links.length===1&&links[0].source,'Conversion requires exactly one input 0');
   const input=links[0],history=options.nodeHistory?.()??[],latest=history.filter(h=>same(h.outcome?.output?.node,input.source)).at(-1),o=latest?.outcome,out=o?.output;
   need(latest?.cleanup_confirmed&&o.status==='SUCCEEDED'&&o.cleanup_complete===true&&out.cleanup_complete===true&&out.execution?.status==='completed','Execute/read the same source completely before conversion');
   const port=out.output?.ports?.find(p=>p.port===input.output);
   need(port?.fresh===true&&port.sample_complete===true&&port.execution_id===out.execution.execution_id,'Conversion source read is stale or incomplete');
   const inventory=await options.execute(makeNodeOutputContextCode({document_id:r.document_id,workflow_ref:r.workflow_ref,node:input.source}),{timeout:Math.max(5000,ctx.deadline-Date.now()+5000)});
   need(inventory?.verified&&inventory.ports?.some(p=>p.index===input.output&&p.active&&p.port_guid===port.port_guid),'Conversion source port changed');
   if(table){
    const previous=r.target.kind==='existing'?history.filter(h=>same(h.outcome?.output?.node,r.target.ref)).at(-1)?.outcome?.output?.configuration?.readback:null;
    const nodes=r.parameters.nodes??previous?.nodes;need(nodes,'Existing structure requires its verified local readback');validateTableTreeSource(port,nodes);
   }else validateSerializationTree(port);
   const event={phase:'tree_conversion_source_verified',operation_id:options.operation.id,node:input.source,port:input.output,port_guid:port.port_guid,source_execution_id:out.execution.execution_id};
   const ack=await options.onRecord(event);need(same(event,Object.fromEntries(Object.keys(event).map(k=>[k,ack?.[k]]))),'Conversion source acknowledgement differs');
   return {verified:true,cleanup_complete:true,effect_possible:false};
  },
  ...(!table?{async configureInputs(_channel,mappings){need(mappings.length===0,'Tree mapping edits unsupported');return {verified:true,cleanup_complete:true,effect_possible:false,default_tree_mapping:true};}}:{}),
  async configure(channel,p,{request}){
   let s=await channel.observe({condition:'conversion initial wizard',ready:owned});
   const step=async(destination)=>channel.perform({condition:'advance conversion wizard',initialObservation:s,ready:owned,identity:s=>s.prepared_node_context,
    resolve:s=>({verb:'wizard_step',ref:one(s,e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'),'Conversion Next unavailable').ref,expected_stage:destination})});
   if(['input_mapping','tree_input_mapping'].includes(s.wizard.stage)){await step(stage);}
   const observe=async(condition,predicate=()=>true)=>s=await channel.observe({condition,readTrees:true,ready:s=>ready(s)&&predicate(s.node_tree)});
   await observe('conversion settings');
   const act=async(tid,verb='click',extra={})=>{
    await observe('conversion '+verb+' '+tid);
    await channel.perform({condition:'conversion '+verb,initialObservation:s,ready,identity:s=>s.prepared_node_context,
     resolve:s=>({verb,ref:one(s,e=>(e.tid===tid||e.signature?.tid===tid)&&e.allowed_actions.includes(verb),'Conversion control unavailable: '+tid).ref,...extra})});
   };
   const fill=async(tid,value)=>{
    await observe('conversion editor input');
    const input=one(s,e=>e.allowed_actions.includes('fill')&&(e.tid===tid||e.identity?.anchor_tid===tid||e.signature?.tid===tid||e.wizard_field?.owner_tid===tid),'Conversion text input unavailable: '+tid);
    await channel.perform({condition:'fill conversion editor',initialObservation:s,ready,identity:s=>s.prepared_node_context,resolve:()=>({verb:'fill',ref:input.ref,text:value})});
    await observe('conversion editor blur');
    const current=one(s,e=>e.ref===input.ref&&e.allowed_actions.includes('press'),'Conversion input identity changed');
    await channel.perform({condition:'commit conversion editor field',initialObservation:s,ready,identity:s=>s.prepared_node_context,resolve:()=>({verb:'press',ref:current.ref,key:'Tab'})});
   };
   if(request.finish==='close')return {verified:true,cleanup_complete:true,effect_possible:false,configuration:s.node_tree};
   if(table){
    if(p.nodes&&!same(s.node_tree.nodes.map(declared),p.nodes)){
     // Delete existing root children, preserving the native mandatory Root.
     for(let i=0;i<64;i++){
      await observe('conversion structure before replacement');const child=s.node_tree.nodes.find(n=>n.parent===0);if(!child)break;
      await act(child.tid);await act(child.delete_tid);
      await observe('conversion deletion confirmation',c=>c.delete_confirmation?.path===child.path);
      await act('msgbox;tlb;yes');await observe('conversion deleted child',c=>!c.nodes.some(n=>n.path===child.path));
     }
     for(const node of p.nodes.slice(1)){
      await observe('conversion parent');const parent=s.node_tree.nodes.find(n=>n.path===node.path.slice(0,node.path.lastIndexOf('/')));need(parent?.tid,'Conversion parent not rendered');
      await act(parent.tid);await act(s.node_tree.base+'btnAddChild');await observe('conversion node editor',c=>c.editor?.add===true);
      await fill('EditDataTreeNodeDefForm;edtName',node.name);
      await observe('conversion node label');if(s.node_tree.editor.label!==node.label)await fill('EditDataTreeNodeDefForm;edtDisplayName',node.label);
      if(node.type!=='object'){
       await act('EditDataTreeNodeDefForm;cbxDataType;trg_picker');
       await act('EditDataTreeNodeDefForm;cbxDataType;boundlist;'+{integer:'Целый',real:'Вещественный',string:'Строковый',boolean:'Логический'}[node.type]);
      }
      for(const [key,wanted] of [['chbIsContainer',node.type==='object'],['chbIsArray',node.is_array]]){
       await observe('conversion node flags');const actual=key==='chbIsContainer'?s.node_tree.editor.is_container:s.node_tree.editor.is_array;
       if(actual!==wanted)await act('EditDataTreeNodeDefForm;'+key+';DisplayEl');
      }
      await observe('conversion complete node definition',c=>c.editor?.name===node.name&&c.editor.label===node.label&&c.editor.is_container===(node.type==='object')&&c.editor.is_array===node.is_array&&(node.type==='object'||c.editor.type===node.type));
      await act('EditDataTreeNodeDefForm;btnApply');await observe('conversion node inserted',c=>!c.editor&&c.nodes.some(n=>n.path===node.path));
     }
     await act(s.node_tree.base+'btnClearLinks');
     for(const node of p.nodes.filter(n=>n.source_field)){
      await observe('conversion explicit field link');const target=s.node_tree.nodes.find(n=>n.path===node.path),source=s.node_tree.source_fields.find(f=>f.name===node.source_field&&f.type===node.type);
      need(target?.tid&&source?.tid,'Conversion mapping identity unavailable');
      await channel.perform({condition:'link exact conversion field',initialObservation:s,ready,identity:s=>s.prepared_node_context,
       resolve:s=>({verb:'drag',source_ref:one(s,e=>e.tid===source.tid&&e.allowed_actions.includes('drag'),'Conversion source field unavailable').ref,
        target_ref:one(s,e=>e.tid===target.tid&&e.allowed_actions.includes('drag'),'Conversion target leaf unavailable').ref})});
      await observe('conversion mapped field',c=>c.nodes.find(n=>n.path===node.path)?.source_field===node.source_field);
     }
    }
    await observe('conversion complete structure',c=>!p.nodes||same(c.nodes.map(declared),p.nodes));
    validateTreeConversionParameters({nodes:s.node_tree.nodes.map(declared)},'manual_structure',{...request,target:{...request.target,kind:'existing'},inputs:[]});
   }else{
    for(const [key,field,wanted] of [['pedRootExcluded','exclude_root',true],['pedPrettifyJSON','pretty',false],['pedDisplayNameAsKey','keys','names'],['pedMultiRowOutput','multi_row',false],['pedDateTimeIsISO8601','datetime','iso8601']]){
     await observe('serialization '+field);if(s.node_tree[field]!==wanted)await act(s.node_tree.base+key+';ValueControl;DisplayEl');
    }
    await observe('serialization settings verified',c=>c.exclude_root===true&&c.pretty===false&&c.keys==='names'&&c.multi_row===false&&c.datetime==='iso8601');
   }
   const configuration=structuredClone(s.node_tree);
   await step(table?['tree_output_mapping','done']:['output_mapping','done']);
   s=await channel.observe({condition:'conversion output or done',ready:s=>owned(s)&&['tree_output_mapping','output_mapping','done'].includes(s.wizard?.stage)});
   if(s.wizard.stage!=='done'){await step('done');s=await channel.observe({condition:'conversion done',ready:s=>owned(s)&&s.wizard?.stage==='done'});}
   return {verified:true,cleanup_complete:true,effect_possible:true,configuration,validation:{status:'accepted_by_loginom_next',node_context:s.prepared_node_context}};
  },
  async configureAllOutputs(_channel,configuration){return {verified:true,cleanup_complete:true,effect_possible:false,deferred_schema:true,configuration,ports:[{port:0,schema:null}]};},
  async readOutputs(channel,read,ctx){
   need(same(read.ports,[0]),'Conversion reads output 0');
   const {output}=await channel.readOutputPort({port:0,execution:ctx.portExecution,sampleRows:read.sample_rows,requireExactNumbers:true});
   if(table)validateSerializationTree(output);
   else need(output.port_kind!=='tree'&&output.sample_complete===true&&output.row_count===1&&output.schema?.length===1&&output.schema[0].type==='string','Serialization requires the complete one-row JSON string');
   return {verified:true,cleanup_complete:true,effect_possible:true,status:'complete',execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,ports:[output]};
  },
 });
}
