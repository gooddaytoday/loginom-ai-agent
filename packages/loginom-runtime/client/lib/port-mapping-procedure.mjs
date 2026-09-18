import {readOutputDefinitionPages,observeOutputDefinitionPage} from './import-definition-pages.mjs';
import {expandOutputChanges} from './output-mapping-changes.mjs';

const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const mappingControl=(s,suffix)=>{
  const tids=['ColumnsMappingEngineOutputPortWizard','DerivedDataSourceOutputSocketWizard','TuneDataSourceMappingWizard','DerivedDataSourceMappingEngineOutputPortWizard'].map(form=>s.wizard.root_tid+';'+form+';'+suffix);
  const controls=s.ui.elements.filter(e=>tids.includes(e.tid)&&e.allowed_actions.includes('click'));
  if(controls.length!==1)throw Error('Unique output mapping control unavailable');
  return controls[0];
};
const schema=definition=>definition.fields.map(f=>({name:f.name,label:f.label,type:f.type,
  data_kind:f.data_kind,usage:f.usage,source:Object.fromEntries(Object.entries(f.source??{}).filter(([key])=>key!=='cell_ref'))}));

// Changes the observed port option, preserving the entire output definition.
// Native synchronization itself remains a separate, explicitly requested action.
export async function configureOutputAutosync(channel,value) {
  if(typeof value!=='boolean')throw new Error('Explicit output autosync boolean required');
  const before=await readOutputDefinitionPages(channel);
  const ready=s=>s.wizard?.status==='observed'&&['output_mapping','input_mapping'].includes(s.wizard.stage)
    &&!s.wizard.column_parameters&&s.wizard.output_columns?.auto_sync?.status==='observed'
    &&typeof s.wizard.output_columns.auto_sync.value==='boolean';
  const initial=await channel.observe({condition:'output autosync option available',ready});
  const root=initial.wizard.root_ref,option=initial.wizard.output_columns.auto_sync;
  const bound=s=>ready(s)&&s.wizard.root_ref===root&&s.wizard.output_columns.auto_sync.ref===option.ref;
  if(option.value!==value) {
    await channel.perform({condition:'change the bound output autosync option',initialObservation:initial,
      ready:s=>bound(s)&&s.wizard.output_columns.auto_sync.value===option.value,
      identity:s=>({root:s.wizard.root_ref,option:s.wizard.output_columns.auto_sync}),
      resolve:s=>{
        if(mappingControl(s,'btnAutoSyncThroughColumns').ref!==option.ref)throw new Error('Unique output autosync control unavailable');
        return {verb:'click',ref:option.ref};
      }});
  }
  await channel.observe({condition:'requested output autosync value applied',
    ready:s=>bound(s)&&s.wizard.output_columns.auto_sync.value===value});
  const after=await readOutputDefinitionPages(channel,{expectedCount:before.total_columns,
    ready:s=>bound(s)&&s.wizard.output_columns.auto_sync.value===value});
  if(!same(schema(before),schema(after)))throw new Error('Output definition changed while setting autosync');
  return {verified:true,cleanup_complete:true,effect_possible:option.value!==value,
    autosync:{before:option.value,value},rendered_definition_preserved:true,source_identity_verified:false,definition:after,
    settings_applied:false,package_saved:false};
}

// A new node has no observed schema ID before its own configuration. This
// explicit self-reference is resolved only against that complete native source.
// A fields list is the full ordered layout; exclusions are explicit entries.
export function resolveConfiguredOutputMapping(mapping,configured,native) {
  const requireValue=(v,m)=>{if(!v)throw new Error(m);};
  requireValue((mapping?.port===0||Number.isInteger(mapping?.port)&&mapping.port>0&&native?.node_context?.verified===true&&(mapping.direction==='output'?native.node_context.output_port?.port===mapping.port:mapping.direction==='input'&&native.node_context.input_port?.port===mapping.port))&&(mapping.direction==='input'?native?.mapping_wizard==='TuneDataSourceMappingWizard':mapping.direction==='output'&&native?.mapping_wizard!=='TuneDataSourceMappingWizard'),'Port mapping direction differs from native wizard');
  requireValue(native?.verified===true&&native.inventory_complete===true&&native.source_identity_verified===true,
    'Complete native mapping source identity required');
  const used=configured.filter(c=>c.used),sources=native.source_fields,targets=native.target_fields;
  requireValue(Array.isArray(sources)&&Array.isArray(targets)&&sources.length===used.length
    &&new Set(sources.map(s=>s.name)).size===used.length
    &&sources.every(s=>{const c=used.find(c=>c.name===s.name);return c&&c.label===s.label&&c.type===s.type;}),
  'Configured source differs from the native mapping schema');
  if(mapping.changes!==undefined){
    const baseline=targets.map(current=>{
      const identity=current.source??current.exclusion_source;
      const source=sources.find(s=>s.record_id===identity?.record_id&&s.field_id===identity?.field_id);
      requireValue(source,'Native output change source is missing');
      return {source:{kind:'configured_field',name:source.name},name:current.name,label:current.label,excluded:current.excluded===true};
    });
    mapping=expandOutputChanges(mapping,baseline);
  }
  const fields=mapping.fields;
  if(fields===undefined)return {autosync:mapping.autosync??native.autosync,fields:null};
  requireValue(Array.isArray(fields)&&fields.length===used.length,'Mapping must account for every configured source field');
  const seen=new Set(),names=new Set();
  const resolved=fields.map(field=>{
    requireValue(field.source?.kind==='configured_field'&&!seen.has(field.source.name),'Unique configured field references required');
    const source=sources.find(s=>s.name===field.source.name);requireValue(source,'Mapping source field does not exist');seen.add(source.name);
    const matches=targets.filter(t=>{const s=t.source??t.exclusion_source;return s?.record_id===source.record_id&&s.field_id===source.field_id;});
    requireValue(matches.length===1,'One native output per configured source is required');
    const current=matches[0],name=field.name??(field.excluded&&current.excluded!==true?source.name:current.name),label=field.label??(field.excluded&&current.excluded!==true?(native.mapping_wizard==='DerivedDataSourceOutputSocketWizard'?source.name:source.label):current.label);
    requireValue(field.excluded!==true||(source.required===false&&current.required===false),'Required or unverified output fields cannot be excluded');
    if(field.excluded===true&&native.mapping_wizard==='DerivedDataSourceOutputSocketWizard') {
      requireValue(current.inherited===false,'Inherited output fields cannot be excluded');
      requireValue(name===source.name&&label===source.name,'Excluded fields use their source name as name and label');
    }
    requireValue(current.excluded!==true||field.excluded===true,'Restoring an excluded source requires a separate verified inclusion operation');
    requireValue(typeof current.data_kind==='string'&&current.data_kind.length>0,'Native output data kind required');
    requireValue(!names.has(name),'Duplicate requested output name');names.add(name);
    return {source:{...source},current:{...current},name,label,type:current.type,data_kind:current.data_kind,excluded:field.excluded===true};
  });
  requireValue(resolved.some(f=>!f.excluded),'At least one output field must remain');
  return {autosync:mapping.autosync??native.autosync,fields:resolved};
}

export async function configureOutputField(channel,field) {
  const nativeReady=s=>s.wizard?.status==='observed'&&['output_mapping','input_mapping'].includes(s.wizard.stage)
    &&s.node_mapping?.verified===true&&s.node_mapping.inventory_complete===true&&s.node_mapping.source_identity_verified===true;
  const initial=await channel.observe({condition:'native output field before edit',readMappings:true,ready:nativeReady});
  const baseline=initial.node_mapping;
  const find=n=>n.target_fields.filter(t=>t.record_id===field.current.record_id&&t.source?.record_id===field.source.record_id);
  const targets=find(baseline);
  if(targets.length!==1||!same(targets[0],field.current))throw new Error('Output field changed before edit');
  const original=targets[0];
  if(original.name===field.name&&original.label===field.label)return {verified:true,cleanup_complete:true,effect_possible:false,field:original,source_identity_verified:true,settings_applied:false};
  const definitions=await readOutputDefinitionPages(channel,{expectedCount:baseline.target_fields.length});
  const offset=Math.floor(original.index/8)*8;
  let state=await observeOutputDefinitionPage(channel,{offset,schemaId:definitions.schema_id,total:definitions.total_columns,field:original,fieldAction:'double_click'});
  const rowOf=s=>s.wizard?.output_columns?.fields?.find(f=>f.index===original.index&&f.name===original.name&&f.label===original.label);
  const row=rowOf(state);if(!row)throw new Error('Output field row is unavailable');
  const root=state.wizard.root_ref;
  await channel.perform({condition:'select the exact output field editor',initialObservation:state,
    ready:s=>s.wizard.root_ref===root&&!!rowOf(s),identity:()=>original,
    resolve:s=>{const r=rowOf(s),e=s.ui.elements.find(e=>e.ref===r.name_ref&&e.allowed_actions.includes('double_click'));
      if(!e)throw new Error('Output field editor gesture unavailable');return {verb:'double_click',ref:e.ref};}});
  const editorReady=s=>s.wizard?.root_ref===root&&s.wizard.column_parameters?.status==='observed'
    &&s.wizard.column_parameters.selected_column?.name===original.name;
  for(const key of ['name','label']) {
    const propertyReady=s=>editorReady(s)&&(s.wizard.column_parameters.fields[key]?.value===field[key]
      ||s.ui.elements.some(e=>e.ref===s.wizard.column_parameters.fields[key]?.input_ref&&e.wizard_field?.scope==='output_column'
        &&e.wizard_field.name===key&&e.allowed_actions.includes('set_wizard_field')));
    state=await channel.observe({condition:'bound output field '+key+' editor',ready:propertyReady});
    if(state.wizard.column_parameters.fields[key]?.value===field[key])continue;
    await channel.perform({condition:'set output field '+key,initialObservation:state,ready:propertyReady,
      identity:s=>({root,original,editor:s.wizard.column_parameters.root_ref}),
      resolve:s=>{const e=s.ui.elements.find(e=>e.wizard_field?.scope==='output_column'&&e.wizard_field.name===key&&e.allowed_actions.includes('set_wizard_field'));
        if(!e)throw new Error('Writable output field property unavailable');return {verb:'set_wizard_field',ref:e.ref,text:field[key]};}});
  }
  const applyReady=s=>editorReady(s)&&s.ui.elements.some(e=>e.column_close?.scope==='output'&&e.allowed_actions.includes('apply_output_column'));
  state=await channel.observe({condition:'output field Apply ready',ready:applyReady});
  await channel.perform({condition:'apply the bound output field changes',initialObservation:state,ready:applyReady,
    identity:s=>({root,original,fields:s.wizard.column_parameters.fields}),resolve:s=>{
      const e=s.ui.elements.find(e=>e.column_close?.scope==='output'&&e.allowed_actions.includes('apply_output_column'));
      if(!e)throw new Error('Output field Apply unavailable');return {verb:'apply_output_column',ref:e.ref};}});
  const after=await channel.observe({condition:'native output field after Apply',readMappings:true,ready:nativeReady});
  const expected={...baseline,target_fields:baseline.target_fields.map(t=>t.record_id===original.record_id?{...t,name:field.name,label:field.label,...(baseline.mapping_wizard==='TuneDataSourceMappingWizard'?{origin_type:1}:{})}:t)};
  const semantic=({rendered_indices,...rest})=>rest;
  if(!same(semantic(after.node_mapping),semantic(expected)))throw new Error('Output field edit changed unrelated native mapping state');
  return {verified:true,cleanup_complete:true,effect_possible:true,field:find(after.node_mapping)[0],source_identity_verified:true,settings_applied:false};
}

export async function reorderOutputFields(channel,recordIds) {
  const ready=s=>['output_mapping','input_mapping'].includes(s.wizard?.stage)&&s.node_mapping?.verified===true
    &&s.node_mapping.inventory_complete===true&&s.node_mapping.source_identity_verified===true;
  let state=await channel.observe({condition:'native mapping before reorder',readMappings:true,ready});
  const baseline=state.node_mapping;
  if(!Array.isArray(recordIds)||recordIds.length!==baseline.target_fields.length||new Set(recordIds).size!==recordIds.length
    ||recordIds.some(id=>!baseline.target_fields.some(f=>f.record_id===id)))throw Error('Reorder requires every native output record exactly once');
  const grouped=['DerivedDataSourceOutputSocketWizard','DerivedDataSourceMappingEngineOutputPortWizard'].includes(baseline.mapping_wizard);
  if(grouped) {
    if(baseline.target_fields.some(f=>typeof f.excluded!=='boolean'))throw Error('Native output groups required for reorder');
    const excluded=new Set(baseline.target_fields.filter(f=>f.excluded).map(f=>f.record_id));
    // Loginom keeps excluded records in their own group. Retain the requested
    // relative order inside each group; never move a row across that boundary.
    recordIds=[...recordIds.filter(id=>!excluded.has(id)),...recordIds.filter(id=>excluded.has(id))];
  }
  const semantic=({rendered_indices,...rest})=>rest;
  let expected=structuredClone(baseline),moves=0;
  for(let destination=0;destination<recordIds.length;destination++) {
    while(expected.target_fields.findIndex(f=>f.record_id===recordIds[destination])>destination) {
      const index=expected.target_fields.findIndex(f=>f.record_id===recordIds[destination]),field=expected.target_fields[index];
      if(grouped&&expected.target_fields[index-1].excluded!==field.excluded)throw Error('Output reorder would cross an exclusion group');
      const offset=Math.floor(index/8)*8;
      state=await observeOutputDefinitionPage(channel,{offset,total:recordIds.length,field});
      const rowOf=s=>s.wizard?.output_columns?.fields?.find(f=>f.index===index&&f.name===field.name&&f.label===field.label);
      const root=state.wizard.root_ref;
      await channel.perform({condition:'select output field to move',initialObservation:state,
        ready:s=>s.wizard.root_ref===root&&!!rowOf(s),identity:()=>field,
        resolve:s=>{const row=rowOf(s),e=s.ui.elements.find(e=>e.ref===row.name_ref&&e.allowed_actions.includes('click'));
          if(!e)throw Error('Output reorder selection unavailable');return {verb:'click',ref:e.ref};}});
      state=await channel.observe({condition:'selected output field move up ready',outputColumnPage:{offset,limit:8},
        ready:s=>s.wizard?.root_ref===root&&rowOf(s)?.selected===true});
      await channel.perform({condition:'move the selected output field one position up',initialObservation:state,
        ready:s=>s.wizard?.root_ref===root&&rowOf(s)?.selected===true,identity:()=>field,
        resolve:s=>({verb:'click',ref:mappingControl(s,'btnMoveMappingColumnUp').ref})});
      [expected.target_fields[index-1],expected.target_fields[index]]=[expected.target_fields[index],expected.target_fields[index-1]];
      const groupIndices=new Map();
      expected.target_fields=expected.target_fields.map((f,i)=>{
        const groupIndex=groupIndices.get(f.excluded)??0;groupIndices.set(f.excluded,groupIndex+1);
        return {...f,index:i,...(grouped?{group_index:groupIndex}:{})};
      });moves++;
      state=await channel.observe({condition:'native output order after one move',readMappings:true,ready});
      if(!same(semantic(state.node_mapping),semantic(expected)))throw Error('Output reorder changed unrelated native mapping state');
    }
  }
  return {verified:true,cleanup_complete:true,effect_possible:moves>0,moves,definition:state.node_mapping??expected,
    source_identity_verified:true,settings_applied:false};
}

// Stage a temporary name only to break a cycle. All names are reserved before
// the first gesture, including names that another field will acquire later.
export function planOutputFieldEdits(fields) {
  if(!Array.isArray(fields)||fields.length===0||fields.length>1000)throw Error('Complete output fields required');
  const key=name=>name.toLocaleLowerCase('en-US');
  const valid=name=>typeof name==='string'&&name.length>0&&name.length<=200&&!/[\u0000-\u001f\u007f]/.test(name);
  const ids=new Set(),occupied=new Map(),requested=new Set();
  for(const f of fields) {
    if(!f?.current?.record_id||ids.has(f.current.record_id)||!valid(f.current.name)||!valid(f.name)
      ||typeof f.label!=='string'||f.label.length>200
      ||f.excluded===true&&(f.name!==f.current.name||f.label!==f.current.label))throw Error('Supported unique output field edits required');
    ids.add(f.current.record_id);
    if(occupied.has(key(f.current.name))||requested.has(key(f.name)))throw Error('Ambiguous output field names');
    occupied.set(key(f.current.name),f.current.record_id);requested.add(key(f.name));
  }
  const reserved=new Set([...occupied.keys(),...requested]),pending=fields.filter(f=>f.current.name!==f.name||f.current.label!==f.label)
    .map(f=>({...f,current:{...f.current}})),steps=[];
  let suffix=0;
  while(pending.length) {
    const index=pending.findIndex(f=>!occupied.has(key(f.name))||occupied.get(key(f.name))===f.current.record_id);
    if(index>=0) {
      const [f]=pending.splice(index,1);
      steps.push({record_id:f.current.record_id,name:f.name,label:f.label,temporary:false});
      occupied.delete(key(f.current.name));occupied.set(key(f.name),f.current.record_id);
    } else {
      const f=pending[0];let name;
      do{name='DockMappingTemporary'+(++suffix);}while(reserved.has(key(name)));
      reserved.add(key(name));occupied.delete(key(f.current.name));occupied.set(key(name),f.current.record_id);
      steps.push({record_id:f.current.record_id,name,label:f.current.label,temporary:true});f.current.name=name;
    }
  }
  return steps;
}

export async function configureOutputFields(channel,mapping,configured) {
  const ready=s=>s.wizard?.status==='observed'&&['output_mapping','input_mapping'].includes(s.wizard.stage)
    &&s.node_mapping?.verified===true&&s.node_mapping.inventory_complete===true&&s.node_mapping.source_identity_verified===true;
  const before=await channel.observe({condition:'complete native mapping before field edits',readMappings:true,ready});
  const resolved=resolveConfiguredOutputMapping(mapping,configured,before.node_mapping);
  if(resolved.fields===null)return {verified:true,effect_possible:false,cleanup_complete:true,edits:[],settings_applied:false};
  // An existing exclusion is preserved as native state; only a new exclusion
  // requires the separately verified exclusion gesture.
  const exclusions=resolved.fields.filter(f=>f.excluded&&f.current.excluded!==true),edits=[];
  if(exclusions.length&&before.node_mapping.mapping_wizard!=='DerivedDataSourceOutputSocketWizard')throw Error('Verified separate output wizard required for exclusions');
  // Validate the complete post-exclusion namespace before any mutation. Native
  // exclusion replaces the output record and sets both name and label to the source name.
  const planned=resolved.fields.map(f=>f.excluded&&f.current.excluded!==true?{...f,current:{...f.current,name:f.source.name,label:f.source.name}}:f);
  const steps=planOutputFieldEdits(planned);
  let expected=structuredClone(before.node_mapping);
  const semantic=({rendered_indices,...rest})=>rest;
  for(const field of exclusions) {
    const state=await channel.observe({condition:'native mapping before planned exclusion',readMappings:true,ready});
    if(!same(semantic(state.node_mapping),semantic(expected)))throw Error('Mapping changed between planned exclusions');
    const result=await excludeOutputField(channel,field.source.record_id);
    expected=structuredClone(result.definition);
    edits.push({source_record_id:field.source.record_id,excluded:true,verified:result.verified,effect_possible:result.effect_possible});
  }
  for(const step of steps) {
    const state=await channel.observe({condition:'native mapping before planned field edit',readMappings:true,ready});
    if(!same(semantic(state.node_mapping),semantic(expected)))throw Error('Mapping changed between planned field edits');
    const current=expected.target_fields.find(f=>f.record_id===step.record_id);
    const result=await configureOutputField(channel,{current,source:current.source,name:step.name,label:step.label});
    expected.target_fields=expected.target_fields.map(f=>f.record_id===step.record_id?{...f,name:step.name,label:step.label,...(expected.mapping_wizard==='TuneDataSourceMappingWizard'?{origin_type:1}:{})}:f);
    edits.push({...step,verified:result.verified,effect_possible:result.effect_possible});
  }
  return {verified:true,cleanup_complete:true,effect_possible:edits.some(e=>e.effect_possible),edits,
    source_identity_verified:true,definition:expected,settings_applied:false};
}

// Exclusion is a source exclusion record, not deletion of the input field.
// The node context and complete cached mapping are checked before every gesture.
export async function excludeOutputField(channel,sourceRecordId) {
  if(typeof sourceRecordId!=='string'||!sourceRecordId)throw Error('Exact native source record required');
  const ready=s=>s.wizard?.status==='observed'&&['output_mapping','input_mapping'].includes(s.wizard.stage)
    &&s.node_mapping?.verified===true&&s.node_mapping.inventory_complete===true&&s.node_mapping.source_identity_verified===true
    &&s.node_mapping.mapping_wizard==='DerivedDataSourceOutputSocketWizard';
  let state=await channel.observe({condition:'native output mapping before exclusion',readMappings:true,ready});
  const baseline=state.node_mapping,source=baseline.source_fields.filter(f=>f.record_id===sourceRecordId);
  if(source.length!==1||source[0].required!==false)throw Error('Only a verified optional source can be excluded');
  const existing=baseline.target_fields.filter(f=>f.excluded===true&&f.exclusion_source?.record_id===sourceRecordId);
  if(existing.length===1)return {verified:true,effect_possible:false,cleanup_complete:true,definition:baseline,settings_applied:false};
  const matches=baseline.target_fields.filter(f=>f.source?.record_id===sourceRecordId),field=matches[0];
  if(existing.length||matches.length!==1||field.required!==false||field.inherited!==false||field.excluded!==false
    ||baseline.target_fields.filter(f=>!f.excluded).length<2)throw Error('Output exclusion restriction or ambiguous source');
  const semantic=({rendered_indices,...rest})=>rest;
  const definition=await readOutputDefinitionPages(channel,{expectedCount:baseline.target_fields.length});
  state=await observeOutputDefinitionPage(channel,{offset:Math.floor(field.index/8)*8,schemaId:definition.schema_id,total:definition.total_columns,field});
  const rowOf=s=>s.wizard?.output_columns?.fields?.find(f=>f.index===field.index&&f.name===field.name&&f.label===field.label);
  const root=state.wizard.root_ref;
  await channel.perform({condition:'select optional output field',initialObservation:state,
    ready:s=>s.wizard?.root_ref===root&&!!rowOf(s),identity:()=>({source:source[0],field}),resolve:s=>{
      const row=rowOf(s),e=s.ui.elements.find(e=>e.ref===row.name_ref&&e.allowed_actions.includes('click'));
      if(!e)throw Error('Optional output field selection unavailable');return {verb:'click',ref:e.ref};}});
  state=await channel.observe({condition:'selected optional field before exclusion',readMappings:true,
    outputColumnPage:{offset:Math.floor(field.index/8)*8,limit:8},ready:s=>ready(s)&&s.wizard.root_ref===root&&rowOf(s)?.selected===true});
  if(!same(semantic(state.node_mapping),semantic(baseline)))throw Error('Mapping changed before exclusion');
  await channel.perform({condition:'exclude the selected optional output field',initialObservation:state,
    ready:s=>ready(s)&&s.wizard.root_ref===root&&rowOf(s)?.selected===true&&same(semantic(s.node_mapping),semantic(baseline)),
    identity:()=>({source:source[0],field}),resolve:s=>{
      const controls=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';DerivedDataSourceOutputSocketWizard;btnAddMappingToExcluded'&&e.allowed_actions.includes('click'));
      if(controls.length!==1)throw Error('Optional output exclusion action unavailable');return {verb:'click',ref:controls[0].ref};}});
  const after=(await channel.observe({condition:'native excluded source and preserved mappings',readMappings:true,ready})).node_mapping;
  if(!same(after.source_fields,baseline.source_fields)||after.autosync!==baseline.autosync||after.target_fields.length!==baseline.target_fields.length)
    throw Error('Output exclusion changed the source or unrelated port options');
  const added=after.target_fields.filter(f=>!baseline.target_fields.some(b=>b.record_id===f.record_id));
  if(added.length!==1)throw Error('One new exclusion record required');
  const excluded=added[0];
  if(excluded.excluded!==true||excluded.inherited!==false||excluded.required!==false||excluded.source!==null
    ||!same(excluded.exclusion_source,source[0])||excluded.name!==source[0].name||excluded.label!==source[0].name
    ||excluded.type!==source[0].type||excluded.data_kind!=='Неопределенное'
    ||baseline.target_fields.some(f=>f.field_id===excluded.field_id)||after.target_fields.some(f=>f.record_id===field.record_id))
    throw Error('Excluded record identity differs from the selected optional source');
  const oldRemaining=baseline.target_fields.filter(f=>f.record_id!==field.record_id),newRemaining=after.target_fields.filter(f=>f.record_id!==excluded.record_id);
  const properties=({index,group_index,...rest})=>rest;
  if(!same(oldRemaining.map(properties),newRemaining.map(properties)))throw Error('Output exclusion changed unrelated fields');
  if(after.target_fields.at(-1)!==excluded)throw Error('Excluded record was not appended');
  return {verified:true,effect_possible:true,cleanup_complete:true,source_identity_verified:true,
    excluded_source:source[0],removed_output_record_id:field.record_id,excluded_record:excluded,definition:after,settings_applied:false,package_saved:false};
}

export async function finishPreparedOutputPort(channel) {
  const ready=s=>s.prepared_node_context?.verified===true&&s.prepared_node_context.surface==='wizard'
    &&s.prepared_node_context.output_port?.direction==='output'&&s.wizard?.status==='observed'
    &&['output_mapping','input_mapping'].includes(s.wizard.stage)&&!s.wizard.column_parameters;
  const before=await channel.observe({condition:'prepared output port ready for Done',readMappings:true,outputColumnPage:{offset:0,limit:8},
    ready:s=>ready(s)&&s.node_mapping?.verified===true});
  const owner=before.prepared_node_context,root=before.wizard.root_ref;
  await channel.perform({condition:'finish the configured output port',initialObservation:before,
    ready:s=>ready(s)&&same(s.prepared_node_context,owner)&&s.wizard.root_ref===root,
    identity:()=>owner,resolve:s=>{
      const buttons=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnDone'&&e.wizard_finish?.mode==='output_port'&&e.allowed_actions.includes('finish_wizard'));
      if(buttons.length!==1)throw Error('Output port Done unavailable');return {verb:'finish_wizard',ref:buttons[0].ref};}});
  const after=await channel.observe({condition:'same graph node unlocked after port Done',ready:s=>s.wizard?.status==='absent'
    &&s.prepared_node_context?.verified===true&&s.prepared_node_context.surface==='graph'&&s.prepared_node_context.locked===false
    &&['document_id','workflow_id','node_id'].every(k=>s.prepared_node_context[k]===owner[k])});
  return {verified:true,cleanup_complete:true,settings_applied:true,package_saved:false,
    port:owner.output_port,definition:before.node_mapping,node_context:after.prepared_node_context};
}

// Fixed local lifecycle for the observed standalone tabular output wizard.
// The node handler supplies its complete configured source schema; no graph or
// model instructions are accepted here. Finish owns the port commit only.
export async function configureSeparateOutputPort(channel,mapping,configured) {
  if(mapping?.direction!=='output'||mapping.port!==0||!Array.isArray(configured)||!configured.length)
    throw Error('The observed standalone output port 0 and configured source schema are required');
  await channel.openOutputPort(mapping.port);
  const ready=s=>s.prepared_node_context?.output_port?.port===mapping.port&&s.node_mapping?.verified===true;
  const before=await channel.observe({condition:'standalone output mapping source ready',readMappings:true,ready});
  let resolved=resolveConfiguredOutputMapping(mapping,configured,before.node_mapping);
  const changes=[];
  // Validate the full requested namespace before changing autosync or fields.
  if(mapping.fields!==undefined) {
    changes.push(await configureOutputFields(channel,mapping,configured));
    const edited=await channel.observe({condition:'standalone output identities after edits',readMappings:true,ready});
    resolved=resolveConfiguredOutputMapping(mapping,configured,edited.node_mapping);
    changes.push(await reorderOutputFields(channel,resolved.fields.map(f=>f.current.record_id)));
  }
  if(mapping.autosync!==undefined)changes.push(await configureOutputAutosync(channel,mapping.autosync));
  const final=await channel.observe({condition:'standalone output mapping complete before Done',readMappings:true,ready});
  const actual=final.node_mapping;
  if(actual.autosync!==resolved.autosync)throw Error('Standalone output autosync differs');
  if(resolved.fields) {
    const expected=[...resolved.fields.filter(f=>!f.excluded),...resolved.fields.filter(f=>f.excluded)];
    if(actual.target_fields.length!==expected.length||actual.target_fields.some((f,i)=>{
      const e=expected[i],source=f.source??f.exclusion_source;
      return f.record_id!==e.current.record_id||f.name!==e.name||f.label!==e.label||(f.excluded===true)!==e.excluded
        ||source?.record_id!==e.source.record_id||source.field_id!==e.source.field_id;
    }))throw Error('Standalone output fields differ from the requested complete mapping');
  }
  const finished=await finishPreparedOutputPort(channel);
  const semantic=m=>Object.fromEntries(Object.entries(m).filter(([key])=>key!=='rendered_indices'));
  if(!same(semantic(finished.definition),semantic(actual)))throw Error('Standalone output definition changed during Done');
  return {...finished,effect_possible:true,changes,source_identity_verified:true};
}
