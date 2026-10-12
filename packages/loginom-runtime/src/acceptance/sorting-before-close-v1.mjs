import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {parseCapabilityResult,withBrowserReceipt} from '../../client/lib/executor.mjs';
import {createNodeProcedure} from '../../client/lib/node-procedure.mjs';
import {openOwnedNativePreview} from '../../client/lib/collapse-native-output.mjs';
import {bindLoadedNativeRuntime,collectNativeRuntime,verifyLoadedNativeRuntime} from '../../client/lib/collapse-native-runtime.mjs';
import {readNativeVariant,nativeVariantStatus} from '../../client/lib/variant-native-read.mjs';
import {decodeVariantFrame} from '../../client/lib/variant-native-decode.mjs';
import {adaptRead,nativeUserPort,temporalProfile} from '../../client/lib/variant-native-values.mjs';
import {readCapturePreparation} from './calculator-grouped-before-done-v1.mjs';
const need=(v,m)=>{if(!v)throw Error('LOGINOM_SORTING_CAPTURE_'+m)};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// Host-only input. Neither tool arguments nor samples authorize exact reads.
export function checkSortingAdmission(binding,identity,ordinary,now=Date.now()) {
 need(binding?.revision===1&&binding.harness==='sorting-before-close-v1','BINDING');
 need(['owner','run','lease','chat','admission','account','session'].every(k=>typeof binding[k]==='string'&&binding[k])
  &&binding.lease===binding.owner+':'+binding.run&&Number.isSafeInteger(binding.generation)&&binding.generation>0
  &&Number.isSafeInteger(binding.expires)&&binding.expires>now,'OWNER');
 need(identity?.session_id===binding.session&&identity.account===binding.account&&identity.package_path===binding.packagePath
  &&['document_id','tab_tid','loginom_build'].every(k=>typeof identity[k]==='string'&&identity[k]),'IDENTITY');
 const c=ordinary?.configuration?.readback,n=ordinary?.node,e=ordinary?.execution;
 need(ordinary?.status==='SUCCEEDED'&&ordinary.cleanup_complete===true&&e?.status==='completed'
  &&typeof e.execution_id==='string'&&e.execution_id.startsWith(identity.document_id+':')
  &&n?.document_id===identity.document_id&&typeof n.workflow_id==='string'&&typeof n.node_id==='string','ORDINARY');
 need(c?.kind==='sorting'&&c.scope==='observed_before_verified_finish'&&c.values_are==='observed_ui_values'
  &&same(c.node,n)&&Array.isArray(c.keys)&&c.keys.length>0&&c.keys.length<=8
  &&c.receipt_ids?.length===5&&new Set(c.receipt_ids).size===5,'SETTINGS');
 need(new Set(c.keys.map(k=>k?.name)).size===c.keys.length
  &&c.keys.every((k,i)=>k?.order===i&&['ASC','DESC'].includes(k.direction)
    &&typeof k.name==='string'&&['boolean','datetime','real','integer','string','variant'].includes(k.type)
    &&(['string','variant'].includes(k.type)?typeof k.case_sensitive==='boolean':k.case_sensitive===undefined)),'KEYS');
 const ports=ordinary.output?.ports;
 need(Array.isArray(ports)&&ports.length===1&&ports[0].port===0&&ports[0].fresh===true
  &&ports[0].execution_id===e.execution_id&&typeof ports[0].port_guid==='string'
  &&Number.isSafeInteger(ports[0].row_count)&&ports[0].row_count>=0&&ports[0].row_count<=50
  &&Array.isArray(ports[0].schema)&&ports[0].schema.length>0&&ports[0].schema.length<=8,'OUTPUT');
 return {node:structuredClone(n),execution:structuredClone(e),settings:structuredClone(c),port:structuredClone(ports[0])};
}

// A fresh Sorting-specific object binding. The domain-specific Collapse binder
// is deliberately not used. Shared321/116 transport still owns one-shot/poison
// handling and checks its actual session/objects around every response.
export async function bindSortingNative(page,args) {
 return page.evaluate(a=>{
  const need=(v,m)=>{if(!v)throw Error('LOGINOM_SORTING_NATIVE_'+m)};
  const p=globalThis.__loginomDockPreparationV1,app=globalThis.bg?.app;
  need(p?.document===document&&p.id===a.document_id&&location.origin===a.origin&&app?.Version===a.build,'IDENTITY');
  need(app.Application.FInstance.FMainForm.FMapTree.FServerConnection.UserName===a.account,'ACCOUNT');
  const rs=[...p.receipts.values()].filter(r=>r.phase==='verified'&&r.workflowId===a.workflow_id);
  const tabs=document.querySelectorAll('[data-tid='+JSON.stringify(a.tab_tid)+']');
  need(rs.length>0&&tabs.length===1&&rs.every(r=>r.tab===tabs[0]&&r.packageNode===rs[0].packageNode)
   &&tabs[0].classList.contains('x-tab-active'),'TAB');
  const model=app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController;
  const manager=model.FPreviewManager,form=manager?.FPreviewForm,node=form?.FCurrentPreviewNode,port=form?.FCurrentPreviewPort;
  need(manager?.FPreviewVisible===true&&node?.FGuid===a.node_id&&node.FIconCls==='bg-vendor-icon-sorting'
   &&node.FStatus===1&&node.FRunning===false&&port?.parent===node&&port.FGuid===a.port_guid
   &&port.FType===1&&port.FSubType===1&&port.FParam===0&&port.FStatus===1
   &&manager.FShowDataLastCall.Node===node&&manager.FShowDataLastCall.Port===port,'NODE');
  const nodes=model.FDiagram.FNodes.FCollection,links=model.FDiagram.FLinks.FCollection;
  const sources=nodes.filter(n=>n.FIconCls==='bg-vendor-icon-importtextfile');
  need(nodes.filter(n=>n.FGuid===a.node_id).length===1&&sources.length===1
   &&nodes.filter(n=>n.FIconCls!=='bg-vendor-icon-modelvariables').length===2
   &&links.length===1&&links[0].FSourcePort?.parent===sources[0]&&links[0].FTargetPort?.parent===node,'TOPOLOGY');
  const tree=document.querySelector('[data-tid="ConsoleForm;ProgressForm;trpProgress;treepanel;tree"]');
  need(tree,'EXECUTION_ROOT');const store=Ext.getCmp(tree.id).getStore(),root=store.getRoot();
  need(!store.isLoading()&&root.data.loaded===true,'EXECUTION_LOADING');
  const parts=a.execution.execution_id.slice(a.document_id.length+1).split(':');
  need(parts.length===2&&String(root.internalId)===parts[0],'EXECUTION_ID');
  const records=[];const walk=ns=>{need(ns.length+records.length<=2000,'EXECUTION_BOUND');for(const r of ns){need(r.data.loading!==true,'EXECUTION_LOADING');records.push(r);walk(r.childNodes??[])}};walk(root.childNodes);
  const groups=records.filter(r=>String(r.data.id)===parts[1]);
  need(groups.length===1&&groups[0].data.Status===3&&groups[0].data.ErrorDetails===''&&groups[0].data.loaded===true,'EXECUTION');
  const own=records.filter(r=>r.data.ModelNode===node.data);
  need(own.some(r=>String(r.data.id).startsWith(parts[1]+'.')&&r.data.Status===3&&r.data.ErrorDetails==='')
   &&!own.some(r=>Number(String(r.data.id).split('.')[0])>Number(parts[1])),'STALE');
  const source=sources[0],processes=records.filter(r=>r.data.ModelNode===source.data);
  need(processes.length>0&&source.FStatus===1&&source.FRunning===false,'SOURCE');
  const latest=Math.max(...processes.map(r=>Number(String(r.data.id).split('.')[0])));
  const sg=records.filter(r=>String(r.data.id)===String(latest));
  need(Number.isSafeInteger(latest)&&latest<=Number(parts[1])&&sg.length===1&&sg[0].data.Status===3
   &&sg[0].data.ErrorDetails===''&&sg[0].data.loaded===true,'SOURCE_EXECUTION');
  const roots=document.querySelectorAll('[data-tid='+JSON.stringify(a.prefix+';ModelForm;PreviewWindow;PreviewForm;DataSetForm')+']');
  need(roots.length===1&&roots[0].checkVisibility({checkVisibilityCSS:true}),'PREVIEW');
  const d=Ext.getCmp(roots[0].id).Controller,dt=d.FDataTable,ds=d.FDataSource,h=ds.$FHelper;
  const schema=d.FColumnInfosStore.data.items.map(r=>({name:r.data.Name,label:r.data.DisplayName,type:r.data.DataType})),count=dt.FTotalRowCount;
  need(d.FModelNode===node.data&&dt.FDataSourceStore.loading===false&&Number.isSafeInteger(count)&&count>=0&&count<=50
   &&count===h.$FRowCount&&schema.length>0&&schema.length<=8&&JSON.stringify(schema)===JSON.stringify(a.schema),'FULL_BOUND_SCHEMA');
  return {port:0,method:321,interface:116,offset:0,rows:count,columns:schema.map((_,i)=>i),row_count:count,schema,
   source:{owner:ds.$.$OW,object:ds.$.$O},document_id:a.document_id,workflow_id:a.workflow_id,package_id:a.package_id,
   node_id:a.node_id,port_guid:a.port_guid,execution:a.execution,tab_tid:a.tab_tid,prefix:a.prefix,origin:a.origin,
   static_source:{node_id:source.FGuid,execution_id:a.document_id+':'+parts[0]+':'+latest},
   count_loader_sources:{PrepareColumnInfoAndRowCount:d.PrepareColumnInfoAndRowCount.toString(),InitOutput:d.InitOutput.toString(),DataSourceProxyRead:dt.FDataSourceStore.proxy.read.toString()}};
 },args);
}

export function checkSortingTable(table,checked) {
 need(table.coverage?.table_complete===true&&table.binding?.node_id===checked.node.node_id
  &&same(table.binding.execution,checked.execution)&&table.binding.port_guid===checked.port.port_guid,'FULL_READ');
 const project=fs=>fs.map(({name,label,type})=>({name,label,type}));
 need(same(project(table.schema),project(checked.port.schema))&&table.row_count===checked.port.row_count,'SCHEMA_COUNT');
 need(Number.isSafeInteger(table.row_count)&&table.row_count>=0&&table.row_count<=50
  &&table.cells.length===table.row_count*table.schema.length,'COMPLETENESS');
 const keys=table.cells.map(c=>c.row+':'+c.column);
 need(new Set(keys).size===keys.length&&table.cells.every((c,i)=>c.row===Math.floor(i/table.schema.length)
  &&c.column===i%table.schema.length&&c.precision==='exact_native'),'ORDER');
 const rows=Array.from({length:table.row_count},(_,r)=>table.cells.filter(c=>c.row===r));
 const multiplicity={};for(const row of rows){const key=createHash('sha256').update(JSON.stringify(row.map(({row,column,...v})=>v))).digest('hex');multiplicity[key]=(multiplicity[key]??0)+1}
 return {rows,multiplicity};
}

export async function captureSorting({binding,identity,ordinary,browser,record}) {
 const checked=checkSortingAdmission(binding,identity,ordinary),deadline=binding.expires;
 const manifest=JSON.parse(await readFile(new URL('../../../resource-manifest.json',import.meta.url),'utf8'));
 const cli=JSON.parse(await readFile(new URL('../../../../../cli-manifest.json',import.meta.url),'utf8'));
 const own=await readFile(import.meta.url.startsWith('file:')?new URL(import.meta.url):import.meta.url);
 const entries=manifest.files?.filter(f=>f.path==='runtime/src/acceptance/sorting-before-close-v1.mjs');
 const digest=createHash('sha256').update(own).digest('hex');
 need(entries?.length===1&&entries[0].sha256===digest&&cli.format==='loginom-cli-artifact-v1'
  &&cli.metadata?.sourceDirty===false&&/^[a-f0-9]{40}$/.test(cli.metadata.sourceCommit),'PRODUCT');
 const product={...cli.metadata,resource_path:entries[0].path,resource_sha256:digest};
 need(typeof browser?.callTool==='function'&&typeof record==='function','TRANSPORT');
 const execute=async code=>{
  need(Date.now()<deadline,'DEADLINE');
  const wrapped=`async page=>({status:'SUCCEEDED',action_key:'acceptance.sorting.read',action_revision:'1',phase:'read',effect_possible:false,trace:[],error:null,output:{value:await (${code})(page)}})`;
  return parseCapabilityResult(await browser.callTool({name:'browser_run_code_unsafe',arguments:{code:wrapped}},undefined,
   {timeout:Math.max(1,deadline-Date.now())})).output.value;
 };
 const prepared=await execute(`async page=>page.evaluate(${readCapturePreparation.toString()},${JSON.stringify(identity)})`);
 need(prepared.workflow_ref.workflow_id===checked.node.workflow_id,'WORKFLOW');
 const ctx={node:checked.node,workflow_ref:prepared.workflow_ref};
 const operation={id:'sorting:'+binding.admission,action:{action_key:'acceptance.sorting.read',revision:'1'},deadline};
 const channel=createNodeProcedure({operation,execute,record,targetOrigin:prepared.origin,targetBuild:identity.loginom_build,
  preparedNodeContext:{document_id:identity.document_id,...ctx},maxSteps:24,
  wrapMutation:(code,r)=>withBrowserReceipt(`(${code})(page)`,{receipt_namespace:binding.session,receipt_id:r.id,receipt_signature:r.signature,operation_id:r.id})});
 const handle=await openOwnedNativePreview(channel,ctx);
 need(handle.port.port_guid===checked.port.port_guid,'PORT');
 const codes={boolean:1,datetime:2,real:3,integer:4,string:5,variant:6};
 const args={...checked.node,package_id:identity.document_id+':'+checked.node.workflow_id,port_guid:checked.port.port_guid,
  execution:checked.execution,tab_tid:identity.tab_tid,prefix:prepared.workflow_ref.prefix,origin:prepared.origin,build:identity.loginom_build,
  account:identity.account,schema:handle.preview.fields.map(f=>({name:f.name,label:f.label,type:codes[f.type]}))};
 const before=await execute(`async page=>(${bindSortingNative.toString()})(page,${JSON.stringify(args)})`);
 const readId='sorting-native-'+randomUUID();
 const loaded=await execute(`async page=>(${bindLoadedNativeRuntime.toString()})(page,${JSON.stringify({...args,binding_id:readId})},${collectNativeRuntime.toString()})`);
 const runtime=verifyLoadedNativeRuntime(loaded,{binding_id:readId,document_id:identity.document_id});
 const pins={PrepareColumnInfoAndRowCount:'d952415558676c3caf569a51d88bf026e661abdaaf08842d870ddba139730e3f',InitOutput:'c01544ac551e88997f9cea9b62314234ad435bc7632357861cdfc6013e89960e',DataSourceProxyRead:'6206671eaf111d80459c3ed1d5878125ef37918fb1abacc1cd19ce42c7fdf91d'};
 for(const [key,pin]of Object.entries(pins))need(createHash('sha256').update(before.count_loader_sources[key]).digest('hex')===pin,'COUNT_LOADER');
 const nativeBinding={...before,runtime_binding_id:readId};delete nativeBinding.count_loader_sources;
 need(Date.now()<deadline,'DEADLINE');const timeout=Math.min(30000,deadline-Date.now());
 const native=await execute(`async page=>{const result=await (${readNativeVariant.toString()})(page,${JSON.stringify(nativeBinding)},${decodeVariantFrame.toString()},{operationId:${JSON.stringify(readId)},timeoutMs:${timeout},maxBytes:1048576});return {result,lifecycle:await (${nativeVariantStatus.toString()})(page)}}`);
 const after=await execute(`async page=>(${bindSortingNative.toString()})(page,${JSON.stringify(args)})`);need(same(before,after),'CHANGED');
 const table=adaptRead(native.result,{expected:{...nativeBinding,read_id:readId},lifecycle:native.lifecycle,dateProfile:temporalProfile,
  consistency:{kind:'observed_local',changed:false,exclusive_operation:true,stability_basis:'owned_static_completed_fixture'}});
 const full=checkSortingTable(table,checked);
 // No oracle/comparator inference. Row positions and multiplicities are evidence;
 // NULL/string/binary64/native datetime serials remain exact native values.
 return {...identity,readonly:true,settings_applied:false,execution_started:false,capture_complete:true,native_verified:false,
  product,settings:checked.settings,execution:checked.execution,node:checked.node,output:nativeUserPort(table,{sampleRows:0}),
  full,mapping_scope:'observed_before_verified_finish',runtime,count_loader_pins:pins,lifecycle:native.lifecycle,
  limitations:['observed_local_not_atomic','unobserved_aba_not_excluded','native_comparator_not_verified','datetime_civil_semantics_not_verified']};
}
