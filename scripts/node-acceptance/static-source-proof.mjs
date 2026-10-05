import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const need=(v,m)=>{if(!v)throw Error('COLD_SOURCE:'+m);};
const one=(xs,m)=>{need(xs.length===1,m);return xs[0];};
const pick=(f,ks)=>Object.fromEntries(ks.map(k=>[k,f[k]]));
export function verifyGeneratedCollapseMapping(mapping,schema){
 need(mapping?.verified===true&&mapping.inventory_complete===true&&mapping.source_fields?.length===0
  &&Array.isArray(schema)&&schema.length>0&&schema.length<=128
  &&JSON.stringify(mapping.target_fields?.map(f=>pick(f,['name','label','type'])))===JSON.stringify(schema)
  &&mapping.target_fields.every(f=>!f.excluded&&!f.inherited&&f.source===null),'generated Collapse schema differs');
 return true;
}

// Read settings and cancel each wizard. No CrossTable configure handler, private
// model receipts, supplied subtype declarations or aggregate results are used.
export async function observeStaticSources({load,graph,channelFor,account,revealSource}){
 const {openPreparedWizard}=await load('client/lib/node-wizard-open.mjs');
 const {closePreparedWizard}=await load('client/lib/node-wizard-close.mjs');
 const {isTextImportSourceReady}=await load('client/lib/text-import-procedure.mjs');
 const {showMissingValuesMappingTable}=await load('client/lib/missing-values-output.mjs');
 const {crossTableConfiguration}=await load('client/lib/crosstable-procedure.mjs');
 const {selectPreparedGraphNode}=await load('client/lib/node-graph-selection.mjs');
 const mapping=async(channel,direction,generatedSchema)=>{
  await channel[direction==='input'?'openInputPort':'openOutputPort'](0);
  if(direction==='output')await showMissingValuesMappingTable(channel);
  const state=await channel.observe({condition:'cold readonly '+direction+' mapping',readMappings:true,
   ready:s=>s.node_mapping?.verified===true&&s.node_mapping.inventory_complete===true});
  const m=state.node_mapping;
  need(m.target_fields.length>0&&m.target_fields.length<=128,'bounded complete definition required');
  const generated=direction==='output'&&generatedSchema&&m.source_fields.length===0;
  if(generated)verifyGeneratedCollapseMapping(m,generatedSchema);
  const fields=m.target_fields.map(f=>{
   const source=f.source??f.exclusion_source;
   need(generated||source&&m.source_fields.some(s=>s.record_id===source.record_id),'mapping source unverified');
   return {...pick(f,['name','label','type','data_kind','index']),excluded:f.excluded===true,source_name:generated?f.name:source.name};
  });
  const closed=await closePreparedWizard(channel);need(closed.verified&&closed.settings_applied===false,'mapping cancel');
  return {port:0,autosync:m.autosync,fields,native:m};
 };
 const selectSource=async(channel,target)=>{
  // Existing settings controls are rendered only for the selected graph node.
  // Bind the gesture to the independently observed GUID before opening them.
  if(revealSource)await revealSource(target);
  const selected=await channel.observe({condition:'cold observed source selection point',
   ready:s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent'
    &&s.ui.elements.some(e=>(e.tid===s.prepared_node_context.tid&&e.graph_node?.part==='body'
     ||e.tid===s.prepared_node_context.tid+';Label;Label'&&e.graph_node?.part==='label')
     &&e.allowed_actions.includes('click')&&e.interaction?.state==='point_observed')});
  await selectPreparedGraphNode(channel,selected,'cold select observed source node',{refreshReplacedBody:true});
  await channel.observe({condition:'cold active scenario title settled',
   ready:s=>s.prepared_node_context?.surface==='graph'&&s.workflow_navigation?.status==='observed'
    &&s.active_identity===s.workflow_navigation.path.at(-1)?.label});
 };
 const sources={imports:[],collapses:[],crossTables:[]};
 for(const target of graph.nodes.filter(n=>['imports.text','transform.collapse_columns','transform.cross_table'].includes(n.type))){
  const channel=channelFor(target.ref,'source-settings-'+target.ref.node_id);
  await selectSource(channel,target);
  try { if(target.type==='imports.text'){
   await openPreparedWizard(channel);
   let s=await channel.observe({condition:'cold observed static import',ready:isTextImportSourceReady});
   const source=Object.fromEntries(Object.entries(s.wizard.import_source.fields).map(([k,f])=>[k,f.value]));
   source.rows_to_skip=Number(source.rows_to_skip);
   need(source.connection==='Локальное'&&source.source_path.startsWith('/'+account+'/')
    &&source.source_path.split('/').length===3&&!/[|*?%\\\x00-\x1f]/.test(source.source_path)
    &&source.rows_to_skip===0&&source.first_line_as_title===true&&/^UTF-8/.test(source.encoding),'unsupported source path or parser');
   await channel.perform({condition:'cold readonly format page',initialObservation:s,ready:isTextImportSourceReady,
    identity:()=>target.ref,resolve:s=>({verb:'wizard_step',ref:one(s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step')),'format Next').ref,expected_stage:'text_import_format'})});
   s=await channel.observe({condition:'cold observed CSV format',ready:s=>s.wizard?.stage==='text_import_format'
    &&['delimiter','decimal_separator','null_marker','text_qualifier'].every(k=>s.wizard.settings?.fields[k]?.status==='observed'&&!s.wizard.settings.fields[k].truncated)});
   const observed=Object.fromEntries(['delimiter','decimal_separator','null_marker','text_qualifier'].map(k=>[k,s.wizard.settings.fields[k].value]));
   // The pinned format editors expose localized option labels, as in the
   // existing import procedure. Accept only the exact assigned CSV options.
   const format={delimiter:observed.delimiter==='Запятая'?',':observed.delimiter,
    decimal_separator:observed.decimal_separator==='Точка (.)'?'.':observed.decimal_separator,
    text_qualifier:observed.text_qualifier==='Двойная кавычка (")'?'"':observed.text_qualifier,
    null_marker:observed.null_marker};
   need(format.delimiter===','&&format.decimal_separator==='.'&&format.null_marker==='?'&&format.text_qualifier==='"','CSV parser differs');
   const closed=await closePreparedWizard(channel);need(closed.verified&&!closed.settings_applied,'import cancel');
   const output=await mapping(channel,'output');
   need(output.fields.every(f=>!f.excluded&&f.name===f.source_name),'renamed or excluded import source');
   sources.imports.push({node_id:target.ref.node_id,configuration:{kind:'text_import',values_are:'observed_ui_values',node:target.ref,source,format,output_mapping:{port:0,autosync:output.autosync,fields:output.fields}}});
  }else{
   const input=await mapping(channel,'input');
   await selectSource(channel,target);
   await openPreparedWizard(channel);
   if(target.type==='transform.collapse_columns'){
    const s=await channel.observe({condition:'cold observed Collapse',readCollapse:true,ready:s=>s.node_collapse?.verified&&s.node_collapse.inventory_complete});
    const c=s.node_collapse;
    need(c.transposed.length>0&&c.skip_null.switch_pressed===false
     &&[...c.information,...c.transposed].every(f=>['integer','real','string','boolean','datetime'].includes(f.type))
     &&input.fields.every(f=>!f.excluded&&f.name===f.source_name),'unsupported Collapse mapping or variable policy');
    const configuration={kind:'collapse',values_are:'observed_ui_values',node:target.ref,mode:'unpivot',information:c.information,transposed:c.transposed,ignore_empty:c.skip_null.value,input_mapping:{port:0,autosync:input.autosync,fields:input.fields}};
    await closePreparedWizard(channel);
    const generatedSchema=[...c.information.map(f=>pick(f,['name','label','type'])),
     {name:'Names',label:'Имена',type:'string'},{name:'DisplayNames',label:'Метки',type:'string'},
     {name:'Values',label:'Значения',type:'variant'},{name:'DataTypes',label:'Типы данных',type:'integer'}];
    const output=await mapping(channel,'output',generatedSchema);configuration.output_mapping={port:0,autosync:output.autosync,fields:output.fields};
    sources.collapses.push({node_id:target.ref.node_id,configuration});
   }else{
    const s=await channel.observe({condition:'cold observed CrossTable',readCrossTable:true,ready:s=>s.node_crosstable?.verified&&s.node_crosstable.inventory_complete});
    const configuration=crossTableConfiguration(s.node_crosstable,input.native);
    sources.crossTables.push({node_id:target.ref.node_id,configuration});
    await closePreparedWizard(channel);
    // Complete owned CrossTable settings expose every supported binding and
    // its resolved value. Inspect definitions for every bound node; unbound
    // local definitions cannot change these independently observed settings.
    if(Object.keys(configuration.options.variable_bindings).length){
     const variables=await channel.configureCrossTableVariables([]);
     need(variables.verified&&variables.settings_changed===false&&variables.settings_applied===false&&variables.draft_discarded===true,
      'cold variable inspection must discard its unchanged draft');
    }
   }
  }} catch(error){
   // A refused read must cancel its own editor before package cleanup. Do not
   // apply settings or dismiss an unrelated dialog to make cleanup succeed.
   const s=await channel.observe({condition:'cold source refusal editor ownership',ready:()=>true});
   if(s.wizard?.status==='observed'&&s.prepared_node_context?.surface==='wizard'){
    const closed=await closePreparedWizard(channel);need(closed.verified&&!closed.settings_applied,'refusal cancel');
   }
   throw error;
  }
 }
 return sources;
}

// Download the original file with the existing owned UI capability and verify
// actual bytes against fixtures generated before the autonomous model run.
export async function verifyStaticSourceBytes({load,runtime,execute,sources,allowed,account,origin,output}){
 const {findNativeStorageRow}=await load('client/lib/text-export-output.mjs');
 const {makeArtifactDownloadCode}=await load('client/lib/executor.mjs');
 const read=async options=>{
  const r=await runtime.observe(options);need(r.status==='SUCCEEDED','storage observation');
  const s=structuredClone(r.output);let cursor=s.page?.next_cursor,pages=0;
  while(cursor){need(++pages<=32,'storage page bound');const n=await runtime.observe({cursor});need(n.status==='SUCCEEDED'&&n.output.observation_id===s.observation_id,'storage observation changed');for(const k of ['elements','dialogs','masks'])s.ui[k].push(...n.output.ui[k]);cursor=n.output.page?.next_cursor;}
  return s;
 };
 const act=async(s,e,verb='click',extra={})=>{const r=await runtime.uiAct({verb,ref:e.ref,...extra},{operationId:'cold-source-nav-'+randomId(),observationId:s.observation_id});need(r.status==='SUCCEEDED'&&r.cleanup_complete,'storage navigation uncertain');};
 const ready=async(fn,predicate)=>{const deadline=Date.now()+15000;for(;;){const s=await fn();if(s&&predicate(s))return s;need(Date.now()<deadline,'storage readiness timeout');await new Promise(r=>setTimeout(r,100));}};
 const roots=async()=>{
  // Storage navigation may finish while observation pages are being read.
  // Restart from fresh roots only; never reuse a cursor or scoped stale ref.
  for(let attempt=0;attempt<3;attempt++)try{return await read({scope:'roots'});}
  catch(error){if(!String(error.message).startsWith('Workspace changed between observation pages;')||attempt===2)throw error;}
 };
 const detail=(s,e)=>read({rootRef:e.ref,observationId:s.observation_id});
 const directory=()=>ready(async()=>{const s=await roots(),bar=s.ui.elements.find(e=>e.tid===s.workflow_ref.prefix+';NavigationBar;NavigationPanel');return bar?detail(s,bar):null;},s=>s.file_storage?.status==='observed');
 const row=async(name,parent)=>{
  let last;const observed=async options=>{const s=await read(options.root_ref?{rootRef:options.root_ref,observationId:last?.observation_id}:{scope:'roots',...(options.storage_name?{storageName:options.storage_name}:{})});need(s.dom_epoch.document===parent.dom_epoch.document&&JSON.stringify(s.workflow_ref)===JSON.stringify(parent.workflow_ref),'storage owner changed');last=s;return s;};
  return findNativeStorageRow({name,roots:()=>observed({discover_roots:true}),read:observed,ready,act,guard:()=>{}});
 };
 let s=await roots();
 if(!s.ui.elements.some(e=>e.tid?.includes(';FileStorageForm;'))){const toolbar=one(s.ui.elements.filter(e=>e.tid==='MF;cntMain;tlbMainToolbar'),'toolbar');s=await detail(s,toolbar);await act(s,one(s.ui.elements.filter(e=>e.tid==='MF;cntMain;tlbMainToolbar;btnFilestorage'&&e.allowed_actions.includes('click')),'files button'));}
 s=await directory();
 const own='/'+account;
 if(s.file_storage.directory!==own){
  if(s.file_storage.directory!=='/'){await act(s,one(s.ui.elements.filter(e=>e.tid===s.workflow_ref.prefix+';cnrNaviMode;b.s_Сервер>Файлы'&&e.allowed_actions.includes('click')),'storage root'));s=await directory();need(s.file_storage.directory==='/','storage root changed');}
  const r=await row(account,s);await act(r,one(r.ui.elements.filter(e=>e.label===account&&e.storage_entry?.kind==='folder'&&e.allowed_actions.includes('double_click')),'own source folder'),'double_click');s=await directory();
 }
 need(s.file_storage.directory===own,'own storage required');
 const proofs=new Map();
 for(const source of sources.imports){
  const path=source.configuration.source.source_path;
  if(!proofs.has(path)){
   const name=path.split('/').at(-1),r=await row(name,s),e=one(r.ui.elements.filter(e=>e.label===name&&e.storage_entry?.kind!=='folder'&&e.storage_entry?.bytes_source==='native_file_store'),'exact source file');
   need(allowed.some(f=>f.bytes===e.storage_entry.bytes),'source size differs before download');
   const downloadPath=join(output,'source-'+proofs.size+'.csv'),artifact={artifact_id:'cold-source-'+proofs.size,name,upload:{directory:own,destination:path,grant_id:'cold-source-readonly'}};
   const result=await execute(makeArtifactDownloadCode({artifact,snapshot:r,file_ref:e.ref,operation_id:artifact.artifact_id,expected_origin:origin,expected_build:'7.4.2',download_path:downloadPath}));
   need(result.status==='SUCCEEDED'&&result.cleanup_complete&&result.output.download_completed,'source download unconfirmed');
   const bytes=await readFile(downloadPath);need(bytes.length<=16777216,'source byte bound');const sha256=createHash('sha256').update(bytes).digest('hex');
   const fixture=one(allowed.filter(f=>f.sha256===sha256&&f.bytes===bytes.length),'source fixture mismatch');
   proofs.set(path,{destination:path,bytes:bytes.length,sha256,bytes_verified:true,download_completion_verified:true,provenance:'independent_server_file_download',fixture});
  }
  source.source=proofs.get(path);
  const observed=JSON.stringify(source.configuration.output_mapping.fields.map(f=>pick(f,['name','label','type'])));
  need([source.source.fixture.columns,...(source.source.fixture.output_orders??[])].some(cols=>observed===JSON.stringify(cols)),'source fixture schema differs');
 }
 return proofs;
}
let id=0;const randomId=()=>String(++id);

// A cold read may use only executions launched and verified by this oracle.
export async function bindColdExecutions({execute,sources,ctx,ownedExecutions}){
 const groups=ownedExecutions.map(e=>e.execution_id);
 const ids=[...sources.imports,...sources.collapses].map(s=>s.node_id);
 const observed=await execute(`async page=>page.evaluate(a=>{
  const need=(v,m)=>{if(!v)throw Error(m);},tree=document.querySelector('[data-tid="ConsoleForm;ProgressForm;trpProgress;treepanel;tree"]');need(tree,'cold process tree');
  const store=Ext.getCmp(tree.id).getStore(),root=store.getRoot(),records=[];need(!store.isLoading()&&root.data.loaded===true,'cold process inventory');
  const walk=ns=>{need(records.length+ns.length<=2000,'cold process bound');for(const r of ns){need(!r.data.loading,'cold process loading');records.push(r);walk(r.childNodes??[]);}};walk(root.childNodes);
  const nodes=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController.FDiagram.FNodes.FCollection;
  return a.ids.map(id=>{const ns=nodes.filter(n=>n.FGuid===id);need(ns.length===1,'cold source owner');const ps=records.filter(r=>r.data.ModelNode===ns[0].data),latest=Math.max(...ps.map(r=>Number(String(r.data.id).split('.')[0]))),execution=a.document_id+':'+root.internalId+':'+latest;
   need(a.groups.includes(execution)&&ps.some(r=>String(r.data.id).startsWith(latest+'.')&&r.data.Status===3&&r.data.ErrorDetails===''),'cold source execution not owned');return {node_id:id,execution_id:execution};});
 },${JSON.stringify({ids,groups,document_id:ctx.document_id})})`);
 const binding={imports:[],collapses:[]};for(const kind of ['imports','collapses'])binding[kind]=sources[kind].map(s=>({...s,...one(observed.filter(o=>o.node_id===s.node_id),'cold execution proof')}));
 return binding;
}
