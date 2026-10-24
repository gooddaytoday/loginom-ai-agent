import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
import {readOutputContext} from './node-output-context.mjs';

export function makeNodePortOutputCode(binding,request,options) {
 validatePreparedNodeContext(binding);
 if(!request||Object.keys(request).sort().join(',')!=='execution,port,requireExactNumbers,sampleRows'
  ||!Number.isInteger(request.port)||request.port<0||request.port>99
  ||!Number.isInteger(request.sampleRows)||request.sampleRows<0||request.sampleRows>100
  ||typeof request.requireExactNumbers!=='boolean'
  ||request.execution?.verified!==true||request.execution.owner_verified!==true||request.execution.status!=='completed'
  ||typeof request.execution.execution_id!=='string'||typeof request.execution.process_id!=='string'||typeof request.execution.process_record_id!=='string'
  ||!options||Object.keys(options).sort().join(',')!=='build,deadline,origin'
  ||typeof options.origin!=='string'||typeof options.build!=='string'||!Number.isSafeInteger(options.deadline))throw Error('Exact bounded completed port read required');
 return `async page=>(${readNodePortOutput.toString()})(page,${JSON.stringify(binding)},${JSON.stringify(request)},${JSON.stringify(options)},${readPreparedNodeContext.toString()},${readOutputContext.toString()})`;
}

// One dispatch retains native identity and owns only the proxies acquired here.
export async function readNodePortOutput(page,binding,request,options,readNode=readPreparedNodeContext,readOutputs=readOutputContext) {
 const before=await readNode(page,binding);
 if(before.verified!==true||before.surface!=='graph')return {verified:false,cleanup_complete:false,reason:'node_context'};
 const inventory=await readOutputs(page,binding,readNode);
 const target=inventory.ports?.find(p=>p.index===request.port);
 if(!inventory.verified||JSON.stringify(inventory.node_context)!==JSON.stringify(before))return {verified:false,cleanup_complete:false,reason:'output_context'};
 if(!target?.active)return {verified:false,cleanup_complete:true,reason:'inactive_output'};
 const result=await page.evaluate(async ({binding:b,request:q,options:o,before,target})=>{
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
   const port=ports[0],dom=graph.view.getState(port.FCell)?.shape?.node,tid=before.tid+';Output_Data-'+target.native_index;
   need(port.parent===node&&port.data&&port.FType===1&&port.FSubType===1&&port.FParam===0&&port.FStatus===1
    &&(port.FPortIndex===undefined||port.FPortIndex===target.native_index)&&dom?.getAttribute('data-tid')===tid
    &&roots[0].contains(dom)&&exact(tid).filter(e=>roots[0].contains(e)).length===1,'port_binding_changed');
   const images=[...dom.querySelectorAll('image')],icon=images.length===1?(images[0].getAttribute('href')??images[0].getAttribute('xlink:href'))?.split('/').at(-1):null;
   need(['output_table_active.svg','output_table_active_no_automapping.svg'].includes(icon),'inactive_output');
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
    nodeSession:value(node.data,'$S'),nodeIdentity:value(node.data,'$'),nodeOwner:value(value(node.data,'$'),'$OW'),nodeObject:value(value(node.data,'$'),'$O'),
    portSession:value(port.data,'$S'),portIdentity:value(port.data,'$'),portOwner:value(value(port.data,'$'),'$OW'),portObject:value(value(port.data,'$'),'$O'),
    store,root,records:relevant.map(r=>r),fingerprint:JSON.stringify(relevant.map(r=>[r.internalId,r.data.id,r.data.Status,r.data.ErrorDetails,r.data.loaded,r.data.ModelNode===node.data]))};
  };
  const same=(a,b)=>Object.keys(a).every(k=>k==='records'?a.records.length===b.records.length&&a.records.every((r,i)=>r===b.records[i]):a[k]===b[k]);
  const source=()=>{
   const helper=value(dataSource,'$FHelper'),identity=value(dataSource,'$'),outputIdentity=value(output,'$');
   need(helper&&value(helper,'FBaseProxy')===dataSource&&identity&&value(identity,'$I')===116,'source_binding');
   need(value(dataSource,'$S')===value(baseline.nodeData,'$S')&&value(output,'$S')===value(dataSource,'$S'),'source_session');
   need(Number.isInteger(value(identity,'$OW'))&&Number.isInteger(value(identity,'$O'))&&outputIdentity,'source_identity');
   return {helper,identity,session:value(dataSource,'$S'),owner:value(identity,'$OW'),object:value(identity,'$O'),outputIdentity,outputOwner:value(outputIdentity,'$OW'),outputObject:value(outputIdentity,'$O')};
  };
  const stable=()=>{need(same(baseline,snapshot()),'binding_changed');if(sourceBaseline)need(same(sourceBaseline,source()),'source_changed');if(cacheBaseline)need(value(sourceBaseline.helper,'$FData')===cacheBaseline.data&&value(sourceBaseline.helper,'$FCacheInitialized')===cacheBaseline.initialized,'cache_changed');};
  try {
   live();baseline=snapshot();
   output=await baseline.portData.get_Output();live();stable();
   dataSource=await output.QueryInterface(bg.IBGDataSource);live();sourceBaseline=source();stable();
   const rowCount=await dataSource.get_RowCount();live();stable();
   need(Number.isSafeInteger(rowCount)&&rowCount>=0,'row_count');
   columns=await dataSource.get_Columns();live();stable();
   const total=await columns.get_Count();live();stable();need(Number.isInteger(total)&&total>0&&total<=10000,'column_count');
   const schema=[],types={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string',6:'variant'};
   for(let index=0;index<total;index++){
    const column=await columns.getItem(index);items.push(column);live();stable();
    const name=await column.get_Name(),label=await column.get_DisplayName(),type=types[await column.get_DataType()];
    live();stable();need(typeof name==='string'&&typeof label==='string'&&name.length<=16384&&label.length<=16384&&type,'column_metadata');
    schema.push({index,name,label,type});
   }
   const sample=[],values=[],requested=Math.min(rowCount,q.sampleRows,Math.floor(10000/total));
   const helper=sourceBaseline.helper;
   if(value(helper,'$FCacheInitialized')===true)cacheBaseline={data:value(helper,'$FData'),initialized:true};
   let limited=requested<Math.min(rowCount,q.sampleRows);
   for(let row=0;row<requested;row++){
    const cells=[];
    for(let column=0;column<total;column++){
     live();stable();const raw=await dataSource.AsVariant(row,column);live();stable();
     if(!cacheBaseline){need(value(helper,'$FCacheInitialized')===true&&value(helper,'$FData'),'cache_uninitialized');cacheBaseline={data:value(helper,'$FData'),initialized:true};}
     const type=schema[column].type;
     if(raw===null||raw===undefined){cells.push({type,is_null:true,value:null,precision:'exact_null'});continue;}
     if(type==='integer'){
      need(typeof raw==='number'?Number.isSafeInteger(raw):['Int64','UInt64'].includes(raw?.constructor?.name),'integer_value');
      const text=raw.toString();need(/^-?(?:0|[1-9][0-9]*)$/.test(text),'integer_text');
      cells.push({type,is_null:false,value:text,representation:'decimal_integer',precision:'exact_integer'});continue;
     }
     if(type==='real'){
      need(typeof raw==='number'&&Number.isFinite(raw),'unsupported_real');
      cells.push({type,is_null:false,value:raw,decimal:Object.is(raw,-0)?'-0':String(raw),representation:'binary64',precision:'17_significant_digits'});continue;
     }
     need(type==='string'&&typeof raw==='string','unsupported_type');
     // Long cached strings require the separately tested scalar extension (Task 2).
     need(raw.length<5000&&!raw.endsWith('…'),'unsupported_long_string');
     cells.push({type,is_null:false,value:raw,representation:'data_source_string',precision:'source_text'});
    }
    need(new TextEncoder().encode(JSON.stringify(cells)).length<=2*1024*1024,'temporary_byte_budget');
    const rowValues=cells.map(c=>c.value);
    if(new TextEncoder().encode(JSON.stringify([...values,rowValues])).length>512*1024){limited=true;break;}
    values.push(rowValues);sample.push(cells);
   }
   live();stable();
   result={port:q.port,port_guid:baseline.portGuid,fresh:true,execution_id:q.execution.execution_id,freshness_basis:'completed_execution_port_source',schema,row_count:rowCount,sample,sample_rows:sample.length,sample_complete:sample.length===rowCount,
    precision:{numbers_verified:true,limitations:[],strings:'data source text; existing secret redaction applies; original byte encoding is not attested'},...(limited?{limitations:['preview_cell_or_byte_budget']}: {})};
   need(new TextEncoder().encode(JSON.stringify(result)).length<=4*1024*1024,'response_byte_budget');
  }catch{result=undefined;
  }finally{
   for(const proxy of [...items.reverse(),columns,dataSource,output])if(proxy)try{await proxy.dispose();}catch{released=false;}
  }
  let context=false;try{context=!!baseline&&same(baseline,snapshot());}catch{}
  if(!released||!context)return {verified:false,cleanup_complete:false,reason:released?'context_changed':'dispose_failed'};
  if(!result)return {verified:false,cleanup_complete:true,reason};
  return {verified:true,cleanup_complete:true,output:result};
 },{binding,request,options,before,target});
 const after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,cleanup_complete:false,reason:'node_context_changed'};
 return result.verified?{...result,node_context:after}:result;
}
