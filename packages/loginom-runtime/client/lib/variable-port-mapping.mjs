import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
import {openPreparedOutputPort} from './node-port-open.mjs';

export function validateVariablePortMapping(mapping){
 const need=(v,m)=>{if(!v)throw Error('Variable mapping: '+m);};
 need(mapping&&['variables','control'].includes(mapping.kind)&&mapping.direction==='input'&&Number.isInteger(mapping.port)&&mapping.port>=0&&mapping.port<100
  &&(mapping.kind!=='control'||mapping.port===0),'observed input variable/control port required');
 need(!(mapping.fields&&mapping.changes),'fields and changes are exclusive');
 const fields=mapping.fields??mapping.changes??[];
 need(fields.length<=128&&fields.every(f=>f.source?.kind==='configured_field'&&typeof f.source.name==='string'&&f.excluded!==true),'configured source names only; exclusion is unsupported');
}
export function makeVariablePortMappingCode(binding,options){
 validatePreparedNodeContext(binding);validateVariablePortMapping(options.mapping);
 return `async page=>{
  const run=${configureVariablePortMapping.toString()},read=${readPreparedNodeContext.toString()},open=${openPreparedOutputPort.toString()},task=${JSON.stringify({binding,...options})};
  const configured=await run(page,task,read,open);if(configured.status!=='SUCCEEDED')return configured;
  const observed=await run(page,{...task,operation_id:task.operation_id+':readback',read_only:true},read,open);
  if(observed.status!=='SUCCEEDED'||JSON.stringify(observed.mapping)!==JSON.stringify(configured.mapping))return {...observed,status:'AMBIGUOUS',verified:false,effect_possible:true,error:'Independent variable mapping readback differs'};
  return {...configured,node_context:observed.node_context,independent_readback:true};
 }`;
}

// Fixed native UI procedure. Only the owned input wizard is edited; cached
// ConnectedRecord identity is retained across every metadata/order gesture.
export async function configureVariablePortMapping(page,task,readNode,openPort){
 const b=task.binding,mapping=task.mapping,root=b.workflow_ref.prefix+';WizrdMCF',form=root+';TuneVariablesMappingWizard';let effect=false;
 const remaining=()=>{const n=task.deadline-Date.now();if(n<=0)throw Error('Variable mapping deadline');return n;};
 const at=t=>page.locator('[data-tid='+JSON.stringify(t)+']:visible');
 const inspect=(mode,extra={})=>page.evaluate(({task,mode,extra})=>{
  const b=task.binding,p=globalThis.__loginomDockPreparationV1,a=globalThis.bg?.app,card=a?.Application.FInstance.FMainForm.Items.Workspace.getActiveTab(),m=card?.Controller?.FController;
  const exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')],visible=e=>e.checkVisibility({checkVisibilityCSS:true});
  const rs=[...(p?.receipts?.values()??[])].filter(r=>r.phase==='verified'&&r.workflowId===b.workflow_ref.workflow_id&&r.nodeTargetWorkflowNode);
  const r=rs[0],o=[...(p?.inputPortOpenReceipts?.values()??[])].find(o=>o.phase==='verified'&&o.operation_id===task.operation_id+':port');
  const roots=exact(b.workflow_ref.prefix+';WizrdMCF'),form=b.workflow_ref.prefix+';WizrdMCF;TuneVariablesMappingWizard';
  const es=exact(form+';grdTargetColumns'),grid=es.length===1&&Ext.getCmp(es[0].id),store=grid?.getStore?.(),rows=store?.getData?.()?.items;
  if(location.origin!==task.origin||a?.Version!==task.build||p?.document!==document||p.id!==b.document_id||rs.length!==1||!o
   ||o.workflow!==r.nodeTargetWorkflowNode||o.node_id!==b.node.node_id||o.portIndex!==task.mapping.port||o.wizard!==m||o.enginePort!==m.FModelSocket
   ||o.port.FSubType!==(task.mapping.kind==='control'?4:3)||o.node.FGuid!==b.node.node_id||o.nodeData!==o.node.data||o.portData!==o.port.data
   ||card.Controller.Node.data.node.ParentNode!==o.portTree||o.portTree.FModelNodePort!==o.portData||o.nodeTree.FModelNode!==o.nodeData
   ||roots.length!==1||m.FView?.el.dom!==roots[0]||!grid||grid.el.dom!==es[0]||!roots[0].contains(es[0])
   ||store.isLoading()||!Array.isArray(rows)||rows.length>128||store.getCount()!==rows.length)throw Error('Owned complete variable mapping required');
  const fields=rows.map((row,index)=>{
   const d=row.data,s=d.ConnectedRecord?.data;
   if(!row.isModel||!Number.isSafeInteger(d.ID)||d.Index!==index||typeof d.Name!=='string'||typeof d.DisplayName!=='string'
     ||![1,4,5].includes(d.DataType)||![0,1].includes(d.OriginType)||typeof d.ValueIsNull!=='boolean'
     ||d.DisplayValue!==null&&!['string','number','boolean'].includes(typeof d.DisplayValue)
     ||s&&(!Number.isSafeInteger(s.ID)||typeof s.Name!=='string'||typeof s.DisplayName!=='string'||s.DataType!==d.DataType))throw Error('Unsupported variable mapping record');
   return {id:d.ID,index,name:d.Name,label:d.DisplayName,type:d.DataType,origin_type:d.OriginType,usage:d.UsageType,description:d.Description,
    value:d.DisplayValue,is_null:d.ValueIsNull,source:s?{id:s.ID,name:s.Name,label:s.DisplayName,type:s.DataType}:null};
  });
  if(new Set(fields.map(f=>f.id)).size!==fields.length||new Set(fields.map(f=>f.name)).size!==fields.length)throw Error('Duplicate variable mapping identities');
  o.variableMappingBindings??=new Map(rows.map(row=>[row.data.ID,row.data.ConnectedRecord]));
  if(rows.some(row=>o.variableMappingBindings.get(row.data.ID)!==row.data.ConnectedRecord))throw Error('Variable mapping source connection changed');
  const auto=exact(form+';btnAutoSyncThroughColumns'),button=auto.length===1&&Ext.getCmp(auto[0].id);
  if(button?.el.dom!==auto[0]||typeof button.pressed!=='boolean')throw Error('Variable autosync owner required');
  if(mode==='inventory')return {kind:task.mapping.kind,direction:'input',port:task.mapping.port,native_index:o.nativeIndex,port_guid:o.portGuid,
   count:fields.length,store_count:store.getCount(),unique_ids:new Set(fields.map(f=>f.id)).size,autosync:button.pressed,fields};
  const point=e=>{const box=e.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2,hit=document.elementFromPoint(x,y);
   if(!visible(e)||box.width<=0||box.height<=0||!(hit===e||e.contains(hit)))throw Error('Variable mapping control covered');return {x,y};};
  if(mode==='row'){
   const row=rows.find(row=>row.data.ID===extra.id),el=row&&grid.getView().getNode(row);
   if(!el||grid.getView().getRecord(el)!==row)throw Error('Owned variable mapping row required');return point(el);
  }
  if(mode==='button'){
   const es=exact(extra.tid).filter(visible),c=es.length===1&&Ext.getCmp(es[0].id);
   if(es.length!==1||!roots[0].contains(es[0])||c?.el.dom!==es[0]||c.disabled)throw Error('Owned variable mapping button required');return point(es[0]);
  }
  const dialogs=exact('EditTuneVariableForm').filter(visible),dialog=dialogs[0];
  const field=key=>{const es=exact('EditTuneVariableForm;'+key);return es.length===1&&Ext.getCmp(es[0].id)?.el.dom===es[0]?Ext.getCmp(es[0].id):null;};
  if(dialogs.length!==1||Ext.getCmp(dialog.id)?.$className!=='bg.wizards.variables.view.EditVariableForm'
   ||[...document.querySelectorAll('[role="dialog"],.x-window,.bg-dialog')].filter(visible).some(e=>e!==dialog)
   ||field('cbxDataType')?.getValue()!==extra.type||field('cbxNullValue')?.getValue()!==extra.is_null)throw Error('Owned variable metadata editor required');
  return true;
 },{task,mode,extra});
 const settle=async()=>{await page.waitForFunction(t=>{const e=document.querySelector('[data-tid='+JSON.stringify(t+';grdTargetColumns')+']'),g=e&&Ext.getCmp(e.id);
  return g?.getStore?.().isLoading()===false&&!document.querySelector('[data-tid='+JSON.stringify(t)+']')?.classList.contains('bg-mask-message');},form,{timeout:remaining()});};
 const click=async tid=>{const point=await inspect('button',{tid});await page.mouse.click(point.x,point.y);};
 try{
  let graph=await readNode(page,b);while(graph.surface_pending||graph.verified&&graph.locked){await page.waitForTimeout(Math.min(80,remaining()));graph=await readNode(page,b);}
  if(!graph.verified||graph.surface!=='graph'||graph.locked)throw Error('Owned variable mapping graph required');
  const opened=await openPort(page,{...task,direction:'input',kind:mapping.kind,port:mapping.port,operation_id:task.operation_id+':port'},readNode);
  effect=opened.effect_possible===true;if(opened.status!=='SUCCEEDED')throw Error(opened.error);
  await settle();const before=await inspect('inventory');let current=before;
  if(!task.read_only){
   const requested=mapping.fields??mapping.changes??[],all=mapping.fields!==undefined;
   const selected=requested.map(f=>{const xs=before.fields.filter(row=>row.source?.name===f.source.name);if(xs.length!==1)throw Error('Unique connected variable source required: '+f.source.name);return {...xs[0],name:f.name??xs[0].name,label:f.label??xs[0].label};});
   if(all&&(selected.length!==before.fields.length||selected.some(row=>!row.source)))throw Error('Complete connected field layout required; preserve local defaults with changes');
   const expected=before.fields.map(row=>selected.find(v=>v.id===row.id)??row);
   if(new Set(expected.map(row=>row.name)).size!==expected.length)throw Error('Requested variable names collide');
   for(const want of selected){
    const old=current.fields.find(f=>f.id===want.id);if(old.name===want.name&&old.label===want.label)continue;
    const point=await inspect('row',{id:want.id});await page.mouse.click(point.x,point.y);await click(form+';btnEditMappingColumn');
    await at('EditTuneVariableForm').waitFor({state:'visible',timeout:remaining()});
    for(const [key,value] of [['edtName',want.name],['edtDisplayName',want.label]]){
     await inspect('dialog',{type:want.type,is_null:want.is_null});const input=at('EditTuneVariableForm;'+key).locator('input:visible');
     if(await input.count()!==1)throw Error('Unique variable metadata input required');await input.fill(value,{timeout:remaining()});await input.press('Tab',{timeout:remaining()});
    }
    await inspect('dialog',{type:want.type,is_null:want.is_null});await at('EditTuneVariableForm;btnApply').click({timeout:remaining()});
    await page.locator('[data-tid="EditTuneVariableForm"]').waitFor({state:'hidden',timeout:remaining()});await settle();current=await inspect('inventory');
   }
   if(all)for(let destination=0;destination<selected.length;destination++){
    while(current.fields.findIndex(f=>f.id===selected[destination].id)>destination){
     const point=await inspect('row',{id:selected[destination].id});await page.mouse.click(point.x,point.y);await click(form+';btnMoveMappingColumnUp');
     await settle();const next=await inspect('inventory');if(next.fields.findIndex(f=>f.id===selected[destination].id)!==current.fields.findIndex(f=>f.id===selected[destination].id)-1)throw Error('Variable reorder not confirmed');current=next;
    }
   }
   if(mapping.autosync!==undefined&&current.autosync!==mapping.autosync){await click(form+';btnAutoSyncThroughColumns');await settle();current=await inspect('inventory');}
   const ordered=all?selected:expected;
   const wanted={...before,autosync:mapping.autosync??before.autosync,fields:ordered.map((row,index)=>({...row,index,origin_type:row.name!==before.fields.find(f=>f.id===row.id).name||row.label!==before.fields.find(f=>f.id===row.id).label?1:row.origin_type}))};
   if(JSON.stringify(wanted)!==JSON.stringify(current))throw Error('Variable mapping changed unrequested source/default/type/value state');
  }
  await click(root+(task.read_only?';btnClose':';btnDone'));
  await page.waitForFunction(root=>!document.querySelector('[data-tid='+JSON.stringify(root)+']')?.checkVisibility({checkVisibilityCSS:true})
    ||[...document.querySelectorAll('[role="dialog"],.x-message-box')].some(e=>e.checkVisibility({checkVisibilityCSS:true})),root,{timeout:remaining()});
  if(task.read_only&&await at(root).count()){
   const yes=at('msgbox;tlb;yes');if(await yes.count()!==1||!await page.evaluate(()=>[...document.querySelectorAll('[role="dialog"],.x-message-box')].filter(e=>e.checkVisibility({checkVisibilityCSS:true})).some(e=>e.innerText.replace(/\s+/g,' ').trim()==='Подтвердить Вы действительно хотите закрыть мастер настройки? Да Нет')))throw Error('Owned variable mapping cancellation required');await yes.click({timeout:remaining()});
  }
  await page.waitForFunction(root=>!document.querySelector('[data-tid='+JSON.stringify(root)+']')?.checkVisibility({checkVisibilityCSS:true})
   &&![...document.querySelectorAll('[role="dialog"],.bg-mask-message,.x-mask-msg')].some(e=>e.checkVisibility({checkVisibilityCSS:true})),root,{timeout:remaining()});
  graph=await readNode(page,b);while(graph.surface_pending||graph.verified&&graph.locked){await page.waitForTimeout(Math.min(80,remaining()));graph=await readNode(page,b);}
  if(!graph.verified||graph.surface!=='graph')throw Error('Variable mapping graph return unconfirmed');
  return {status:'SUCCEEDED',verified:true,effect_possible:effect,cleanup_complete:true,node_context:graph,mapping:current,source_identity_verified:true};
 }catch(error){return {status:effect?'AMBIGUOUS':'NOT_APPLIED',verified:false,effect_possible:effect,cleanup_complete:!effect,error:String(error.message).slice(0,500)};}
}
