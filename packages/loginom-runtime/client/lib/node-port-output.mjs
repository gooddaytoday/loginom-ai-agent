import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
import {readOutputContext} from './node-output-context.mjs';

// The native reader indexes the ordered list passed to GetReader; array row
// ranges are bound to their parent row, rather than inferred from leaf counts.
export async function readTreePortSource(source,call,track,decode) {
 const need=(ok,reason)=>{if(!ok)throw Error(reason);};
 const schema=[],definitions=[];
 const rpc=async(name,fn)=>{try{return await call(fn);}catch(error){
  if(/^(?:tree_|integer_|unsupported_type)/.test(error?.message??''))throw error;throw Error('tree_rpc_'+name);
 }};
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
  need(type&&(!['variant','datetime'].includes(type)),'tree_scalar_type');
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
   const start={$:0},size={$:0};await rpc('row_range',()=>reader.GetRowRange(index,row,start,size));
   need(Number.isSafeInteger(start.$)&&start.$>=0&&Number.isSafeInteger(size.$)&&size.$>=0
    &&size.$<=256-nodeCount&&Number.isSafeInteger(start.$+size.$),'tree_instance_limit');
   const children=[];
   for(let i=0;i<size.$;i++)children.push(await instance(index,start.$+i,path+'/'+i,depth+1,true));
   const value={schema_index:index,path,type:'array',children};bytes(value);return value;
  }
  if(def.is_container){
   need(await rpc('container',()=>reader.GetContainerExists(index,row))===true,'tree_absent_container');
   const children=[];
   for(const child of def.children)children.push(await instance(child,row,path+'/'+pointer(schema[child].name),depth+1));
   const value={schema_index:index,path,type:'object',children};bytes(value);return value;
  }
  const decoded=decode(await rpc('value',()=>reader.AsVariant(index,row)),def.type);
  need(decoded.limitations.length===0,'tree_unverified_precision');
  const value={schema_index:index,path,...decoded.cell};bytes(value);return value;
 };
 const rows=await rpc('row_count',()=>reader.GetRowCount(0));need(rows===1,'tree_document_count');
 const document=await instance(0,0,'',0);
 const instances=[];
 const flatten=(node,parent)=>{
  const {children,...value}=node,index=instances.length,record={index,parent,...value,...(children?{children:[]}: {})};
  instances.push(record);if(children)for(const child of children)record.children.push(flatten(child,index));return index;
 };flatten(document,null);
 const result={schema,instances,complete:true,node_count:nodeCount,max_depth:maxDepth,
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

export function makeNodePortOutputCode(binding,request,options) {
 validatePreparedNodeContext(binding);
 if(!request||!['execution,port,requireExactNumbers,sampleRows','execution,port,requireExactNumbers,rowOffset,sampleRows'].includes(Object.keys(request).sort().join(','))
  ||!Number.isInteger(request.port)||request.port<0||request.port>99
  ||!Number.isInteger(request.sampleRows)||request.sampleRows<0||request.sampleRows>100
  ||Object.hasOwn(request,'rowOffset')&&(!Number.isSafeInteger(request.rowOffset)||request.rowOffset<0)
  ||typeof request.requireExactNumbers!=='boolean'
  ||request.execution?.verified!==true||request.execution.owner_verified!==true||request.execution.status!=='completed'
  ||typeof request.execution.execution_id!=='string'||typeof request.execution.process_id!=='string'||typeof request.execution.process_record_id!=='string'
  ||!options||Object.keys(options).sort().join(',')!=='build,deadline,origin'
  ||typeof options.origin!=='string'||typeof options.build!=='string'||!Number.isSafeInteger(options.deadline))throw Error('Exact bounded completed port read required');
 return `async page=>(${readNodePortOutput.toString()})(page,${JSON.stringify(binding)},${JSON.stringify(request)},${JSON.stringify(options)},${readPreparedNodeContext.toString()},${readOutputContext.toString()},${decodePortCell.toString()},${readTreePortSource.toString()})`;
}

// One dispatch retains native identity and owns only the proxies acquired here.
export async function readNodePortOutput(page,binding,request,options,readNode=readPreparedNodeContext,readOutputs=readOutputContext,decodeCell=decodePortCell,treeReader=readTreePortSource) {
 const before=await readNode(page,binding);
 if(before.verified!==true||before.surface!=='graph')return {verified:false,cleanup_complete:false,reason:'node_context'};
 const inventory=await readOutputs(page,binding,readNode);
 const target=inventory.ports?.find(p=>p.index===request.port);
 if(!inventory.verified||JSON.stringify(inventory.node_context)!==JSON.stringify(before))return {verified:false,cleanup_complete:false,reason:'output_context'};
 if(!target?.active)return {verified:false,cleanup_complete:true,reason:'inactive_output'};
 const result=await page.evaluate(async ({binding:b,request:q,options:o,before,target,decoder,treeReader})=>{
  const decode=eval(' ('+decoder+')'),readTree=eval(' ('+treeReader+')');
  const need=(ok,code)=>{if(!ok){reason=code;throw Error('Port read refused');}},value=(obj,key)=>Object.getOwnPropertyDescriptor(obj??{},key)?.value;
  const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
  const live=()=>need(Date.now()<o.deadline,'deadline');
  let baseline,sourceBaseline,cacheBaseline,output,dataSource,columns,result,reason='read_failed',released=true;
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
   const helper=sourceBaseline.helper;
   let limited=requested<Math.min(rowCount-offset,q.sampleRows);
   for(let row=offset;row<offset+requested;row++){
    const rawValues=[];
    for(let column=0;column<total;column++){
     live();stable();const raw=await dataSource.AsVariant(row,column);live();stable();
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
    const decoded=fullValues.map((item,column)=>decode(item.value,schema[column].type)),cells=decoded.map(item=>item.cell);
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
  }catch(error){if(reason==='read_failed'&&target.kind==='tree'&&/^(?:tree_|integer_|unsupported_type)/.test(error?.message??''))reason=error.message;result=undefined;
  }finally{
   for(const proxy of [...items.reverse(),columns,dataSource,output])if(proxy)try{await proxy.dispose();}catch{released=false;}
  }
  let context=false;try{context=!!baseline&&same(baseline,snapshot());}catch{}
  if(!released||!context)return {verified:false,cleanup_complete:false,reason:released?'context_changed':'dispose_failed'};
  if(!result)return {verified:false,cleanup_complete:true,reason};
  return {verified:true,cleanup_complete:true,output:result};
 },{binding,request,options,before,target,decoder:decodeCell.toString(),treeReader:treeReader.toString()});
 const after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,cleanup_complete:false,reason:'node_context_changed'};
 return result.verified?{...result,node_context:after}:result;
}
