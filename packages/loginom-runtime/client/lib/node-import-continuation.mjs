import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';

export function verifyConfiguredImportContinuation({node,configured,source,format,schema}) {
  const sameNode=n=>n?.verified===true&&n.surface==='wizard'
    &&['document_id','workflow_id','node_id'].every(k=>node?.[k]&&n[k]===node[k]);
  if(!sameNode(source?.node_context)||!sameNode(format?.prepared_node_context)||source.verified!==true
    ||format.wizard?.stage!=='text_import_format'||format.wizard.column_parameters||!schema?.definition_complete
    ||schema.schema_id!==configured.schema_id||schema.fields?.length!==configured.columns?.length)return false;
  if(!['source_path','connection','encoding','rows_to_skip','first_line_as_title'].every(k=>
    configured.source?.fields?.[k]?.status==='observed'&&!configured.source.fields[k].truncated
      &&source.values?.[k]===configured.source.fields[k].value))return false;
  if(!Object.entries(configured.format?.fields??{}).every(([k,v])=>v.status==='observed'&&!v.truncated
    &&format.wizard.settings?.fields?.[k]?.status==='observed'&&!format.wizard.settings.fields[k].truncated
    &&format.wizard.settings.fields[k].value===v.value))return false;
  return schema.fields.every((f,i)=>f.status==='observed'&&['index','name','label','type','data_kind','used']
    .every(k=>f[k]===configured.columns[i][k]));
}

// Read retained controls in the SAME active wizard, without visiting its source
// page. These are cached draft values, never a claim about current server bytes.
export function readRetainedImportSourceBrowser({rootTid}) {
  const fail=reason=>({verified:false,reason});
  const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
  const roots=exact(rootTid);if(roots.length!==1)return fail('wizard_root');
  const root=roots[0],base=rootTid+';ImportTextFilePreviewWizard;';
  const values={};
  for(const [name,suffix] of Object.entries({source_path:'edtFileName;ValueControl',connection:'edtConnection',encoding:'edtCodePage;ValueControl',rows_to_skip:'edtRowsToSkip;ValueControl'})) {
    const owners=exact(base+suffix);
    const inputs=owners.length===1?[...owners[0].querySelectorAll('input:not([type="hidden"]):not([type="password"]),textarea')]:[];
    if(owners.length!==1||!root.contains(owners[0])||inputs.length!==1)return fail('source_control');
    const value=inputs[0].value;
    if(typeof value!=='string'||value.length>(name==='source_path'?2048:256)||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))return fail('source_value');
    if(name==='source_path'&&(!value.startsWith('/')||/[a-z][a-z0-9+.-]*:\/\//i.test(value)))return fail('source_path');
    values[name]=value;
  }
  const tid=base+'edtFirstLineAsTitle;ValueControl',owners=exact(tid),displays=exact(tid+';DisplayEl');
  if(owners.length!==1||!root.contains(owners[0])||displays.length!==1||!owners[0].contains(displays[0])||!displays[0].matches('.x-form-checkbox'))return fail('source_checkbox');
  values.first_line_as_title=owners[0].classList.contains('x-form-cb-checked');
  return {verified:true,values,source:'retained_wizard_controls',server_bytes_verified:false};
}

export async function readRetainedImportSource(page,binding,readNode=readPreparedNodeContext,readBrowser=readRetainedImportSourceBrowser) {
  const before=await readNode(page,binding);
  if(before.verified!==true||before.surface!=='wizard')return {verified:false,reason:'prepared_wizard'};
  const result=await page.evaluate(readBrowser,{rootTid:before.tid});
  const after=await readNode(page,binding);
  if(JSON.stringify(after)!==JSON.stringify(before))return {verified:false,reason:'wizard_changed'};
  return {...result,node_context:before};
}
export function makeRetainedImportSourceCode(binding) {
  validatePreparedNodeContext(binding);
  return `async page=>(${readRetainedImportSource.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readRetainedImportSourceBrowser.toString()})`;
}

export function readRetainedImportFormatBrowser({rootTid}) {
  const fail=reason=>({verified:false,reason});
  const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
  const roots=exact(rootTid);if(roots.length!==1)return fail('wizard_root');
  const root=roots[0],base=rootTid+';ImportTextFileParamsWizard;';
  const values={};
  for(const [key,suffix] of Object.entries({delimiter:'edtDelimiterChar',text_qualifier:'edtTextQualifier',null_marker:'edtValueNull',decimal_separator:'edtDecimalSeparator'})) {
    const owners=exact(base+suffix+';ValueControl'),inputs=owners.length===1?[...owners[0].querySelectorAll('input:not([type="hidden"]):not([type="password"]),textarea')]:[];
    if(owners.length!==1||!root.contains(owners[0])||inputs.length!==1)return fail('format_control');
    const value=inputs[0].value;if(typeof value!=='string'||value.length>256||/[\0\r\n]/.test(value))return fail('format_value');
    values[key]=value;
  }
  const gridTid=base+'ColumnDefsTuning;grdSettings;grd-1',grids=exact(gridTid),containers=exact(gridTid+';normalHeaderCt'),bodies=exact(gridTid+';tbl');
  if(grids.length!==1||containers.length!==1||bodies.length!==1||!root.contains(grids[0])||!grids[0].contains(containers[0])||!grids[0].contains(bodies[0]))return fail('definition_grid');
  const columnBase=gridTid+';normalHeaderCt;',headers=[...containers[0].querySelectorAll('.x-column-header')];
  if(!headers.length||headers.length>1000||!headers[0].classList.contains('x-column-header-first')||!headers.at(-1).classList.contains('x-column-header-last'))return fail('definition_headers');
  const types={'Целый':'integer','Вещественный':'real','Строковый':'string','Логический':'boolean','Дата/Время':'datetime','Переменный':'variant'};
  const fields=[];
  for(let index=0;index<headers.length;index++) {
    if(headers[index].getAttribute('data-tid')!==columnBase+index||exact(columnBase+index).length!==1)return fail('definition_order');
    const cells=[0,1,2,3,4].map(row=>exact(columnBase+index+'_'+row));
    if(cells.some(es=>es.length!==1||!bodies[0].contains(es[0])))return fail('definition_cells');
    const texts=cells.slice(0,4).map(es=>(es[0].textContent??'').trim()),checks=cells[4][0].querySelectorAll('.x-grid-checkcolumn');
    if(texts.some(t=>!t||t.length>120)||!types[texts[2]]||!['Неопределенное','Непрерывный','Дискретный'].includes(texts[3])||checks.length!==1)return fail('definition_values');
    fields.push({index,name:texts[0],label:texts[1],type:types[texts[2]],data_kind:texts[3],used:checks[0].classList.contains('x-grid-checkcolumn-checked')});
  }
  if([...grids[0].querySelectorAll('input')].some(e=>e.checkVisibility()))return fail('definition_editor');
  return {verified:true,source:'retained_import_format_controls',values,fields,definition_complete:true,settings_applied:false};
}
export function makeRetainedImportFormatCode(binding) {
  validatePreparedNodeContext(binding);
  return `async page=>(${readRetainedImportSource.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readRetainedImportFormatBrowser.toString()})`;
}

export function verifyMappedImportContinuation({node,configured,source,retained,surface,mapped}) {
  const sameNode=n=>n?.verified===true&&n.surface==='wizard'&&['document_id','workflow_id','node_id'].every(k=>node?.[k]&&n[k]===node[k]);
  if(![source?.node_context,retained?.node_context,surface?.prepared_node_context,surface?.node_mapping?.node_context].every(sameNode)
    ||source.verified!==true||retained.verified!==true||retained.definition_complete!==true||surface.wizard?.stage!=='done'
    ||!surface.wizard.completion?.ready||!mapped?.completion?.ready||surface.node_mapping?.verified!==true)return false;
  const sourceKeys=['source_path','connection','encoding','rows_to_skip','first_line_as_title'];
  if(!sourceKeys.every(k=>configured.source?.fields?.[k]?.status==='observed'&&!configured.source.fields[k].truncated
    &&source.values?.[k]===configured.source.fields[k].value))return false;
  if(!['delimiter','text_qualifier','null_marker','decimal_separator'].every(k=>configured.format?.fields?.[k]?.status==='observed'
    &&!configured.format.fields[k].truncated&&retained.values?.[k]===configured.format.fields[k].value))return false;
  const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
  const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
  const columns=fs=>fs?.map(f=>Object.fromEntries(['index','name','label','type','data_kind','used'].map(k=>[k,f[k]])));
  if(!same(columns(retained.fields),columns(configured.columns)))return false;
  const mapping=m=>Object.fromEntries(Object.entries(m??{}).filter(([k])=>k!=='rendered_indices'));
  if(!same(mapping(surface.node_mapping),mapping(mapped.native_mapping)))return false;
  const fields=surface.wizard.completion.fields,prior=mapped.completion.fields;
  return Object.keys(prior).length>0&&same(Object.keys(fields).sort(),Object.keys(prior).sort())&&Object.keys(prior).every(k=>
    fields[k].status==='observed'&&!fields[k].truncated&&fields[k].value===prior[k].value);
}

// This boundary requires continuity of the live UI document, not merely a
// matching node GUID after reopening. Any intervening DOM revision refuses it.
// Running executions whose UI has advanced need separate reconciliation.
export function finishedImportSurface(surface) {
  return structuredClone(Object.fromEntries(['dom_epoch','prepared_node_context','node_processes','node_outputs','wizard']
    .map(k=>[k,surface[k]])));
}
export function verifyFinishedImportContinuation({node,finish,surface}) {
  const before=finish?.continuation_surface,group=finish?.execution_group;
  const sameNode=c=>c?.verified===true&&c.surface==='graph'
    &&['document_id','workflow_id','node_id'].every(k=>typeof node?.[k]==='string'&&node[k]===c[k]);
  const valid=s=>s?.wizard?.status==='absent'&&sameNode(s.prepared_node_context)
    &&typeof s.dom_epoch?.document==='string'&&Number.isSafeInteger(s.dom_epoch.revision)
    &&s.node_processes?.verified===true&&s.node_processes.inventory_complete===true
    &&s.node_processes.show_completed===true&&sameNode(s.node_processes.node_context)
    &&s.node_outputs?.verified===true&&sameNode(s.node_outputs.node_context)
    &&s.node_outputs.ports?.length===1&&s.node_outputs.ports[0].active===true;
  if(finish?.verified!==true||finish.cleanup_complete!==true||finish.mode!=='execute'
    ||finish.execution_started!==true||finish.settings_applied!==true
    ||!valid(before)||!valid(surface)||!group||finish.execution_id!==group.execution_id
    ||!sameNode({...group.node,verified:true,surface:'graph'})
    ||before.node_processes.root_id!==group.root_id)return false;
  const groups=before.node_processes.processes.filter(p=>p.parent_id===null&&p.process_id===group.group_id
    &&p.record_id===group.group_record_id&&p.state==='completed'&&p.error===false);
  return groups.length===1&&JSON.stringify(finishedImportSurface(surface))===JSON.stringify(before);
}

// A cancelled read wait retains an identified launch, not a frozen progress UI.
// Progress/lock/active-icon changes are expected; a different document, launch,
// port or reconfigured (inactive after completion) node is not a continuation.
export function verifyWaitingExecutionContinuation({node,finish,surface,checkpoint}) {
  const before=finish?.continuation_surface,execution=finish?.execution_group;
  const sameNode=c=>c?.verified===true&&c.surface==='graph'
    &&['document_id','workflow_id','node_id'].every(k=>typeof node?.[k]==='string'&&node[k]===c[k]);
  const valid=s=>s?.wizard?.status==='absent'&&sameNode(s.prepared_node_context)
    &&typeof s.dom_epoch?.document==='string'&&Number.isSafeInteger(s.dom_epoch.revision)
    &&s.node_processes?.verified===true&&s.node_processes.inventory_complete===true
    &&s.node_processes.show_completed===true&&sameNode(s.node_processes.node_context)
    &&s.node_outputs?.verified===true&&sameNode(s.node_outputs.node_context)
    &&s.node_outputs.ports?.length===1;
  if(checkpoint?.phase!=='execute'||checkpoint.read_only!==true||checkpoint.cleanup_complete!==true
    ||finish?.verified!==true||finish.cleanup_complete!==true||finish.mode!=='execute'
    ||finish.execution_started!==true||finish.settings_applied!==true||!execution
    ||checkpoint.execution_id!==finish.execution_id||finish.execution_id!==execution.execution_id
    ||!sameNode({...execution.node,verified:true,surface:'graph'})||!valid(before)||!valid(surface)
    ||before.dom_epoch.document!==surface.dom_epoch.document
    ||before.node_processes.root_id!==execution.root_id||surface.node_processes.root_id!==execution.root_id)return false;
  const roots=s=>s.node_processes.processes.filter(p=>p.parent_id===null)
    .map(p=>[p.process_id,p.record_id]).sort((a,b)=>a[0].localeCompare(b[0]));
  if(JSON.stringify(roots(before))!==JSON.stringify(roots(surface)))return false;
  const groups=surface.node_processes.processes.filter(p=>p.parent_id===null
    &&p.process_id===execution.group_id&&p.record_id===execution.group_record_id);
  if(groups.length!==1||groups[0].error!==false)return false;
  const group=groups[0],completed=group.state==='completed';
  if(!completed&&!(group.progress_state?.verified===true&&group.progress_state.terminal===false
    &&['running','not_responding','not_started'].includes(group.progress_state.state)))return false;
  const port=p=>Object.fromEntries(Object.entries(p).filter(([k])=>k!=='active'));
  return JSON.stringify(before.node_outputs.ports.map(port))===JSON.stringify(surface.node_outputs.ports.map(port))
    &&(!completed||surface.node_outputs.ports.every(p=>p.active===true));
}
