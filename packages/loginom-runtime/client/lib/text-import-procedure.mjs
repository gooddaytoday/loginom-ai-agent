// Fixed one-node procedure, not a scenario interpreter. Until native acceptance
// and the independent auditor are complete this module is not catalog-admitted.
import {resolveTextImportEncoding} from './text-import-encoding.mjs';
import {readImportDefinitionPages} from './import-definition-pages.mjs';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const types = { integer: 'Целый', real: 'Вещественный', string: 'Строковый', boolean: 'Логический', datetime: 'Дата/Время' };
const kinds = ['Неопределенное', 'Непрерывный', 'Дискретный'];
function requireValue(condition, message) { if (!condition) throw new Error(message); }
function one(values, message) { requireValue(values.length === 1, message); return values[0]; }

// Inline editors occupy the entire column, including a picker at its right edge.
// A clickable sliver is sufficient for a cell gesture, but not for its editor.
export function importFieldRevealDelta(target, scroller) {
  const cell=target?.bounding_box, view=scroller?.bounding_box;
  requireValue(cell && view && [cell.x,cell.width,view.x,view.width].every(Number.isFinite)
    && cell.width>0 && view.width>0, 'Import field geometry is unobserved');
  requireValue(cell.width<=view.width, 'Import field is wider than its viewport');
  const delta=cell.x<view.x ? cell.x-view.x : Math.max(0,cell.x+cell.width-view.x-view.width);
  return Math.sign(delta)*Math.min(1000,Math.ceil(Math.abs(delta)));
}

export function importFieldHasCompleteLayout(state,target) {
  const columns=state.wizard?.import_columns,coverage=columns?.definition_coverage;
  return coverage?.status==='complete_configured_columns'&&coverage.count===columns.fields?.length
    &&coverage.count>0&&coverage.count<=8&&target?.interaction?.state==='point_observed'
    &&columns.fields.some(c=>c.status==='observed'&&Object.values(c.cell_refs??{}).includes(target.ref));
}

export function isTextImportSourceReady(state) {
  const fields=state.wizard?.import_source?.fields;
  if(state.wizard?.stage!=='text_import_file' || !fields
    || !['source_path','connection','encoding','rows_to_skip','first_line_as_title'].every(name=>
      fields[name]?.status==='observed' && fields[name].truncated!==true))return false;
  return typeof fields.source_path.value==='string' && typeof fields.first_line_as_title.value==='boolean'
    && typeof fields.connection.value==='string' && fields.connection.value.length>0
    && typeof fields.encoding.value==='string' && fields.encoding.value.length>0
    && typeof fields.rows_to_skip.value==='string' && /^[0-9]+$/.test(fields.rows_to_skip.value);
}

function validateSettings(p,maxColumns) {
  requireValue(p && typeof p === 'object' && !Array.isArray(p), 'Text import parameters are required');
  requireValue(Object.keys(p).sort().join(',') === 'columns,format,source', 'Unexpected text import parameters');
  requireValue(p.source && Object.keys(p.source).sort().join(',') === 'encoding,first_line_as_title,rows_to_skip,source_path', 'Source parameters are incomplete');
  requireValue(typeof p.source.source_path === 'string' && /^\/(?!\/)/.test(p.source.source_path)
    && p.source.source_path.length <= 2048 && !/[|*?%\\\x00-\x1f]/.test(p.source.source_path)
    && p.source.source_path.split('/').slice(1).every(x => x && x !== '.' && x !== '..'), 'One explicit storage path is required');
  requireValue(typeof p.source.encoding === 'string' && p.source.encoding.length > 0 && p.source.encoding.length <= 100, 'Encoding is required');
  requireValue(typeof p.source.first_line_as_title === 'boolean' && Number.isInteger(p.source.rows_to_skip)
    && p.source.rows_to_skip >= 0 && p.source.rows_to_skip <= 1000000, 'Invalid source row settings');
  requireValue(p.format && Object.keys(p.format).sort().join(',') === 'decimal_separator,delimiter,null_marker,text_qualifier', 'Format parameters are incomplete');
  for (const [name, value] of Object.entries(p.format)) requireValue(typeof value === 'string'
    && value.length <= (name === 'null_marker' ? 256 : 1) && !/[\x00\r\n]/.test(value), 'Invalid format value: ' + name);
  requireValue(p.format.delimiter.length === 1 && ['.', ','].includes(p.format.decimal_separator), 'Explicit delimiters are required');
  requireValue(Array.isArray(p.columns) && p.columns.length >= 1 && p.columns.length <= maxColumns,
    maxColumns===8?'The current reader supports 1–8 fully visible configured columns':'Delimited import supports 1–1000 explicitly configured columns');
  requireValue(new Set(p.columns.map(c => c?.name)).size === p.columns.length, 'Duplicate column names');
  for (const c of p.columns) {
    requireValue(c && ['data_kind,label,name,type,used',...(maxColumns!==8?['data_kind,label,name,source_name,type,used']:[])].includes(Object.keys(c).sort().join(',')), 'Column parameters are incomplete');
    for (const key of ['name', 'label']) requireValue(typeof c[key] === 'string' && c[key].length > 0 && c[key].length <= 120 && !/[\x00-\x1f]/.test(c[key]), 'Invalid column ' + key);
    // Loginom normalizes non-ASCII names on the next wizard page, after the
    // editor readback. Reject before graph mutation; source labels stay Unicode.
    requireValue(/^[A-Za-z_][A-Za-z0-9_]*$/.test(c.name),
      'Invalid parameters.parameters.settings.columns.name: technical name must use ASCII letters, digits and underscore; keep the original CSV header in source_name and the Russian display title in label');
    if(c.source_name!==undefined)requireValue(typeof c.source_name==='string' && c.source_name.length>0 && c.source_name.length<=120
      && !/[\x00-\x1f]/.test(c.source_name),'Invalid explicit source or renamed field');
    requireValue(Object.hasOwn(types, c.type) && kinds.includes(c.data_kind) && typeof c.used === 'boolean', 'Invalid column semantics');
  }
  if(maxColumns!==8)requireValue(new Set(p.columns.map(c=>c.source_name??c.name)).size===p.columns.length,'Duplicate source column names');
}
export const validateTextImportRequest=p=>validateSettings(p,8);
export const validateTextImportFieldsRequest=p=>{validateSettings(p,1000);resolveTextImportEncoding(p.source.encoding);};

export function validateTextImportPatch(p) {
  const object=value=>value && typeof value==='object' && !Array.isArray(value);
  requireValue(object(p) && Object.keys(p).every(k=>['source','format','columns'].includes(k)), 'Invalid import settings patch');
  const source={source_path:'/validation.csv',encoding:'UTF-8',rows_to_skip:0,first_line_as_title:true};
  const format={delimiter:';',decimal_separator:'.',null_marker:'?',text_qualifier:'"'};
  for(const [name,defaults] of Object.entries({source,format})) {
    if(!Object.hasOwn(p,name))continue;
    requireValue(object(p[name]) && Object.keys(p[name]).every(k=>Object.hasOwn(defaults,k)), 'Unknown import patch '+name);
    Object.assign(defaults,p[name]);
  }
  requireValue(!Object.hasOwn(p,'columns') || Array.isArray(p.columns)&&p.columns.length<=1000,'Invalid column patch list');
  const keys=new Set();
  for(const c of p.columns??[]) {
    requireValue(object(c) && Object.keys(c).every(k=>['source_name','name','label','type','data_kind','used'].includes(k)), 'Invalid column patch');
    const key=c.source_name??c.name;
    requireValue(typeof key==='string' && key.length>0 && !keys.has(key),'Missing or duplicate patch column identity');keys.add(key);
    validateTextImportFieldsRequest({source,format,columns:[{name:c.source_name===undefined?key:'Validation',label:key,type:'string',data_kind:'Дискретный',used:true,...c}]});
  }
  validateTextImportFieldsRequest({source,format,columns:[{name:'Validation',label:'Validation',type:'string',data_kind:'Дискретный',used:true}]});
}

export function mergeImportColumnPatch(fields,changes=[]) {
  validateTextImportPatch({columns:changes});
  requireValue(Array.isArray(fields)&&fields.length>0&&fields.length<=1000
    &&new Set(fields.map(c=>c.name)).size===fields.length,'A complete unique source schema is required');
  const result=fields.map(c=>Object.fromEntries(['name','label','type','data_kind','used'].map(k=>[k,c[k]])));
  for(const change of resolveImportSourceColumns(changes,fields)) {
    const key=change.source_name??change.name,index=fields.findIndex(c=>c.name===key);
    requireValue(index>=0,'Patch column is absent from the observed schema: '+key);
    result[index]={...result[index],...Object.fromEntries(Object.entries(change).filter(([k])=>k!=='source_name')),
      ...(change.name!==undefined&&change.name!==key?{source_name:key}:{})};
  }
  requireValue(new Set(result.map(c=>c.name)).size===result.length,'Column patch creates duplicate names');
  return result;
}

// A parser change can reorder, remove and introduce source fields. Match old
// settings by the observed name, never by their former ordinal position.
export function reconcileImportColumnPatch(before,parsed,changes=[],{schemaChangeRequested=false}={}) {
  validateTextImportPatch({columns:changes});
  mergeImportColumnPatch(before);mergeImportColumnPatch(parsed);
  const oldNames=before.map(c=>c.name),newNames=parsed.map(c=>c.name);
  requireValue(schemaChangeRequested||same(oldNames,newNames),'Source schema changed without requested parsing changes');
  changes=resolveImportSourceColumns(changes,parsed);
  const base=parsed.map(field=>{
    const previous=before.find(c=>c.name===field.name);
    if(previous)return previous;
    const change=changes.find(c=>(c.source_name??c.name)===field.name);
    requireValue(change&&['name','label','type','data_kind','used'].every(k=>Object.hasOwn(change,k)),
      'New source field requires explicit name, label, type, data kind and usage: '+field.name);
    return field;
  });
  return mergeImportColumnPatch(base,changes);
}

// The new phase ends at the configured format page. Mapping, finish and run
// belong to the enclosing node operation; no wizard reopen occurs here.
export const configureTextImportFields=(channel,parameters,owner)=>configureImport(channel,parameters,owner,true);
export const configureTextImportPatch=(channel,parameters,owner,verifiedSourcePath)=>configureImport(channel,parameters,owner,true,{verifiedSourcePath});
export const configureTextImportDraft=(channel,parameters,owner)=>configureImport(channel,parameters,owner,false);

export function bindImportSourceColumns(requested,observed) {
  requireValue(requested.length===observed.length&&new Set(observed.map(c=>c.name)).size===observed.length
    &&new Set(requested.map(c=>c.source_name??c.name)).size===requested.length,
    'Every parsed source field requires one unique settings reference');
  requireValue(observed.every((column,index)=>column.status==='observed'&&column.index===index),
    'Parsed source field identity is incomplete');
  const bound=resolveImportSourceColumns(requested,observed);
  return observed.map(column=>one(bound.filter(c=>(c.source_name??c.name)===column.name),
    'Requested source field is missing or ambiguous'));
}

export class ImportColumnBindingError extends Error {
  constructor(key,candidates,observed) {
    super('Requested source field is missing or ambiguous: '+JSON.stringify(key)
      +'; observed name/label: '+JSON.stringify((candidates.length?candidates:observed).slice(0,8).map(({name,label})=>({name,label}))));
    this.name='ImportColumnBindingError';
  }
}

function resolveImportSourceColumns(requested,observed) {
  const bound=requested.map(column=>{
    const key=column.source_name??column.name;
    const candidates=observed.filter(field=>field.name===key||field.label===key);
    if(candidates.length!==1)throw new ImportColumnBindingError(key,candidates,observed);
    // Later editor checks need the observed technical identity, not a guessed
    // transliteration or the original human-readable CSV heading.
    return {...structuredClone(column),...(key!==candidates[0].name?{source_name:candidates[0].name}:{})};
  });
  requireValue(new Set(bound.map(c=>c.source_name??c.name)).size===bound.length,
    'Multiple settings references resolve to the same parsed source field');
  return bound;
}

// Reuse the shared pre-gesture recovery: only an unchanged, fully bound cell
// may receive a refreshed ref after a proven no-effect epoch refusal.
export async function openImportColumnEditor(channel,initial,index,property) {
  requireValue(['type','data_kind'].includes(property),'Unsupported import editor property');
  const describe=state=>{
    const w=state.wizard,field=w?.import_columns?.fields?.find(f=>f.index===index);
    requireValue(w?.stage==='text_import_format'&&w.owner_context?.status==='observed'
      &&w.owner_context.node?.tid&&w.owner_context.path?.length&&field?.status==='observed','Import editor owner unobserved');
    const cell=one(state.ui.elements.filter(e=>e.ref===field.cell_refs?.[property]),'Import editor cell changed');
    requireValue(cell.tid&&cell.allowed_actions?.includes('double_click'),'Import editor action unavailable');
    return {root:w.root_tid,owner:{node:w.owner_context.node.tid,path:w.owner_context.path.map(({tid,label})=>({tid,label}))},
      field:Object.fromEntries(['index','name','label','type','data_kind','used'].map(k=>[k,field[k]])),
      page:w.import_columns.page??w.import_columns.definition_coverage,property,cell_tid:cell.tid};
  };
  const expected=describe(initial);
  return channel.perform({condition:'open bound import column '+index+'/'+property,initialObservation:initial,
    ready:state=>same(describe(state),expected),identity:describe,
    resolve:state=>({verb:'double_click',ref:state.wizard.import_columns.fields.find(f=>f.index===index).cell_refs[property]})});
}

// A menu choice is bound to the same live editor, not merely its option label.
export async function selectImportColumnOption(channel,initial,index,property,label) {
  requireValue(['type','data_kind'].includes(property),'Unsupported import option property');
  const option=state=>{
    const w=state.wizard,e=w?.import_column_editor;
    requireValue(w?.stage==='text_import_format'&&w.owner_context?.status==='observed'
      &&w.owner_context.node?.tid&&w.owner_context.path?.length&&e?.status==='observed'
      &&e.index===index&&e.property===property&&e.owner_ref&&e.input_ref&&w.root_ref,'Import option editor changed');
    return one(state.ui.elements.filter(item=>item.allowed_actions?.includes('select_wizard_option')
      &&item.wizard_combo?.kind==='option'&&item.wizard_combo.label===label
      &&item.wizard_combo.field?.scope==='import_column'&&item.wizard_combo.field.name===property
      &&item.wizard_combo.field.owner_ref===e.owner_ref&&item.wizard_combo.field.input_ref===e.input_ref
      &&item.wizard_combo.field.root_ref===w.root_ref),'Bound import option is absent or ambiguous');
  };
  const describe=state=>{
    const w=state.wizard,e=w.import_column_editor;
    return {root:w.root_tid,owner:{node:w.owner_context.node.tid,path:w.owner_context.path.map(({tid,label})=>({tid,label}))},
      editor:Object.fromEntries(['index','name','label','property','canonical_value','used','other_property','other_value'].map(k=>[k,e[k]])),
      option:option(state).tid,label};
  };
  option(initial);const expected=describe(initial);
  return channel.perform({condition:'select bound import option '+index+'/'+property,initialObservation:initial,
    ready:state=>{option(state);return same(describe(state),expected);},identity:describe,
    resolve:state=>({verb:'select_wizard_option',ref:option(state).ref})});
}

async function configureImport(channel, parameters, owner,fieldsOnly,patch) {
  (patch?validateTextImportPatch:fieldsOnly?validateTextImportFieldsRequest:validateTextImportRequest)(parameters);
  parameters=structuredClone(parameters);
  if(patch)parameters={source:parameters.source??{},format:parameters.format??{},columns:parameters.columns??[]};
  requireValue(owner?.status === 'observed' && owner.node?.tid && owner.path?.length, 'An observed wizard owner is required');
  let currentOwner = owner;
  let columnOffset=0;
  const identity = c => ({ node: c?.node?.tid, path: c?.path?.map(x => ({ tid: x.tid, label: x.label })) });
  const read = async (stage, condition = 'stage controls ready', ready = () => true) => {
    const s = await channel.observe({ condition: stage + ': ' + condition,
      ...(fieldsOnly&&stage==='text_import_format'?{importColumnPage:{offset:columnOffset,limit:8}}:{}),ready: state => {
      const w = state.wizard;
      if (w?.status === 'observed' && !same(identity(w.owner_context), identity(currentOwner))) {
        throw new Error('Text import wizard owner changed');
      }
      if (w?.status !== 'observed' || w.stage !== stage) return false;
      const fields = stage === 'text_import_file' ? w.import_source?.fields
        : stage === 'text_import_format' ? w.settings?.fields : null;
      const names = stage === 'text_import_file' ? Object.keys(parameters.source)
        : stage === 'text_import_format' ? Object.keys(parameters.format) : [];
      if (!names.every(name => fields?.[name]?.status === 'observed' && fields[name].truncated !== true)) return false;
      if (stage === 'output_mapping' && w.output_columns?.definition_coverage?.status !== 'complete_configured_rows') return false;
      if (stage === 'done' && state.ui.elements.filter(e => e.tid === w.root_tid + ';btnDone'
        && e.allowed_actions?.includes('finish_wizard')).length !== 1) return false;
      return ready(state);
    } });
    requireValue(s.wizard?.status === 'observed' && s.wizard.stage === stage
      && same(identity(s.wizard.owner_context), identity(currentOwner)), 'Text import wizard stage or owner changed');
    return s;
  };
  const act = (s, action) => channel.act(action);
  const field = (s, name, source = false) => {
    const f = (source ? s.wizard.import_source?.fields : s.wizard.settings?.fields)?.[name];
    requireValue(f?.status === 'observed' && f.truncated !== true, 'Field is not completely observed: ' + name);
    return f;
  };
  const control = (s, suffix, verb) => one(s.ui.elements.filter(e => e.tid === s.wizard.root_tid + ';' + suffix
    && e.allowed_actions?.includes(verb)), 'Wizard control is absent or ambiguous: ' + suffix).ref;
  const next = async (from, to) => {
    const s = await read(from, 'Next control available', state => state.ui.elements.filter(e =>
      e.tid === state.wizard.root_tid + ';btnNext' && e.allowed_actions?.includes('wizard_step')).length === 1);
    await act(s, { verb: 'wizard_step', ref: control(s, 'btnNext', 'wizard_step'), expected_stage: to });
    return read(to);
  };
  // Source and format are caller decisions. No automatic type detection result
  // is treated as confirmation of the requested schema.
  const sourceBaseline=patch?(await read('text_import_file','existing source initialized',isTextImportSourceReady)).wizard.import_source:null;
  // A discarded first configuration leaves a graph node with no source. There
  // is no retained schema to inspect until complete source settings are applied.
  if(patch&&sourceBaseline.fields.source_path.value==='') {
    validateTextImportFieldsRequest(parameters);
    requireValue(parameters.source.source_path===patch.verifiedSourcePath,'Existing source does not match the verified upload');
    return configureImport(channel,parameters,owner,true);
  }
  if(patch && parameters.source.source_path===undefined)requireValue(sourceBaseline.fields.source_path.value===patch.verifiedSourcePath,'Existing source does not match the verified upload');
  let formatBaseline,columnBaseline;
  const capturePatchSchema=async()=>{
    await read('text_import_format','existing file parsing completed',state=>
      state.wizard.import_columns?.initial_layout?.status==='rendered_definition_layout');
    formatBaseline=(await read('text_import_format')).wizard.settings;
    columnBaseline=await readImportDefinitionPages(channel,{ready:state=>same(identity(state.wizard?.owner_context),identity(currentOwner))});
  };
  // Read the existing schema before changing parsing options: Loginom may
  // regenerate definitions when the source, header or delimiter changes.
  if(patch&&Object.keys(parameters.source).length) {
    await next('text_import_file','text_import_format');
    await capturePatchSchema();
    const s=await read('text_import_format','Previous control available',state=>state.ui.elements.some(e=>
      e.tid===state.wizard.root_tid+';btnPrev'&&e.allowed_actions.includes('wizard_step')));
    await act(s,{verb:'wizard_step',ref:control(s,'btnPrev','wizard_step'),expected_stage:'text_import_file'});
    await read('text_import_file','existing source returned',isTextImportSourceReady);
  }

  for (const name of ['source_path', 'encoding', 'rows_to_skip', 'first_line_as_title']) {
    if(patch&&!Object.hasOwn(parameters.source,name))continue;
    let s = await read('text_import_file'), f = field(s, name, true);
    const encoding = fieldsOnly && name==='encoding' ? resolveTextImportEncoding(parameters.source.encoding):null;
    const desired = encoding ? encoding.label : name === 'rows_to_skip' ? String(parameters.source[name]) : parameters.source[name];
    if (f.value === desired) continue;
    if(encoding) {
      const picker=one(s.ui.elements.filter(e=>e.wizard_combo?.kind==='picker'&&e.wizard_combo.field.scope==='import_source'
        &&e.wizard_combo.field.name==='encoding'&&e.wizard_combo.field.owner_ref===f.owner_ref),'Code page picker unavailable');
      await act(s,{verb:'click',ref:picker.ref});
      s=await read('text_import_file','code page option visible',state=>state.ui.elements.filter(e=>e.wizard_combo?.kind==='option'
        &&e.wizard_combo.field.scope==='import_source'&&e.wizard_combo.field.name==='encoding'&&e.wizard_combo.label===encoding.label).length===1);
      const option=one(s.ui.elements.filter(e=>e.wizard_combo?.kind==='option'&&e.wizard_combo.field.scope==='import_source'
        &&e.wizard_combo.field.name==='encoding'&&e.wizard_combo.label===encoding.label),'Exact code page option unavailable');
      await act(s,{verb:'select_wizard_option',ref:option.ref});
    } else if (name === 'first_line_as_title') await act(s, { verb: 'set_checked', ref: f.display_ref, checked: desired });
    else {
      await act(s, { verb: 'fill', ref: f.input_ref, text: desired });
      s = await read('text_import_file'); f = field(s, name, true);
      await act(s, { verb: 'press', ref: f.input_ref, key: 'Tab' });
    }
    s = await read('text_import_file', 'source value applied: ' + name, state =>
      state.wizard.import_source.fields[name]?.value === desired);
    requireValue(field(s, name, true).value === desired, 'Source value was not applied: ' + name);
  }
  const sourceReadback = (await read('text_import_file')).wizard.import_source;
  const sourcePathChanged=patch&&sourceBaseline.fields.source_path.value!==sourceReadback.fields.source_path.value;
  if(patch)requireValue(Object.keys(sourceBaseline.fields).filter(k=>!Object.hasOwn(parameters.source,k))
    .every(k=>sourceReadback.fields[k]?.value===sourceBaseline.fields[k].value),'Unrequested source parameter changed');
  await next('text_import_file', 'text_import_format');
  if(fieldsOnly)await read('text_import_format','initial file parsing completed',state=>
    state.wizard.import_columns?.initial_layout?.status==='rendered_definition_layout');
  if(patch&&!columnBaseline)await capturePatchSchema();
  for (const [name, text] of Object.entries(parameters.format)) {
    let s = await read('text_import_format'); const f = field(s, name);
    if (f.value === text) continue;
    // Native editable combo resolves typed NULL to the first case-insensitive
    // match (null) on blur. Select the exact observed built-in, never retype it.
    if (name === 'null_marker' && ['null', 'NULL'].includes(text)) {
      const rootRef = s.wizard.root_ref;
      const owns = e => e.wizard_combo?.field && (e.wizard_combo.field.scope ?? 'import_format') === 'import_format'
        && e.wizard_combo.field.name === name && e.wizard_combo.field.owner_ref === f.owner_ref
        && e.wizard_combo.field.root_ref === rootRef;
      const picker = one(s.ui.elements.filter(e => owns(e) && e.wizard_combo.kind === 'picker'),
        'Exact Null marker picker unavailable');
      await act(s, {verb:'click', ref:picker.ref});
      s = await read('text_import_format', 'exact Null marker option visible', state =>
        state.ui.elements.filter(e => owns(e) && e.wizard_combo.kind === 'option' && e.wizard_combo.label === text).length === 1);
      const option = one(s.ui.elements.filter(e => owns(e) && e.wizard_combo.kind === 'option' && e.wizard_combo.label === text),
        'Exact Null marker option unavailable');
      await act(s, {verb:'select_wizard_option', ref:option.ref});
      const after = field(await read('text_import_format', 'exact Null marker applied', state =>
        state.wizard.settings.fields[name]?.value === text), name);
      requireValue(after.value === text && after.owner_ref === f.owner_ref && after.input_ref === f.input_ref,
        'Null marker field or case changed after selection');
    } else await act(s, { verb: 'set_wizard_field', ref: f.input_ref, text });
  }
  let parsedColumns;
  if(patch) {
    const after=(await read('text_import_format')).wizard.settings;
    requireValue(Object.keys(formatBaseline.fields).filter(k=>!Object.hasOwn(parameters.format,k))
      .every(k=>after.fields[k]?.value===formatBaseline.fields[k].value),'Unrequested format parameter changed');
    if(sourcePathChanged) {
      // With automatic columns disabled, changing the file keeps the old
      // configured definitions. Refresh only this explicitly replaced source;
      // reconcile below restores retained settings by name, not old position.
      // Loginom Help / import/txt and E2E sColumnDefsTuning.toolbar.RefreshAll.
      const suffix='ImportTextFileParamsWizard;ColumnDefsTuning;btnRefreshAll';
      const before=await read('text_import_format','replacement source definitions refresh available',state=>
        state.ui.elements.filter(e=>e.tid===state.wizard.root_tid+';'+suffix&&e.allowed_actions?.includes('click')).length===1);
      await act(before,{verb:'click',ref:control(before,suffix,'click')});
      const refreshed=await read('text_import_format','replacement source definitions refreshed',state=>
        state.wizard.import_columns?.initial_layout?.status==='rendered_definition_layout');
      requireValue(Object.keys(before.wizard.settings.fields).every(k=>
        refreshed.wizard.settings.fields[k]?.status==='observed'&&refreshed.wizard.settings.fields[k].truncated!==true
        &&refreshed.wizard.settings.fields[k].value===before.wizard.settings.fields[k].value),
        'Source schema refresh changed parsing settings');
    }
    const parsedSchema=await readImportDefinitionPages(channel,{ready:state=>same(identity(state.wizard?.owner_context),identity(currentOwner))});
    parsedColumns=parsedSchema.fields;
    parameters.columns=reconcileImportColumnPatch(columnBaseline.fields,parsedSchema.fields,parameters.columns,{schemaChangeRequested:
      Object.keys(parameters.source).length>0||Object.keys(parameters.format).length>0});
  } else if(fieldsOnly) {
    const parsed=await readImportDefinitionPages(channel,{expectedCount:parameters.columns.length,
      ready:state=>same(identity(state.wizard?.owner_context),identity(currentOwner))});
    parsedColumns=parsed.fields;
    parameters.columns=bindImportSourceColumns(parameters.columns,parsed.fields);
  }
  const columns = s => {
    const c = s.wizard.import_columns;
    if(fieldsOnly){
      requireValue(c?.page?.status==='complete_definition_page'&&c.page.total_columns===parameters.columns.length
        &&c.page.offset===columnOffset&&c.fields.every((f,i)=>f.status==='observed'&&f.index===columnOffset+i),
      'Configured import definition page is incomplete');
      return c.fields;
    }
    requireValue(c?.definition_coverage?.status === 'complete_configured_columns' && c.truncated === false
      && c.fields?.length === parameters.columns.length && c.definition_coverage.count === c.fields.length
      && c.fields.every((f, i) => f.status === 'observed' && f.index === i), 'Configured columns are not completely visible');
    return c.fields;
  };
  const scrollField=async(s,c,scroller,delta)=>{
    const describe=state=>{
      const field=state.wizard?.import_columns?.fields?.find(f=>f.index===c.index);
      const owner=one(state.ui.elements.filter(e=>e.tid===scroller.tid&&e.allowed_actions.includes('scroll_horizontal')),
        'Import field scroll owner changed');
      requireValue(state.wizard?.stage==='text_import_format'&&field?.status==='observed'
        &&owner.horizontal_scroll?.ref===owner.ref,'Import field scroll binding is incomplete');
      return {owner:identity(state.wizard.owner_context),field:Object.fromEntries(['index','name','label','type','data_kind','used'].map(k=>[k,field[k]])),
        page:state.wizard.import_columns.page,
        scroll:{tid:owner.tid,left:owner.horizontal_scroll.left,max_left:owner.horizontal_scroll.max_left}};
    };
    const expected=describe(s);
    await channel.perform({condition:'reveal bound import field '+c.index,initialObservation:s,
      ready:state=>same(describe(state),expected),identity:describe,
      resolve:state=>({verb:'scroll_horizontal',ref:one(state.ui.elements.filter(e=>e.tid===scroller.tid),'Unique import scroller required').ref,delta_x:delta})});
  };
  for (let i = 0; i < parameters.columns.length; i++) {
    columnOffset=fieldsOnly?Math.floor(i/8)*8:0;
    // A complete initial page sweep already read these values. A no-op column
    // needs no five extra browser reads. Every edit still starts with fresh refs,
    // and the final complete sweep verifies all fields, including skipped ones.
    if(fieldsOnly&&['name','label','type','data_kind','used'].every(k=>parsedColumns[i][k]===parameters.columns[i][k]))continue;
    for (const property of ['type', 'data_kind']) {
      const definitionReady=state=>fieldsOnly?state.wizard.import_columns?.page?.status==='complete_definition_page'
        :state.wizard.import_columns?.definition_coverage?.status==='complete_configured_columns'
          &&state.wizard.import_columns?.fields?.length===parameters.columns.length;
      let s = await read('text_import_format', 'complete configured columns', definitionReady), c = columns(s).find(f=>f.index===i);
      const desired=parameters.columns[i];
      const wanted=fieldsOnly?{...desired,name:desired.source_name??desired.name,label:c.label,used:c.used}:desired;
      requireValue(c.name === wanted.name && c.label === wanted.label && c.used === wanted.used,
        'Column names, labels or selection differ; this candidate only changes type and data kind');
      if (c[property] === wanted[property]) continue;
      if(fieldsOnly) {
        // Scroll only through Loginom's observed shared preview scroller.
        // Each bounded move gets a fresh page before selecting a field.
        for(let moves=0;moves<200;moves++) {
          const target=s.ui.elements.find(e=>e.ref===c.cell_refs[property]);
          if(importFieldHasCompleteLayout(s,target))break;
          const scroller=one(s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';ImportTextFileParamsWizard;ColumnDefsTuning;grdData;grd-1;tbl'
            &&e.allowed_actions.includes('scroll_horizontal')),'Import field has no observed horizontal scroller');
          const delta=importFieldRevealDelta(target,scroller);
          if(delta===0){requireValue(target?.interaction?.state==='point_observed','Import field is covered');break;}
          await scrollField(s,c,scroller,delta);
          s=await read('text_import_format','requested column revealed',definitionReady);c=columns(s).find(f=>f.index===i);
          requireValue(c.name===wanted.name&&c.label===wanted.label&&c.used===wanted.used,'Import field changed while scrolling');
        }
        requireValue(s.ui.elements.find(e=>e.ref===c.cell_refs[property])?.interaction?.state==='point_observed','Import column reveal budget exceeded');
      }
      await openImportColumnEditor(channel,s,i,property);
      const editing = await read('text_import_format', 'column editor: ' + i + '/' + property, state => {
        const e = state.wizard.import_column_editor;
        return e?.status === 'observed' && e.index === i && e.property === property
          && e.name === wanted.name && e.picker_status === 'observed'
          && state.ui.elements.some(item=>item.ref===e.picker_ref&&item.allowed_actions?.includes('click'));
      });
      let editor = editing.wizard.import_column_editor;
      requireValue(editor?.status === 'observed' && editor.index === i && editor.property === property
        && editor.name === wanted.name && editor.picker_status === 'observed', 'Column editor binding is incomplete');
      const picker = await channel.perform({ condition: 'same import column picker: ' + i + '/' + property,
        initialObservation: editing,
        ready: state => state.wizard?.stage === 'text_import_format'
          && state.wizard.import_column_editor?.status === 'observed'
          && state.wizard.import_column_editor.index === i
          && state.wizard.import_column_editor.name === wanted.name
          && state.wizard.import_column_editor.property === property
          && state.wizard.import_column_editor.picker_status === 'observed',
        identity: state => {
          const e=state.wizard.import_column_editor;
          return {owner:identity(state.wizard.owner_context),index:e.index,name:e.name,label:e.label,
            property:e.property,value:e.canonical_value,used:e.used,other_property:e.other_property,other_value:e.other_value};
        },
        resolve: state => ({verb:'click',ref:state.wizard.import_column_editor.picker_ref}),
      });
      editor = picker.output.wizard?.import_column_editor;
      requireValue(editor?.status === 'observed' && editor.index === i && editor.name === wanted.name
        && editor.property === property, 'Opened picker lost its column binding');
      const label = property === 'type' ? types[wanted.type] : wanted.data_kind;
      const choosing = await read('text_import_format', 'column option: ' + i + '/' + property, state =>
        state.ui.elements.filter(e => e.allowed_actions?.includes('select_wizard_option')
          && e.wizard_combo?.kind === 'option' && e.wizard_combo.label === label
          && e.wizard_combo.field?.owner_ref === editor.owner_ref
          && e.wizard_combo.field?.name === property).length === 1);
      await selectImportColumnOption(channel,choosing,i,property,label);
      requireValue(columns(await read('text_import_format', 'column value applied: ' + i + '/' + property, state =>
        state.wizard.import_columns?.fields?.find(f=>f.index===i)?.[property] === wanted[property])).find(f=>f.index===i)[property] === wanted[property], 'Column readback differs');
    }
    if(fieldsOnly)for(const property of ['name','label','used']) {
      const wanted=parameters.columns[i];
      const ready=s=>s.wizard.import_columns?.page?.status==='complete_definition_page';
      let s=await read('text_import_format','field metadata ready',ready),c=columns(s).find(f=>f.index===i);
      if(c[property]===wanted[property])continue;
      const before={name:c.name,label:c.label,type:c.type,data_kind:c.data_kind,used:c.used};
      const associated=c.label_associated===true;
      for(let moves=0;moves<200;moves++) {
        const target=s.ui.elements.find(e=>e.ref===c.cell_refs[property]);
        if(importFieldHasCompleteLayout(s,target))break;
        const scroller=one(s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';ImportTextFileParamsWizard;ColumnDefsTuning;grdData;grd-1;tbl'
          &&e.allowed_actions.includes('scroll_horizontal')),'Import field has no observed horizontal scroller');
        const delta=importFieldRevealDelta(target,scroller);
        if(delta===0){requireValue(target?.interaction?.state==='point_observed','Import metadata cell is covered');break;}
        await scrollField(s,c,scroller,delta);
        s=await read('text_import_format','metadata cell revealed',ready);c=columns(s).find(f=>f.index===i);
        requireValue(Object.keys(before).every(k=>c[k]===before[k]),'Import metadata changed while scrolling');
      }
      requireValue(s.ui.elements.find(e=>e.ref===c.cell_refs[property])?.interaction?.state==='point_observed','Import metadata reveal budget exceeded');
      await act(s,{verb:'click',ref:c.cell_refs[property]});
      if(property!=='used') {
        const editorReady=state=>{const e=state.wizard.import_column_editor;return e?.status==='observed' && e.index===i
          && e.property===property && e.name===before.name
          && (e.label===before.label || property==='name' && associated && e.label_associated===true && e.label===e.value)
          && e.type===before.type && e.data_kind===before.data_kind && e.used===before.used && e.original_value===before[property];};
        s=await read('text_import_format','bound metadata text editor',editorReady);
        await act(s,{verb:'fill',ref:s.wizard.import_column_editor.input_ref,text:wanted[property]});
        s=await read('text_import_format','metadata draft text entered',state=>editorReady(state)
          && state.wizard.import_column_editor.value===wanted[property]);
        // A native editor may update DOM attributes after typing. Refresh only
        // a proved pre-gesture refusal, keeping the same owner and draft value.
        await channel.perform({condition:'commit bound import metadata: '+i+'/'+property,initialObservation:s,
          ready:state=>state.wizard?.stage==='text_import_format'&&editorReady(state)
            &&state.wizard.import_column_editor.value===wanted[property],
          identity:state=>{
            const e=state.wizard.import_column_editor;
            return {owner:identity(state.wizard.owner_context),index:e.index,name:e.name,label:e.label,
              property:e.property,value:e.value,original_value:e.original_value,type:e.type,data_kind:e.data_kind,used:e.used};
          },
          resolve:state=>({verb:'press',ref:state.wizard.import_column_editor.input_ref,key:'Enter'})});
      }
      s=await read('text_import_format','metadata cell committed',state=>ready(state)
        && state.wizard.import_columns.fields.find(f=>f.index===i)?.[property]===wanted[property]);
      c=columns(s).find(f=>f.index===i);
      requireValue(c.type===before.type && c.data_kind===before.data_kind
        && (property==='used'||c.used===before.used) && (property==='name'||c.name===before.name)
        && (property==='name'||property==='label'||c.label===before.label),'Metadata editing changed another column property');
    }
  }
  const formatted = await read('text_import_format');
  if(patch)requireValue(Object.keys(formatBaseline.fields).filter(k=>!Object.hasOwn(parameters.format,k))
    .every(k=>formatted.wizard.settings?.fields[k]?.status==='observed'
      &&formatted.wizard.settings.fields[k].truncated!==true
      &&formatted.wizard.settings.fields[k].value===formatBaseline.fields[k].value),
    'Unrequested format parameter changed during column configuration');
  const schemaReadback = columns(formatted);
  if(fieldsOnly) {
    const schema=await readImportDefinitionPages(channel,{expectedCount:parameters.columns.length,
      ready:state=>same(identity(state.wizard?.owner_context),identity(currentOwner))});
    requireValue(schema.fields.every((c,i)=>['name','label','type','data_kind','used'].every(k=>c[k]===parameters.columns[i][k])),
      'Configured import definitions differ');
    return {verified:true,cleanup_complete:true,effect_possible:true,source:sourceReadback,
      format:formatted.wizard.settings,columns:schema.fields,schema_id:schema.schema_id,
      ...(patch?{preservation:{source_before:sourceBaseline,format_before:formatBaseline,columns_before:columnBaseline.fields,source_schema_refreshed:sourcePathChanged}}:{}),
      settings_applied:false,reopen_performed:false,next_stage:'output_mapping',package_saved:false,execution_started:false};
  }
  const mapping = await next('text_import_format', 'output_mapping');
  const output = mapping.wizard.output_columns;
  requireValue(output?.definition_coverage?.status === 'complete_configured_rows'
    && output.definition_coverage.count === parameters.columns.length && output.fields?.length === parameters.columns.length
    && output.fields.every((c, i) => c.status === 'observed' && c.name === parameters.columns[i].name
      && c.label === parameters.columns[i].label && c.type === parameters.columns[i].type
      && c.data_kind === parameters.columns[i].data_kind && c.source?.status === 'rendered_source'
      && c.source.label === parameters.columns[i].label && c.source.type === parameters.columns[i].type),
  'Output mapping does not match the complete requested schema');
  const done = await next('output_mapping', 'done');
  const finished = await act(done, { verb: 'finish_wizard', ref: control(done, 'btnDone', 'finish_wizard') });
  const receipt = one(finished.trace.filter(e => e.event === 'wizard_finish_graph_verified'), 'Wizard finish graph receipt is missing');
  const nodeLabel = receipt.node?.node_label;
  requireValue(typeof nodeLabel === 'string' && nodeLabel.length > 0, 'Finished node identity is absent');
  let graph = await channel.observe({ condition: 'saved node incarnation stable after Done', confirmIdentity: state => state.ui.elements.filter(e =>
    e.graph_node?.node_label === nodeLabel && e.graph_node.part === 'body').map(e => e.ref), ready: state =>
    state.wizard?.status === 'absent' && state.ui.elements.filter(e => e.graph_node?.node_label === nodeLabel
      && e.graph_node.part === 'body' && e.allowed_actions?.includes('click')).length === 1 });
  requireValue(graph.wizard?.status === 'absent', 'Wizard is still open after Done');
  const body = one(graph.ui.elements.filter(e => e.graph_node?.node_label === nodeLabel
    && e.graph_node.part === 'body' && e.allowed_actions?.includes('click')), 'Finished graph node is ambiguous');
  await channel.act({ verb: 'click', ref: body.ref });
  graph = await channel.observe({ condition: 'saved node settings available', ready: state =>
    state.wizard?.status === 'absent' && state.ui.elements.filter(e => e.wizard_open?.node?.node_label === nodeLabel
      && e.allowed_actions?.includes('open_wizard')).length === 1 });
  const settings = one(graph.ui.elements.filter(e => e.wizard_open?.node?.node_label === nodeLabel
    && e.allowed_actions?.includes('open_wizard')), 'Finished node settings control is absent');
  const opened = await channel.act({ verb: 'open_wizard', ref: settings.ref });
  const reopenedOwner = opened.output.wizard?.owner_context;
  requireValue(reopenedOwner?.status === 'observed'
    && reopenedOwner.node.tid === owner.path.at(-3).tid + '>' + nodeLabel
    && same(reopenedOwner.path.slice(0, -2).map(x => ({ tid: x.tid, label: x.label })),
      owner.path.slice(0, -2).map(x => ({ tid: x.tid, label: x.label }))), 'Reopened wizard belongs to a different node');
  currentOwner = reopenedOwner;
  const reopenedSource = await read('text_import_file');
  for (const [name, desired] of Object.entries(parameters.source)) requireValue(
    field(reopenedSource, name, true).value === (name === 'rows_to_skip' ? String(desired) : desired),
    'Saved source differs after reopening: ' + name);
  const reopenedFormat = await next('text_import_file', 'text_import_format');
  const displayValues = {
    delimiter: { ';': 'Точка с запятой', ',': 'Запятая', '\t': 'Символ табуляции', ' ': 'Пробел' },
    text_qualifier: { '"': 'Двойная кавычка (")', "'": "Одинарная кавычка (')", '`': 'Обратная кавычка (`)', '': 'Нет' },
    decimal_separator: { '.': 'Точка (.)', ',': 'Запятая (,)' },
  };
  for (const [name, desired] of Object.entries(parameters.format)) {
    const actual = field(reopenedFormat, name).value;
    requireValue(actual === desired || actual === displayValues[name]?.[desired], 'Saved format differs after reopening: ' + name);
  }
  requireValue(columns(reopenedFormat).every((c, i) => Object.keys(parameters.columns[i]).every(k => c[k] === parameters.columns[i][k])),
    'Saved columns differ after reopening');
  const reopenedMapping = await next('text_import_format', 'output_mapping');
  const projection = c => ({ name: c.name, label: c.label, type: c.type, data_kind: c.data_kind, usage: c.usage,
    source: { status: c.source?.status, label: c.source?.label, type: c.source?.type } });
  const actualOutput = reopenedMapping.wizard.output_columns;
  requireValue(actualOutput?.definition_coverage?.status === 'complete_configured_rows'
    && actualOutput.definition_coverage.count === output.fields.length
    && same(actualOutput.fields.map(projection), output.fields.map(projection))
    && actualOutput.auto_sync?.status === 'observed' && output.auto_sync?.status === 'observed'
    && actualOutput.auto_sync.value === output.auto_sync.value, 'Saved output mapping differs after reopening');
  const readbackDone = await next('output_mapping', 'done');
  await channel.act({ verb: 'finish_wizard', ref: control(readbackDone, 'btnDone', 'finish_wizard') });
  return { source: sourceReadback, format: formatted.wizard.settings, columns: schemaReadback,
    output_columns: output, settings_readback_verified: true, reopen_required: false, node_label: nodeLabel,
    package_saved: false, execution_started: false };
}
