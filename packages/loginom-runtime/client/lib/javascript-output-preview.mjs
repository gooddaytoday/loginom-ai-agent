import {captureManagedJavascriptSelection,makeJavascriptManagedSelectionReadCode} from './javascript-managed-selection.mjs';
import {captureJavascriptSelection} from './javascript-owned-selection.mjs';
import {inspectJavascriptVisualizers} from './javascript-output-context.mjs';
import {buildNodeReadRequest} from './node-read-contract.mjs';
const need=(value,message)=>{if(!value)throw Error(message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// Retained mappings admit the owner only. The caller must still read a newly
// opened, complete native preview; retained configuration is not fresh data.
export function managedJavascriptPreviewAdmission(history,binding,port){
 const owner=node=>['document_id','workflow_id','node_id'].every(k=>node?.[k]===binding.node[k]);
 need(binding.document_id===binding.node.document_id&&binding.workflow_ref.workflow_id===binding.node.workflow_id,
  'Managed JavaScript preview owner differs');
 need(Array.isArray(history),'Managed JavaScript history unavailable');
 const matches=history.filter(item=>owner(item.request?.target?.ref)||owner(item.outcome?.output?.node));
 need(matches.length>0&&matches.every(item=>Number.isSafeInteger(item.sequence))
  &&new Set(matches.map(item=>item.sequence)).size===matches.length,'Managed JavaScript history is ambiguous');
 const latest=matches.reduce((a,b)=>a.sequence>b.sequence?a:b),request=latest.request,node=latest.outcome?.output;
 need(request?.target?.type==='programming.javascript'&&latest.cleanup_confirmed===true
  &&latest.outcome?.status==='SUCCEEDED'&&latest.outcome.action_key==='node.apply'
  &&latest.outcome.operation_id===request.operation_id&&node?.operation_id===request.operation_id
  &&node.status==='SUCCEEDED'&&owner(node.node)&&request.document_id===binding.document_id
  &&request.workflow_ref?.workflow_id===binding.workflow_ref.workflow_id,
  'Latest managed JavaScript operation is not settled for this owner');
 const read=buildNodeReadRequest({operation_id:'preview-admission',source_operation_id:request.operation_id,read:{ports:[0]}},
  {parameters:request,outcome:latest.outcome});
 const outputs=node.output?.ports?.filter(p=>p.port===0),output=outputs?.[0],execution=node.execution?.execution_id;
 need(typeof execution==='string'&&execution.length>0&&node.output?.verified===true&&node.output.cleanup_complete===true
  &&node.output.execution_id===execution&&outputs?.length===1&&output.fresh===true&&output.execution_id===execution
  &&port.index===0&&port.native_index===0&&port.active===true&&output.port_guid===port.port_guid,
  'Managed JavaScript preview requires the same freshly executed native output zero');
 return {source_operation_id:request.operation_id,execution_id:execution,schema:read.parameters.schemas[0].schema};
}

// Browser-only, fixed output-port observer. Visualizers contributes native
// ownership checks only; neither its control nor Setting is used or opened.
export function inspectJavascriptPreviewPort({held,task,ticket=null,capture=false,allowPortRedraw=false},inspectOutput){
 const preparation=globalThis.__loginomDockPreparationV1,form=globalThis.bg?.app?.Application?.FInstance?.FMainForm;
 const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
 const tabs=exact(task.workflow_ref.tab_tid),roots=exact(task.workflow_ref.prefix+';ModelForm;cmpDiagram');
 if(preparation!==held.preparation||preparation?.id!==task.owner.document_id
  ||form?.FMapTree?.FServerConnection?.UserName!==held.account
  ||![...(preparation?.receipts?.values()??[])].includes(held.receipt)
  ||held.receipt.phase!=='verified'||held.receipt.workflowId!==task.owner.workflow_id
  ||held.receipt.nodeTargetWorkflowNode!==held.binding.workflow
  ||tabs.length!==1||tabs[0]!==held.tabElement||!tabs[0].classList.contains('x-tab-active')
  ||roots.length!==1||roots[0]!==held.graphRoot)throw Error('Managed preview account or preparation changed');
 inspectOutput({binding:{...held.binding,...held.retained},node:held.node,output:task.output,
  requireSelected:false,targetOrigin:task.targetOrigin,targetBuild:task.targetBuild});
 const graph=held.retained.graph,native=held.retained.native;
 if(native.FLocked===true)throw Error('Managed preview producer is locked');
 const port=native.FPorts.flatMap(list=>list.FCollection).find(p=>p.FGuid===task.output.port_guid);
 const shape=graph.view.getState(native.FCell)?.shape?.node,portElement=graph.view.getState(port.FCell)?.shape?.node;
 const selected=graph.getSelectionCells();
 const portRedrawn=ticket&&ticket.portElement!==portElement;
 if(port.FType!==1||port.FSubType!==1||task.output.native_index!==0
  ||port.FPortIndex!==undefined&&port.FPortIndex!==0
  ||!Array.isArray(selected)||selected.length>1||selected.length===1&&![native.FCell,port.FCell].includes(selected[0])
  ||ticket&&(ticket.shape!==shape||ticket.port!==port||ticket.portData!==port.data
   ||ticket.portCell!==port.FCell)
  ||portRedrawn&&!(allowPortRedraw&&ticket.portElementReplacements===0&&selected.length===1&&selected[0]===port.FCell
   &&ticket.portElement?.isConnected===false&&portElement?.isConnected===true))throw Error('Managed preview native port changed');
 const box=portElement.getBoundingClientRect(),point={x:box.x+box.width/2,y:box.y+box.height/2};
 const hit=document.elementFromPoint(point.x,point.y),interactive=hit?.closest('button,a,input,select,textarea,[role="button"],[role="menuitem"]');
 if(!Object.values(box).every(Number.isFinite)||box.width<=0||box.height<=0
  ||point.x<0||point.y<0||point.x>=innerWidth||point.y>=innerHeight
  ||getComputedStyle(portElement).display==='none'||portElement.closest('.x-item-disabled,.x-grid-row-disabled')
  ||portElement.getAttribute('aria-disabled')==='true'||!hit||!portElement.contains(hit)
  ||hit.closest('[data-tid]')!==portElement||interactive&&interactive!==portElement)
  throw Error('Managed preview port hit point unavailable');
 if(capture)return {shape,port,portData:port.data,portCell:port.FCell,portElement,portElementReplacements:0};
 // Selection redraws the port in Loginom 7.4.2. Rebind only our private ticket,
 // after the unchanged native owner and the current DOM/hit point are verified.
 if(portRedrawn){ticket.portElement=portElement;ticket.portElementReplacements++;}
 return {verified:true,node_id:task.owner.node_id,port_guid:port.FGuid,native_index:0,
  selected:selected.length===1&&selected[0]===port.FCell,point,execution_started:false,
  port_element_replacements:ticket?.portElementReplacements??0};
}

export async function runJavascriptOutputPreview(page,task,capture,inspect){
 const key=Symbol.for('loginom-dock.javascript-output-preview-v1'),leases=page[key]??=new Map();
 const identity=JSON.stringify([task.owner,task.workflow_ref,task.output,task.targetOrigin,task.targetBuild,task.deadline]);
 if(task.mode==='capture'){
  if(leases.has(task.operation_id)||leases.size>=8||Date.now()>=task.deadline)throw Error('Managed preview lease unavailable');
  const handle=await page.evaluateHandle(capture,task),lease={handle,identity};leases.set(task.operation_id,lease);
  try{
   lease.ticket=await page.evaluateHandle(inspect,{held:handle,task,capture:true});
   return await page.evaluate(inspect,{held:handle,ticket:lease.ticket,task});
  }catch(error){leases.delete(task.operation_id);try{await lease.ticket?.dispose();}finally{await handle.dispose();}throw error;}
 }
 const lease=leases.get(task.operation_id);
 if(!lease||lease.identity!==identity)throw Error('Managed preview lease changed');
 if(task.mode==='dispose'){
  leases.delete(task.operation_id);try{await lease.ticket.dispose();}finally{await lease.handle.dispose();}return {disposed:true};
 }
 if(Date.now()>=task.deadline)throw Error('Managed preview deadline expired');
 const args={held:lease.handle,ticket:lease.ticket,task};
 if(task.mode==='inspect')return page.evaluate(inspect,{...args,allowPortRedraw:lease.selectReturned===true&&!lease.openAttempted});
 if(!['select','open'].includes(task.mode)||lease[task.mode+'Attempted']||task.mode==='open'&&!lease.selectReturned)
  throw Error('Managed preview gesture already used or lease unavailable');
 const current=await page.evaluate(inspect,args);
 if(JSON.stringify(current)!==JSON.stringify(task.expected)||current.verified!==true
  ||task.mode==='open'&&current.selected!==true||Date.now()>=task.deadline)
  throw Error('Managed preview gesture snapshot changed');
 lease[task.mode+'Attempted']=true;
 if(task.mode==='select')await page.mouse.click(current.point.x,current.point.y);
 if(task.mode==='open'){
  const handle=await lease.ticket.getProperty('portElement'),element=handle.asElement();
  try{
   if(!element)throw Error('Managed preview native port element unavailable');
   await element.press('F3',{timeout:Math.max(1,task.deadline-Date.now())});
  }finally{await handle.dispose();}
 }
 lease[task.mode+'Returned']=true;
 return {status:'SUCCEEDED',action_key:'node.javascript.preview.'+task.mode+'.internal',action_revision:'1',
  operation_id:task.gesture_id,phase:'gesture_returned',effect_possible:true,cleanup_complete:task.mode==='select',
  output:{verified:true,node_context:task.owner,port_guid:task.output.port_guid,execution_started:false},error:null,trace:[]};
}

export function makeJavascriptOutputPreviewCode(task){
 const {mode,output,expected,gesture_id,...base}=task??{};
 makeJavascriptManagedSelectionReadCode({...base,mode:'inspect'});
 need(['capture','inspect','dispose','select','open'].includes(mode)
  &&same(Object.keys(output??{}).sort(),['active','index','native_index','port_guid'])
  &&output.index===0&&output.native_index===0&&output.active===true
  &&typeof output.port_guid==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(output.port_guid),
  'Invalid managed JavaScript preview task');
 if(['select','open'].includes(mode))need(typeof gesture_id==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(gesture_id)
  &&expected?.verified===true&&expected.node_id===base.owner.node_id&&expected.port_guid===output.port_guid
  &&expected.native_index===0&&Number.isFinite(expected.point?.x)&&Number.isFinite(expected.point?.y)
  &&(mode==='select'||expected.selected===true)&&JSON.stringify(expected).length<32768,
  'Invalid managed JavaScript preview gesture');
 else need(expected===undefined&&gesture_id===undefined,'Preview read cannot carry a gesture');
 const capture=`function capture(task){return (${captureManagedJavascriptSelection.toString()})(task,${captureJavascriptSelection.toString()});}`;
 const inspect=`function inspect(args){return (${inspectJavascriptPreviewPort.toString()})(args,${inspectJavascriptVisualizers.toString()});}`;
 return `async page=>(${runJavascriptOutputPreview.toString()})(page,${JSON.stringify(task)},${capture},${inspect})`;
}
