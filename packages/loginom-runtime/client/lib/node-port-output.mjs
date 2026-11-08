import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
import {readOutputContext,readVariableRecords} from './node-output-context.mjs';
import {createNativeVariantReader} from './variant-native-read.mjs';
import {decodeVariantFrame} from './variant-native-decode.mjs';
import {adaptCell} from './variant-native-values.mjs';
import {collectNativeRuntime} from './collapse-native-runtime.mjs';
import {nativeRuntimePins} from './collapse-native-runtime-pins.mjs';
const variantCapability={read:createNativeVariantReader.toString(),decode:decodeVariantFrame.toString(),adapt:adaptCell.toString(),collect:collectNativeRuntime.toString(),pins:nativeRuntimePins};

export function makeNodeVariableOutputCode(binding,options){
 validatePreparedNodeContext(binding);
 if(!Number.isInteger(options?.port)||options.port<0||options.port>99||!Number.isSafeInteger(options.deadline)
  ||typeof options.operation_id!=='string'||options.execution?.verified!==true||options.execution.owner_verified!==true
  ||options.execution.status!=='completed'||['execution_id','process_id','process_record_id'].some(k=>typeof options.execution[k]!=='string'))throw Error('Variable read requires a completed owned execution');
 return `async page=>(${readNodeVariableOutput.toString()})(page,${JSON.stringify({binding,...options})},${readPreparedNodeContext.toString()},${readOutputContext.toString()},${readVariableRecords.toString()},${decodePortCell.toString()})`;
}

// Executable variable sources use the native VariablesForm after a real Execute.
// No server/data-source proxy is invoked and no wizard is opened on this path.
export async function readNodeVariableOutput(page,task,readNode,readOutputs,readRecords,decode){
 const b=task.binding,root=b.workflow_ref.prefix+';ModelForm;PreviewWindow';let effect=false,opened=false,output,error;
 const remaining=()=>{const n=task.deadline-Date.now();if(n<=0)throw Error('Variable output deadline');return n;};
 const at=t=>page.locator('[data-tid='+JSON.stringify(t)+']:visible');
 const inspect=mode=>page.evaluate(({task,mode,recordsCode,decoderCode})=>{
  const b=task.binding,a=bg.app,p=globalThis.__loginomDockPreparationV1,exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')],visible=e=>e.checkVisibility({checkVisibilityCSS:true});
  const rs=[...(p?.receipts?.values()??[])].filter(r=>r.phase==='verified'&&r.workflowId===b.workflow_ref.workflow_id&&r.nodeTargetWorkflowNode),r=rs[0];
  if(location.origin!==task.origin||a.Version!==task.build||p?.document!==document||p.id!==b.document_id||!rs.length
   ||rs.some(v=>v.tab!==r.tab||v.packageNode!==r.packageNode||v.nodeTargetWorkflowNode!==r.nodeTargetWorkflowNode))throw Error('Variable output document/workflow changed');
  const tabs=exact(b.workflow_ref.tab_tid),card=a.Application.FInstance.FMainForm.Items.Workspace.getActiveTab(),m=card.Controller.FController;
  if(tabs.length!==1||tabs[0]!==r.tab||!tabs[0].classList.contains('x-tab-active')||!(m instanceof a.ModelForm)||card.Controller.Node.data.node!==r.nodeTargetWorkflowNode)throw Error('Variable output graph owner changed');
  const d=m.FDiagram,g=d.FmxGraph,ns=d.FNodes.FCollection.filter(n=>n.FGuid===b.node.node_id),n=ns[0];
  if(ns.length!==1||n.FIconCls==='bg-vendor-icon-modelvariables'||n.FStatus!==1||n.FRunning)throw Error('Active executable variable node required');
  const ports=n.FPorts.flatMap(list=>list.FCollection).filter(p=>p.FGuid===task.port_guid),port=ports[0];
  if(ports.length!==1||port.parent!==n||port.FCell.parent!==n.FCell||port.FType!==1||port.FSubType!==3||port.FStatus!==1||!port.data)throw Error('Active variable output owner changed');
  const trees=['ConsoleForm','MF;ConsoleForm'].flatMap(t=>exact(t+';ProgressForm;trpProgress;treepanel;tree'));
  if(trees.length!==1)throw Error('Variable execution tree required');
  const store=Ext.getCmp(trees[0].id)?.getStore(),nativeRoot=store?.getRoot(),prefix=b.document_id+':',id=task.execution.execution_id;
  if(store?.isLoading()!==false||nativeRoot?.data.loaded!==true||!id.startsWith(prefix))throw Error('Variable execution store unavailable');
  const parts=id.slice(prefix.length).split(':'),records=[],parents=new Map(),seen=new Set();
  if(parts.length!==2||String(nativeRoot.internalId)!==parts[0]||!/^[1-9][0-9]*$/.test(parts[1]))throw Error('Variable execution root changed');
  const walk=parent=>{if(!Array.isArray(parent.childNodes))throw Error('Variable process children');for(const record of parent.childNodes){if(seen.has(record)||records.length>=2000||record.data.loading)throw Error('Variable process bound');seen.add(record);records.push(record);parents.set(record,parent);walk(record);}};walk(nativeRoot);
  const groups=records.filter(v=>String(v.data.id)===parts[1]),own=records.filter(v=>v.data.ModelNode===n.data),matches=own.filter(v=>String(v.data.id)===task.execution.process_id&&String(v.internalId)===task.execution.process_record_id);
  if(groups.length!==1||parents.get(groups[0])!==nativeRoot||groups[0].data.Status!==3||groups[0].data.ErrorDetails!==''||groups[0].data.loaded!==true
   ||matches.length!==1||matches[0].data.Status!==3||matches[0].data.ErrorDetails!==''||!String(matches[0].data.id).startsWith(parts[1]+'.')
   ||own.some(v=>BigInt(String(v.data.id).split('.')[0])>BigInt(parts[1])))throw Error('Variable execution is stale or incomplete');
  let ancestor=parents.get(matches[0]);while(ancestor&&ancestor!==groups[0])ancestor=parents.get(ancestor);if(ancestor!==groups[0])throw Error('Variable execution process owner differs');
  const point=e=>{const box=e.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2,hit=document.elementFromPoint(x,y);if(!visible(e)||x<0||y<0||x>=innerWidth||y>=innerHeight||!(hit===e||e.contains(hit)))throw Error('Variable read target covered');return {x,y};};
  const root=b.workflow_ref.prefix+';ModelForm;PreviewWindow',pf=m.FPreviewManager?.FPreviewForm,windows=exact(root).filter(visible);
  if(mode==='port'){
   if(windows.length||exact('mn').some(visible))throw Error('A previous preview or menu is open');
   const es=exact(task.port_tid).filter(e=>g.container.contains(e));if(es.length!==1)throw Error('Unique variable port drawing required');
   const box=es[0].getBoundingClientRect(),gb=g.container.getBoundingClientRect();if(g.getCellAt(box.x-gb.x+g.container.scrollLeft+box.width/2,box.y-gb.y+g.container.scrollTop+box.height/2)!==port.FCell)throw Error('Variable output native hit changed');return point(es[0]);
  }
  if(mode==='menu'){
   const menus=exact('mn').filter(visible),es=exact('mn;mniShowDataPreview').filter(visible);
   if(menus.length!==1||m.FPortContextMenu?.el.dom!==menus[0]||Ext.getCmp(menus[0].id)!==m.FPortContextMenu||m.FCurrentPortMenu!==port
    ||es.length!==1||!menus[0].contains(es[0])||es[0].closest('.x-item-disabled,.x-menu-item-disabled'))throw Error('Owned variable preview command required');return point(es[0]);
  }
  if(windows.length!==1||m.FPreviewManager.FPreviewWindow.FView.el.dom!==windows[0]||pf?.FCurrentPreviewNode!==n||pf.FCurrentPreviewPort!==port)throw Error('Variable preview native owner changed');
  if(mode==='close'){
   const es=exact(root+';p.h;close').filter(visible);if(es.length!==1||!windows[0].contains(es[0]))throw Error('Owned variable preview Close required');return point(es[0]);
  }
  const forms=exact(root+';PreviewForm;VariablesForm').filter(visible),es=exact(root+';PreviewForm;VariablesForm;grdValuePreview'),grid=es.length===1&&Ext.getCmp(es[0].id),form=forms.length===1&&Ext.getCmp(forms[0].id)?.Controller;
  if(forms.length!==1||!windows[0].contains(forms[0])||form?.constructor?.name!=='VariablesForm'||form.FView.el.dom!==forms[0]||form.FModelNode!==n.data
   ||Object.values(pf.FFormCache).filter(v=>v===form).length!==1||!grid||grid.el.dom!==es[0]||!forms[0].contains(es[0])||grid.getStore()!==form.FVariablesStore)throw Error('Bound native VariablesForm required');
  return eval('('+recordsCode+')')(grid.getStore(),'preview',eval('('+decoderCode+')'));
 },{task,mode,recordsCode:readRecords.toString(),decoderCode:decode.toString()});
 try{
  const before=await readNode(page,b);if(!before.verified||before.surface!=='graph')throw Error('Variable output graph unavailable');
  const inventory=await readOutputs(page,b,readNode),ports=inventory.variable_ports?.filter(p=>p.index===task.port);
  if(!inventory.verified||ports?.length!==1||!ports[0].active)throw Error('Requested active variable output absent');
  task={...task,port_guid:ports[0].port_guid,port_tid:ports[0].tid};
  const point=await inspect('port');effect=true;await page.mouse.click(point.x,point.y,{button:'right'});
  await at('mn;mniShowDataPreview').waitFor({state:'visible',timeout:remaining()});const command=await inspect('menu');await page.mouse.click(command.x,command.y);opened=true;
  await page.waitForFunction(t=>{const es=[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')],grid=es.length===1&&Ext.getCmp(es[0].id);return typeof grid?.getStore==='function'&&grid.getStore().isLoading()===false&&grid.getStore().complete===true&&grid.getStore().loadCount>=1;},root+';PreviewForm;VariablesForm;grdValuePreview',{timeout:remaining()});
  output={...await inspect('inventory'),port:task.port,kind:'variables',port_guid:task.port_guid,read_id:task.operation_id,
   execution_id:task.execution.execution_id,source:'execution',native_source:'VariablesForm',fresh:true,freshness_basis:'completed_execution_variables_preview'};
 }catch(cause){error=String(cause.message).slice(0,500);}
 let clean=!effect;
 if(effect)try{if(opened){const point=await inspect('close');await page.mouse.click(point.x,point.y);await page.locator('[data-tid='+JSON.stringify(root)+']').waitFor({state:'hidden',timeout:remaining()});}
  else await page.keyboard.press('Escape');const after=await readNode(page,b);clean=after.verified===true&&after.surface==='graph';}catch{clean=false;}
 const nodeContext=clean?await readNode(page,b):null;
 return {status:output&&!error&&clean?'SUCCEEDED':effect?'AMBIGUOUS':'NOT_APPLIED',verified:!!output&&!error&&clean,effect_possible:effect,cleanup_complete:clean,node_context:nodeContext,...(output&&!error&&clean?{output}:{}),...(error?{error}:{})};
}

// The native reader indexes the ordered list passed to GetReader; array row
// ranges are bound to their parent row, rather than inferred from leaf counts.
export async function readTreePortSource(source,call,track,decode) {
 const need=(ok,reason)=>{if(!ok)throw Error(reason);};
 const schema=[],definitions=[];
 const rpc=async(name,fn,parameters={})=>call(async()=>{try{return await fn();}catch(error){
  if(/^(?:tree_|integer_|unsupported_type)/.test(error?.message??''))throw error;
  let message='';try{message=typeof error?.message==='string'?error.message:typeof error?.get_message==='function'?error.get_message():'';}catch{}
  const nameValue=typeof error?.name==='string'?error.name:error?.constructor?.__typeName??error?.constructor?.name??'Error';
  const failure=Error('tree_rpc_'+name);
  failure.treeReadDiagnostic={stage:name,parameters,native_response:{name:String(nameValue).slice(0,128),message:String(message).slice(0,512)}};
  throw failure;
 }});
 const acquire=async(name,fn)=>{let proxy;await rpc(name,async()=>{proxy=track(await fn());return proxy;});return proxy;};
 const pointer=name=>name.replaceAll('~','~0').replaceAll('/','~1');
 const types={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string',6:'variant'};
 const visit=async(def,parent,path,depth)=>{
  need(depth<=16,'tree_depth_limit');need(schema.length<256,'tree_schema_limit');
  const index=schema.length;
  const name=await rpc('schema_name',()=>def.get_Name()),label=await rpc('schema_label',()=>def.get_DisplayName());
  const container=await rpc('schema_container',()=>def.get_IsContainer()),array=await rpc('schema_array',()=>def.get_IsArray());
  need(typeof name==='string'&&name.length<=512&&typeof label==='string'&&label.length<=16384
   &&typeof container==='boolean'&&typeof array==='boolean'&&(!array||container),'tree_schema_metadata');
  const type=container?'object':types[await rpc('schema_type',()=>def.get_DataType())];
  need(type&&type!=='variant','tree_scalar_type');
  const item={index,parent,path,name,label,type,is_container:container,is_array:array,children:[]};
  schema.push(item);definitions.push(def);
  if(container){
   const children=await acquire('schema_children',()=>def.get_SubNodes()),count=await rpc('schema_count',()=>children.get_Count());
   need(Number.isInteger(count)&&count>=0&&count<=256-schema.length,'tree_schema_limit');
   const names=new Set();
   for(let i=0;i<count;i++){
    const child=await acquire('schema_child',()=>children.getItem(i)),childName=await rpc('schema_child_name',()=>child.get_Name());
    need(typeof childName==='string'&&childName.length>0&&!names.has(childName),'tree_schema_names');names.add(childName);
    const childIndex=await visit(child,index,path+'/'+pointer(childName),depth+1);
    need(schema[childIndex].name===childName,'tree_schema_changed');item.children.push(childIndex);
   }
  }
  return index;
 };
 const root=await acquire('root',()=>source.get_RootNodeDef());await visit(root,null,'',0);
 const reader=await acquire('reader',()=>source.GetReader(definitions));
 let nodeCount=0,maxDepth=0;
 const count=depth=>{need(++nodeCount<=256,'tree_instance_limit');need(depth<=16,'tree_depth_limit');maxDepth=Math.max(maxDepth,depth);};
 const bytes=tree=>need(new TextEncoder().encode(JSON.stringify(tree)).length<=1024*1024,'tree_response_byte_limit');
 const instance=async(index,row,path,depth,arrayItem=false)=>{
  const def=schema[index];count(depth);
  if(def.is_array&&!arrayItem){
   const start={$:0},size={$:0};await rpc('row_range',()=>reader.GetRowRange(index,row,start,size),{schema_index:index,parent_row:row});
   need(Number.isSafeInteger(start.$)&&start.$>=0&&Number.isSafeInteger(size.$)&&size.$>=0
    &&size.$<=256-nodeCount&&Number.isSafeInteger(start.$+size.$),'tree_instance_limit');
   const children=[];
   for(let i=0;i<size.$;i++)children.push(await instance(index,start.$+i,path+'/'+i,depth+1,true));
   const value={schema_index:index,path,type:'array',children};bytes(value);return value;
  }
  if(def.is_container){
   // Root rows exist by GetRowCount; array records exist by GetRowRange.
   // GetContainerExists is for an ordinary optional object, not those records.
   if(index!==0&&!def.is_array)need(await rpc('container',()=>reader.GetContainerExists(index,row),{schema_index:index,row})===true,'tree_absent_container');
   const children=[];
   for(const child of def.children)children.push(await instance(child,row,path+'/'+pointer(schema[child].name),depth+1));
   const value={schema_index:index,path,type:'object',children};bytes(value);return value;
  }
  const decoded=decode(await rpc('value',()=>reader.AsVariant(index,row),{schema_index:index,row}),def.type);
  need(decoded.limitations.length===0,'tree_unverified_precision');
  const value={schema_index:index,path,...decoded.cell};bytes(value);return value;
 };
 // Each native root row is one document; a single row keeps the original shape.
 const rows=await rpc('row_count',()=>reader.GetRowCount(0),{schema_index:0});need(Number.isSafeInteger(rows)&&rows>=1&&rows<=256,'tree_document_count');
 const documents=[];for(let row=0;row<rows;row++)documents.push(await instance(0,row,'',0));
 const instances=[];
 const flatten=(node,parent,row)=>{
  const {children,...value}=node,index=instances.length,record={index,parent,...value,...(rows>1&&parent===null?{root_row:row}:{}),...(children?{children:[]}: {})};
  instances.push(record);if(children)for(const child of children)record.children.push(flatten(child,index));return index;
 };documents.forEach((document,row)=>flatten(document,null,row));
 const result={schema,instances,complete:true,node_count:nodeCount,max_depth:maxDepth,...(rows>1?{root_rows:rows}:{}),
  limits:{max_nodes:256,max_depth:16,max_bytes:1024*1024}};
 bytes(result);return result;
}

// Serialized into the native callback; keep this decoder independent of module closures.
export function decodePortCell(raw,type) {
 if(raw===null||raw===undefined)return {cell:{type,is_null:true,value:null,precision:'exact_null'},limitations:[]};
 const exact=(value,representation,precision,extra={})=>({cell:{type,is_null:false,value,representation,precision,...extra},limitations:[]});
 if(type==='integer'){
  if(!(typeof raw==='number'?Number.isSafeInteger(raw):['Int64','UInt64'].includes(raw?.constructor?.name)))throw Error('integer_value');
  const text=raw.toString();if(!/^-?(?:0|[1-9][0-9]*)$/.test(text))throw Error('integer_text');
  return exact(text,'decimal_integer','exact_integer');
 }
 if(type==='real'&&typeof raw==='number'&&Number.isFinite(raw))return exact(raw,'binary64','17_significant_digits',{decimal:Object.is(raw,-0)?'-0':String(raw)});
 if(type==='string'&&typeof raw==='string')return exact(raw,'data_source_string','source_text');
 if(type==='boolean'&&typeof raw==='boolean')return exact(raw,'data_source_boolean','exact_boolean');
 if((type==='datetime'||type==='variant')&&raw instanceof Date){
  if(!Number.isFinite(raw.getTime()))throw Error('datetime_value');
  const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;
  const instant=Temporal.Instant.fromEpochMilliseconds(raw.getTime()).toZonedDateTimeISO(timezone);
  const limit=instant.epochNanoseconds-48n*3600n*1000000000n;
  let transition=instant.add({nanoseconds:1}).getTimeZoneTransition('previous'),ambiguous=false;
  while(transition&&transition.epochNanoseconds>limit){
   const delta=transition.offsetNanoseconds-transition.subtract({nanoseconds:1}).offsetNanoseconds;
   if(delta>0&&instant.epochNanoseconds<transition.epochNanoseconds+BigInt(delta)){ambiguous=true;break;}
   transition=transition.getTimeZoneTransition('previous');
  }
  const year=raw.getFullYear(),month=raw.getMonth(),day=raw.getDate();
  // AddBias constructs years 0..99 through 1900+Y before restoring the real year.
  if(year>=0&&year<100){
   const date=Temporal.PlainDate.from({year:1900+year,month:month+1,day}),start=date.toZonedDateTime(timezone),end=date.add({days:1}).toZonedDateTime(timezone);
   if(!start.toPlainDate().equals(date)||start.hour||start.minute||start.second||start.millisecond)ambiguous=true;
   let surrogate=start.subtract({nanoseconds:1}).getTimeZoneTransition('next');
   while(surrogate&&surrogate.epochNanoseconds<=end.epochNanoseconds){
    if(surrogate.offsetNanoseconds>surrogate.subtract({nanoseconds:1}).offsetNanoseconds){ambiguous=true;break;}
    surrogate=surrogate.getTimeZoneTransition('next');
   }
  }
  const civil=new Date(0);civil.setUTCFullYear(year,month,day);civil.setUTCHours(raw.getHours(),raw.getMinutes(),raw.getSeconds(),raw.getMilliseconds());
  const epoch=Date.UTC(1899,11,30),linear=civil.getTime()-epoch;
  const corrected=new Date(epoch+(linear<0?Math.trunc(linear/86400000)*86400000+Math.abs(linear%86400000):linear));
  const pad=(value,width=2)=>String(value).padStart(width,'0');
  const text=pad(corrected.getUTCFullYear(),4)+'-'+pad(corrected.getUTCMonth()+1)+'-'+pad(corrected.getUTCDate())+'T'+pad(corrected.getUTCHours())+':'+pad(corrected.getUTCMinutes())+':'+pad(corrected.getUTCSeconds())+'.'+pad(corrected.getUTCMilliseconds(),3);
  const limitations=[...(type==='variant'?['variant_display_precision']:[]),...(ambiguous?['datetime_display_precision']:[])];
  if(!limitations.length)return exact(text,'local_datetime','millisecond',{timezone:'unspecified'});
  return {cell:{type,is_null:false,display_text:text,representation:'formatted_display',precision:'unverified'},limitations};
 }
 if(type==='variant'||type==='real'&&typeof raw==='number'){
  const text=typeof raw==='number'?Object.is(raw,-0)?'-0':String(raw):['string','boolean'].includes(typeof raw)?String(raw):['Int64','UInt64'].includes(raw?.constructor?.name)?raw.toString():undefined;
  return {cell:{type,is_null:false,...(text===undefined?{}:{display_text:text}),representation:'formatted_display',precision:'unverified'},limitations:[type==='variant'?'variant_display_precision':'numeric_display_precision']};
 }
 throw Error('unsupported_type');
}

export function makeNodePortOutputCode(binding,request,options,quality=null) {
 validatePreparedNodeContext(binding);
 if(!request||!['execution,port,requireExactNumbers,sampleRows','execution,port,requireExactNumbers,rowOffset,sampleRows'].includes(Object.keys(request).filter(k=>k!=='typedVariants').sort().join(','))
  ||Object.hasOwn(request,'typedVariants')&&typeof request.typedVariants!=='boolean'
  ||!Number.isInteger(request.port)||request.port<0||request.port>99
  ||!Number.isInteger(request.sampleRows)||request.sampleRows<0||request.sampleRows>100
  ||Object.hasOwn(request,'rowOffset')&&(!Number.isSafeInteger(request.rowOffset)||request.rowOffset<0)
  ||typeof request.requireExactNumbers!=='boolean'
  ||request.execution?.verified!==true||request.execution.owner_verified!==true||request.execution.status!=='completed'
  ||typeof request.execution.execution_id!=='string'||typeof request.execution.process_id!=='string'||typeof request.execution.process_record_id!=='string'
  ||!options||Object.keys(options).sort().join(',')!=='build,deadline,origin'
  ||typeof options.origin!=='string'||typeof options.build!=='string'||!Number.isSafeInteger(options.deadline))throw Error('Exact bounded completed port read required');
 if(quality&&(request.port!==4||typeof quality.binding_id!=='string'||typeof quality.read!=='function'||typeof quality.decode!=='function'))throw Error('Private Quality Moda capability required');
 return `async page=>(${readNodePortOutput.toString()})(page,${JSON.stringify(binding)},${JSON.stringify(request)},${JSON.stringify(options)},${readPreparedNodeContext.toString()},${readOutputContext.toString()},${decodePortCell.toString()},${readTreePortSource.toString()},${quality?JSON.stringify({binding_id:quality.binding_id,read:quality.read.toString(),decode:quality.decode.toString()}):'null'},${JSON.stringify(variantCapability)})`;
}

// One dispatch retains native identity and owns only the proxies acquired here.
export async function readNodePortOutput(page,binding,request,options,readNode=readPreparedNodeContext,readOutputs=readOutputContext,decodeCell=decodePortCell,treeReader=readTreePortSource,quality=null,variant=variantCapability) {
 const before=await readNode(page,binding);
 if(before.verified!==true||before.surface!=='graph')return {verified:false,cleanup_complete:false,reason:'node_context'};
 const inventory=await readOutputs(page,binding,readNode);
 const target=inventory.ports?.find(p=>p.index===request.port);
 if(!inventory.verified||JSON.stringify(inventory.node_context)!==JSON.stringify(before))return {verified:false,cleanup_complete:false,reason:'output_context'};
 if(!target?.active)return {verified:false,cleanup_complete:true,reason:'inactive_output'};
 const result=await page.evaluate(async ({binding:b,request:q,options:o,before,target,decoder,treeReader,quality,variant})=>{
  const decode=eval(' ('+decoder+')'),readTree=eval(' ('+treeReader+')');
  const need=(ok,code)=>{if(!ok){reason=code;throw Error('Port read refused');}},value=(obj,key)=>Object.getOwnPropertyDescriptor(obj??{},key)?.value;
  const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
  const live=()=>need(Date.now()<o.deadline,'deadline');
  let baseline,sourceBaseline,cacheBaseline,output,dataSource,columns,result,readDiagnostic,nativeReader,reason='read_failed',released=true,qualityNativeUncertain=false;
  const items=[];
  const snapshot=()=>{
   const prep=globalThis.__loginomDockPreparationV1,app=globalThis.bg?.app;
   need(prep?.document===document&&prep.id===b.document_id&&location.origin===o.origin&&app?.Version===o.build,'document_changed');
   const receipts=[...prep.receipts.values()].filter(r=>r.phase==='verified'&&r.workflowId===b.workflow_ref.workflow_id),receipt=receipts.find(r=>r.nodeTargetWorkflowNode);
   const tabs=exact(b.workflow_ref.tab_tid);
   need(receipt&&receipts.every(r=>r.tab===receipt.tab&&r.packageNode===receipt.packageNode)&&tabs.length===1&&tabs[0]===receipt.tab&&tabs[0].classList.contains('x-tab-active'),'workflow_changed');
   const card=app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab(),model=card?.Controller?.FController;
   let tree=card?.Controller?.Node?.data?.node,workflow,packageNode;
   for(let i=0;tree&&i<32;i++,tree=tree.ParentNode){if(tree instanceof app.WorkFlowTreeNode)workflow=tree;if(tree instanceof app.PackageTreeNode){packageNode=tree;break;}}
   need(workflow===receipt.nodeTargetWorkflowNode&&packageNode===receipt.packageNode&&model instanceof app.ModelForm,'graph_context_changed');
   const diagram=model.FDiagram,graph=diagram?.FmxGraph,roots=exact(b.workflow_ref.prefix+';ModelForm;cmpDiagram'),nodes=diagram?.FNodes?.FCollection;
   need(roots.length===1&&graph?.container===roots[0]&&Array.isArray(nodes)&&nodes.length<=200,'graph_changed');
   const matches=nodes.filter(n=>n.FGuid===b.node.node_id);need(matches.length===1,'node_changed');
   const node=matches[0],nodeDom=graph.view.getState(node.FCell)?.shape?.node;
   need(nodeDom?.getAttribute('data-tid')===before.tid&&roots[0].contains(nodeDom)&&node.FStatus===1&&node.FRunning===false,'node_inactive');
   need(Array.isArray(node.FPorts)&&node.FPorts.length<=16,'port_bound');
   const candidates=[];
   for(const list of node.FPorts){need(Array.isArray(list.FCollection)&&list.FCollection.length<=100,'port_bound');candidates.push(...list.FCollection);}
   const ports=candidates.filter(p=>p.FGuid===target.port_guid);need(ports.length===1,'port_changed');
   const port=ports[0],dom=graph.view.getState(port.FCell)?.shape?.node,tid=before.tid+';Output_'+(target.kind==='tree'?'DataTree-':'Data-')+target.native_index;
   need(port.parent===node&&(target.kind!=='tree'||port.FCell.parent===node.FCell)&&port.data&&port.FType===1&&port.FSubType===(target.kind==='tree'?target.native_subtype:1)&&port.FStatus===1
    &&(port.FPortIndex===undefined||port.FPortIndex===target.native_index)&&dom?.getAttribute('data-tid')===tid
    &&roots[0].contains(dom)&&exact(tid).filter(e=>roots[0].contains(e)).length===1,'port_binding_changed');
   const images=[...dom.querySelectorAll('image')],icon=images.length===1?(images[0].getAttribute('href')??images[0].getAttribute('xlink:href'))?.split('/').at(-1):null;
   need(target.kind==='tree'?images.length===1&&typeof icon==='string':['output_table_active.svg','output_table_active_no_automapping.svg'].includes(icon),'inactive_output');
   const trees=['ConsoleForm','MF;ConsoleForm'].flatMap(prefix=>exact(prefix+';ProgressForm;trpProgress;treepanel;tree'));
   need(trees.length===1,'execution_tree');
   const store=Ext.getCmp(trees[0].id)?.getStore(),root=store?.getRoot();
   need(store&&!store.isLoading()&&root?.data.loaded===true,'execution_store');
   const prefix=b.document_id+':';need(q.execution.execution_id.startsWith(prefix),'foreign_execution');
   const parts=q.execution.execution_id.slice(prefix.length).split(':');
   need(parts.length===2&&String(root.internalId)===parts[0]&&/^[1-9][0-9]*$/.test(parts[1]),'execution_root_changed');
   const records=[],parents=new Map(),seen=new Set();
   const walk=parent=>{need(Array.isArray(parent.childNodes),'process_children');for(const r of parent.childNodes){need(!seen.has(r)&&records.length<2000&&!r.data.loading,'process_bound');seen.add(r);records.push(r);parents.set(r,parent);walk(r);}};walk(root);
   const groups=records.filter(r=>String(r.data.id)===parts[1]);
   need(groups.length===1&&parents.get(groups[0])===root&&groups[0].data.Status===3&&groups[0].data.ErrorDetails===''&&groups[0].data.loaded===true,'execution_incomplete');
   const own=records.filter(r=>r.data.ModelNode===node.data),children=own.filter(r=>String(r.data.id)===q.execution.process_id&&String(r.internalId)===q.execution.process_record_id);
   need(children.length===1&&children[0].data.Status===3&&children[0].data.ErrorDetails===''
    &&String(children[0].data.id).startsWith(parts[1]+'.')&&!own.some(r=>BigInt(String(r.data.id).split('.')[0])>BigInt(parts[1])),'stale_execution');
   let ancestor=parents.get(children[0]);while(ancestor&&ancestor!==groups[0])ancestor=parents.get(ancestor);need(ancestor===groups[0],'execution_owner');
   const relevant=[groups[0],...own];
   return {prep,receipt,tab:tabs[0],workflow,packageNode,model,diagram,node,nodeData:node.data,nodeCell:node.FCell,port,portData:port.data,portCell:port.FCell,portGuid:port.FGuid,
    portSubtype:port.FSubType,nodeSession:value(node.data,'$S'),nodeIdentity:value(node.data,'$'),nodeOwner:value(value(node.data,'$'),'$OW'),nodeObject:value(value(node.data,'$'),'$O'),
    portSession:value(port.data,'$S'),portIdentity:value(port.data,'$'),portOwner:value(value(port.data,'$'),'$OW'),portObject:value(value(port.data,'$'),'$O'),
    store,root,records:relevant.map(r=>r),fingerprint:JSON.stringify(relevant.map(r=>[r.internalId,r.data.id,r.data.Status,r.data.ErrorDetails,r.data.loaded,r.data.ModelNode===node.data]))};
  };
  const same=(a,b)=>Object.keys(a).every(k=>k==='records'?a.records.length===b.records.length&&a.records.every((r,i)=>r===b.records[i]):a[k]===b[k]);
  const source=()=>{
   const helper=value(dataSource,'$FHelper'),identity=value(dataSource,'$'),outputIdentity=value(output,'$');
   need(identity&&value(identity,'$I')===(target.kind==='tree'?141:116)
    &&(target.kind==='tree'||helper&&value(helper,'FBaseProxy')===dataSource),'source_binding');
   need(value(dataSource,'$S')===value(baseline.nodeData,'$S')&&value(output,'$S')===value(dataSource,'$S'),'source_session');
   need(Number.isInteger(value(identity,'$OW'))&&Number.isInteger(value(identity,'$O'))&&outputIdentity,'source_identity');
   return {helper,identity,session:value(dataSource,'$S'),owner:value(identity,'$OW'),object:value(identity,'$O'),outputIdentity,outputOwner:value(outputIdentity,'$OW'),outputObject:value(outputIdentity,'$O')};
  };
  const stable=()=>{need(same(baseline,snapshot()),'binding_changed');if(sourceBaseline){need(same(sourceBaseline,source()),'source_changed');if(!cacheBaseline&&value(sourceBaseline.helper,'$FCacheInitialized')===true)cacheBaseline={data:value(sourceBaseline.helper,'$FData'),initialized:true};}if(cacheBaseline)need(value(sourceBaseline.helper,'$FData')===cacheBaseline.data&&value(sourceBaseline.helper,'$FCacheInitialized')===cacheBaseline.initialized,'cache_changed');};
  try {
   live();baseline=snapshot();
   output=await baseline.portData.get_Output();live();stable();
   dataSource=await output.QueryInterface(target.kind==='tree'?bg.IBGDataTree:bg.IBGDataSource);live();sourceBaseline=source();stable();
   if(target.kind==='tree'){
    need(q.rowOffset===undefined,'tree_row_offset');
    const call=async read=>{live();stable();const result=await read();live();stable();return result;};
    const tree=await readTree(dataSource,call,proxy=>{items.push(proxy);return proxy;},decode);
    result={port:q.port,port_guid:baseline.portGuid,port_kind:'tree',fresh:true,execution_id:q.execution.execution_id,
     freshness_basis:'completed_execution_port_source',tree,sample_complete:true};
   }else{
   const rowCount=await dataSource.get_RowCount();live();stable();
   need(Number.isSafeInteger(rowCount)&&rowCount>=0,'row_count');
   const offset=q.rowOffset??0;
   need(offset<=rowCount,'row_offset');
   columns=await dataSource.get_Columns();live();stable();
   const total=await columns.get_Count();live();stable();need(Number.isInteger(total)&&total>0&&total<=10000,'column_count');
   const schema=[],types={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string',6:'variant'};
   for(let index=0;index<total;index++){
    const column=await columns.getItem(index);items.push(column);live();stable();
    const name=await column.get_Name();live();stable();
    const label=await column.get_DisplayName();live();stable();
    const type=types[await column.get_DataType()];live();stable();
    need(typeof name==='string'&&typeof label==='string'&&name.length<=16384&&label.length<=16384&&type,'column_metadata');
    schema.push({index,name,label,type});
   }
   const sample=[],values=[],limits=new Set(),requested=Math.min(rowCount-offset,q.sampleRows,Math.floor(10000/total));
   // Private opt-in: existing ordinary reads, including Variant NULL and the
   // full Collapse/CrossTable path, keep their previous envelopes and calls.
   const exactVariants=q.typedVariants===true&&requested>0&&schema.some(c=>c.type==='variant');
   const nativeDecode=exactVariants?eval('('+variant.decode+')'):null,adaptNative=exactVariants?eval('('+variant.adapt+')'):null;
   if(exactVariants)nativeReader=await eval('('+variant.read+')')(dataSource,{deadline:o.deadline,stable:()=>{live();stable();}},nativeDecode,eval('('+variant.collect+')'),variant.pins);
   const moda=quality?await eval('('+quality.read+')')({source:dataSource,node:baseline.node,port:baseline.port,portIndex:q.port,rowCount,rows:requested,schema,bindingId:quality.binding_id,deadline:o.deadline,stable:()=>{live();stable();}},eval('('+quality.decode+')')):null;
   const helper=sourceBaseline.helper;
   let limited=requested<Math.min(rowCount-offset,q.sampleRows);
   for(let row=offset;row<offset+requested;row++){
    const rawValues=[],nativeCells=[];
    for(let column=0;column<total;column++){
     if(exactVariants&&schema[column].type==='variant'){
      const cell=await nativeReader.read(row,column);
      nativeCells[column]=adaptNative(cell,schema[column],{dateProfile:'loginom-7.4.2-native-oadate',civilTime:cell.civilTime},nativeDecode);
      rawValues.push(null);continue;
     }
     live();stable();const raw=quality&&column===8?null:await dataSource.AsVariant(row,column);live();stable();
     need(value(helper,'$FCacheInitialized')===true&&value(helper,'$FData'),'cache_uninitialized');
     rawValues.push(raw);
    }
    // Settle every started full-text RPC before refusing or disposing its column.
    const fullValues=await Promise.allSettled(rawValues.map(async(raw,column)=>{
     if(!['string','variant'].includes(schema[column].type)||typeof raw!=='string'||raw.length<5000&&!raw.endsWith('…'))return raw;
     live();stable();const full=await items[column].AsString(row);live();stable();
     need(typeof full==='string','string_value');return full;
    }));
    need(fullValues.every(item=>item.status==='fulfilled'),'cell_read_failed');
    const decoded=fullValues.map((item,column)=>nativeCells[column]?{cell:nativeCells[column],limitations:[]}:quality&&column===8?{cell:moda[row],limitations:[]}:decode(item.value,schema[column].type)),cells=decoded.map(item=>item.cell);
    const rowValues=cells.map(c=>c.value??c.display_text??null);
    if(new TextEncoder().encode(JSON.stringify([...values,rowValues])).length>512*1024){limited=true;break;}
    need(!q.requireExactNumbers||decoded.every(item=>item.limitations.length===0),'unverified_precision');
    decoded.forEach(item=>item.limitations.forEach(limit=>limits.add(limit)));
    values.push(rowValues);sample.push(cells);
   }
   live();stable();
   result={port:q.port,port_guid:baseline.portGuid,fresh:true,execution_id:q.execution.execution_id,freshness_basis:'completed_execution_port_source',schema,row_count:rowCount,sample,sample_rows:sample.length,sample_complete:offset===0&&sample.length===rowCount,
    precision:{numbers_verified:!limits.has('numeric_display_precision')&&!limits.has('variant_display_precision'),limitations:[...limits],strings:'data source text; existing secret redaction applies; original byte encoding is not attested'},...(limited?{read_limit:'preview_cell_or_byte_budget'}: {})};
   // Private cold windows carry their range and completed execution binding.
   // The ordinary model read omits rowOffset and keeps its existing bytes.
   if(q.rowOffset!==undefined)Object.assign(result,{row_offset:offset,next_row_offset:offset+sample.length,
    window_binding:{document_id:b.document_id,workflow_id:b.workflow_ref.workflow_id,node_id:b.node.node_id,
     execution_id:q.execution.execution_id,process_id:q.execution.process_id,process_record_id:q.execution.process_record_id}});
   }
   need(new TextEncoder().encode(JSON.stringify(result)).length<=(target.kind==='tree'?1024*1024:4*1024*1024),'response_byte_budget');
  }catch(error){qualityNativeUncertain=error?.qualityNativeUncertain===true;if(reason==='read_failed'&&error?.message?.startsWith('Variant read:'))reason=error.message;if(reason==='read_failed'&&target.kind==='tree'&&/^(?:tree_|integer_|unsupported_type)/.test(error?.message??''))reason=error.message;readDiagnostic=error?.treeReadDiagnostic;result=undefined;
  }finally{
   // A timed-out fixed321 request still owns its buffers. Retain its source
   // handles until the owning browser is closed; never claim native cancel.
   if(!nativeReader?.unsettled)for(const proxy of [...items.reverse(),columns,dataSource,output])if(proxy)try{await proxy.dispose();}catch{released=false;}
  }
  let context=false;try{context=!!baseline&&same(baseline,snapshot());}catch{}
  if(nativeReader?.unsettled)return {verified:false,cleanup_complete:false,reason:'variant_native_pending'};
  if(qualityNativeUncertain)return {verified:false,cleanup_complete:false,reason:'quality_native_pending'};
  if(!released||!context)return {verified:false,cleanup_complete:false,reason:released?'context_changed':'dispose_failed'};
  if(!result)return {verified:false,cleanup_complete:true,reason,...(readDiagnostic?{read_diagnostic:readDiagnostic}:{})};
  return {verified:true,cleanup_complete:true,output:result};
 },{binding,request,options,before,target,decoder:decodeCell.toString(),treeReader:treeReader.toString(),quality,variant});
 const after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,cleanup_complete:false,reason:'node_context_changed'};
 return result.verified?{...result,node_context:after}:result;
}
