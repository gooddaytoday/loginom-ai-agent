import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
import {openPreparedOutputPort} from './node-port-open.mjs';

export function makeCrossTableVariablesCode(binding,options){
 validatePreparedNodeContext(binding);
 return `async page=>(${configureLocalVariables.toString()})(page,${JSON.stringify({binding,...options})},${readPreparedNodeContext.toString()},${openPreparedOutputPort.toString()})`;
}

export function makeCrossTableBindingsCode(binding,options){
 validatePreparedNodeContext(binding);
 return `async page=>(${bindLocalVariables.toString()})(page,${JSON.stringify({binding,...options})},${readPreparedNodeContext.toString()})`;
}
export async function bindLocalVariables(page,task,readNode){
 let effect=false;
 const remaining=()=>{const n=task.deadline-Date.now();if(n<=0)throw Error('CrossTable bindings deadline');return n;};
 const keys={limit:'pedSlidingUniqueValuesLimit',unique_names:'pedUniqueValueNames',separator:'pedDisplayNameSeparator'},proof=[];
 const inspect=(mode,extra)=>page.evaluate(({task,mode,extra})=>{
  const b=task.binding,p=globalThis.__loginomDockPreparationV1,a=globalThis.bg?.app,card=a?.Application.FInstance.FMainForm.Items.Workspace.getActiveTab(),m=card?.Controller?.FController,t=card?.Controller?.Node?.data?.node;
  const local=p?.crossTableLocalVariables?.get(b.node.node_id),roots=[...document.querySelectorAll('[data-tid='+JSON.stringify(b.workflow_ref.prefix+';WizrdMCF;CrossTabWizard')+']')];
  if(location.origin!==task.origin||a?.Version!==task.build||p?.document!==document||p.id!==b.document_id||!local||local.document_id!==b.document_id
   ||!(t instanceof a.WizardTreeNode)||!(t.ParentNode instanceof a.ModelNodeTreeNode)||t.ParentNode.FGuid!==b.node.node_id||t.ParentNode.ParentNode!==local.workflow
   ||m.FModelNode!==local.nodeData||roots.length!==1||!roots[0].checkVisibility({checkVisibilityCSS:true}))throw Error('Owned local variable binding wizard required');
  const matches=local.values.filter(v=>v.name===extra.name&&!v.is_null);if(matches.length!==1)throw Error('Local binding value required');const v=matches[0];
  const es=[...document.querySelectorAll('[data-tid='+JSON.stringify(extra.tid+';VariableControl')+']')],combo=es.length===1&&Ext.getCmp(es[0].id);
  if(!combo||combo.el.dom!==es[0]||!roots[0].contains(es[0]))throw Error('Owned variable combo required');
  const button=roots[0].querySelector('[data-tid='+JSON.stringify(extra.tid+';SwitchButton')+']'),nativeButton=button&&Ext.getCmp(button.id);
  if(nativeButton?.el.dom!==button)throw Error('Owned binding mode required');
  if(mode==='mode')return {pressed:nativeButton.pressed===true};
  const records=combo.getStore().getData().items,caption=v.label+' ( '+String(v.value)+' )',rs=records.filter(r=>r.data.field2===caption);
  if(rs.length!==1)throw Error('Exact local binding caption required');
  if(mode==='read'){
   if(nativeButton.pressed!==true||combo.getValue()!==rs[0].data.field1)throw Error('Selected local variable identity differs');
   return {property:extra.property,name:v.name,id:v.id,type:v.type,value:v.value,selected_proxy_equal:true};
  }
  const picker=combo.picker,item=picker?.getNode(rs[0]);
  if(!picker?.el.dom.checkVisibility({checkVisibilityCSS:true})||!item||picker.getRecord(item)!==rs[0])throw Error('Owned local binding picker required');
  const box=item.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2,hit=document.elementFromPoint(x,y);
  if(!(hit===item||item.contains(hit)))throw Error('Local binding rendered hit required');return {x,y};
 },{task,mode,extra});
 try{
  const before=await readNode(page,task.binding);if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)throw Error('Owned CrossTable node wizard required');
  for(const [property,ref] of Object.entries(task.bindings)){
   const tid=task.binding.workflow_ref.prefix+';WizrdMCF;CrossTabWizard;'+keys[property],extra={property,name:ref.variable,tid};
   const mode=await inspect('mode',extra);effect=true;
   if(!mode.pressed)await page.locator('[data-tid='+JSON.stringify(tid+';SwitchButton')+']:visible').click({timeout:remaining()});
   await inspect('mode',extra);await page.locator('[data-tid='+JSON.stringify(tid+';VariableControl;trg_picker')+']:visible').click({timeout:remaining()});
   const point=await inspect('picker',extra);await page.mouse.click(point.x,point.y);proof.push(await inspect('read',extra));
  }
  const after=await readNode(page,task.binding);if(JSON.stringify(after)!==JSON.stringify(before))throw Error('Binding owner changed');
  return {status:'SUCCEEDED',verified:true,effect_possible:effect,cleanup_complete:true,bindings:proof,node_context:after};
 }catch(error){return {status:effect?'AMBIGUOUS':'NOT_APPLIED',verified:false,effect_possible:effect,cleanup_complete:!effect,error:String(error.message).slice(0,500)};}
}

// This internal operation owns one control-variable wizard and its nested
// editor. Cached proxies are compared only by identity, never dereferenced.
export async function configureLocalVariables(page,task,readNode,openPort){
 let effect=false,phase='graph';
 const remaining=()=>{const n=task.deadline-Date.now();if(n<=0)throw Error('CrossTable variables deadline');return n;};
 const at=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']:visible');
 const b=task.binding,prefix=b.workflow_ref.prefix,root=prefix+';WizrdMCF',gridTid=root+';TuneVariablesMappingWizard;grdTargetColumns';
 const inspect=async(mode,extra={})=>page.evaluate(({task,mode,extra})=>{
  const b=task.binding,p=globalThis.__loginomDockPreparationV1,a=globalThis.bg?.app,card=a?.Application.FInstance.FMainForm.Items.Workspace.getActiveTab(),m=card?.Controller?.FController;
  const fail=s=>{throw Error('CrossTable variables: '+s);},visible=e=>e.checkVisibility({checkVisibilityCSS:true}),exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
  const cmp=t=>{const es=exact(t);return es.length===1&&Ext.getCmp(es[0].id)?.el.dom===es[0]?Ext.getCmp(es[0].id):null;};
  const rs=[...(p?.receipts?.values()??[])].filter(r=>r.phase==='verified'&&r.workflowId===b.workflow_ref.workflow_id&&r.nodeTargetWorkflowNode);
  if(location.origin!==task.origin||a?.Version!==task.build||p?.document!==document||p.id!==b.document_id||rs.length!==1)fail('document/workflow');
  const wf=rs[0].nodeTargetWorkflowNode,root=b.workflow_ref.prefix+';WizrdMCF',gridTid=root+';TuneVariablesMappingWizard;grdTargetColumns';
  const point=e=>{const box=e.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2,hit=document.elementFromPoint(x,y);if(!visible(e)||box.width<=0||box.height<=0||x<0||y<0||x>=innerWidth||y>=innerHeight||!(hit===e||e.contains(hit)))fail('rendered hit');return {x,y};};
  if(['graph','menu','graph_finished','leave_hover'].includes(mode)){
   if(!(m instanceof a.ModelForm)||card.Controller.Node.data.node!==wf||m.FDiagram?.FmxGraph?.container!==exact(b.workflow_ref.prefix+';ModelForm;cmpDiagram')[0])fail('graph');
   const ns=m.FDiagram.FNodes.FCollection.filter(n=>n.FGuid===b.node.node_id);if(ns.length!==1||ns[0].FLocked||ns[0].FIconCls!=='bg-vendor-icon-crosstab')fail('node');
   const n=ns[0],dom=m.FDiagram.FmxGraph.view.getState(n.FCell)?.shape?.node;
   if(!dom||!m.FDiagram.FmxGraph.container.contains(dom))fail('node drawing');
   if(mode==='graph_finished')return {graph:true};
   if(mode==='leave_hover'){const label=n.FLabel,ls=exact(dom.getAttribute('data-tid')+';Label;Label').filter(e=>m.FDiagram.FmxGraph.container.contains(e));
    if(label?.parent!==n||label.FCell?.parent!==n.FCell||ls.length!==1||m.FDiagram.FmxGraph.view.getState(label.FCell)?.text?.node!==ls[0])fail('owned hover dismissal label');return point(ls[0]);
   }
   if(mode==='menu'){
    const menu=m.FNodeContextMenu,roots=exact('mn').filter(visible),selected=m.FDiagram.FmxGraph.getSelectionCells();
    if(roots.length!==1||menu?.el.dom!==roots[0]||Ext.getCmp(roots[0].id)!==menu||selected.length!==1||selected[0]!==n.FCell&&selected[0]!==n.FLabel.FCell)fail('node menu '+JSON.stringify({roots:roots.length,native:menu?.el.dom===roots[0],component:roots.length===1&&Ext.getCmp(roots[0].id)===menu,selected:selected.length,selectedOwn:selected[0]===n.FCell}));
    const es=exact('mn;mniShowControlVariablesPort').filter(visible);
    if(es.length!==1||!roots[0].contains(es[0])||es[0].textContent!=='Показать порт управляющих переменных'||es[0].closest('.x-item-disabled,.x-menu-item-disabled'))fail('show command');
    return point(es[0]);
   }
   const ports=[...dom.querySelectorAll('[data-tid]')].filter(e=>e.getAttribute('data-tid')===dom.getAttribute('data-tid')+';Input_ControlVar');
   if(ports.length>1)fail('ambiguous control drawing');
   // Port drawings can be siblings of the body; search only this graph.
   const drawn=exact(dom.getAttribute('data-tid')+';Input_ControlVar').filter(e=>m.FDiagram.FmxGraph.container.contains(e)&&visible(e));
   if(drawn.length>1)fail('duplicate control drawing');
   if(drawn.length===1)return {visible:true};
   // A selected node's hover toolbar can cover its center. Sample only the
   // cached native body, rejecting every toolbar, label and neighbouring cell.
   const graph=m.FDiagram.FmxGraph,box=dom.getBoundingClientRect(),canvas=graph.container.getBoundingClientRect();
   for(const dx of [.5,.1,.9,.25,.75])for(const dy of [.5,.1,.9,.25,.75]){
    const x=box.x+box.width*dx,y=box.y+box.height*dy,hit=document.elementFromPoint(x,y);
    if(visible(dom)&&x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&(hit===dom||dom.contains(hit))
     &&hit.closest('[data-tid]')===dom&&graph.getCellAt(x-canvas.x,y-canvas.y)===n.FCell)return {visible:false,point:{x,y}};
   }
   fail('node body native hit');
  }
  const receipts=[...(p.inputPortOpenReceipts?.values()??[])].filter(r=>r.phase==='verified'&&r.operation_id===task.operation_id+':port'&&r.node_id===b.node.node_id&&r.workflow===wf&&r.wizard===m&&r.enginePort===m.FModelSocket);
  if(receipts.length!==1||card.Controller.Node.data.node.ParentNode!==receipts[0].portTree||m.FView?.el.dom!==exact(root)[0])fail('control wizard');
  const rec=receipts[0],grid=cmp(gridTid),store=grid?.getStore?.(),records=store?.getData?.()?.items;
  if(!grid||store?.isLoading?.()||!Array.isArray(records)||records.length>128||store.getCount()!==records.length)fail('control inventory');
  const describe=r=>{const d=r.data;if(!r.isModel||!Number.isSafeInteger(d.ID)||!Number.isSafeInteger(d.Index)||typeof d.Name!=='string'||!/^[_A-Za-z][_A-Za-z0-9]{0,127}$/.test(d.Name)||typeof d.DisplayName!=='string'||![1,4,5].includes(d.DataType)||d.OriginType!==1||d.ConnectedRecord!=null)fail('local variable record');return {id:d.ID,name:d.Name,label:d.DisplayName,type:d.DataType,value:d.DisplayValue,is_null:d.ValueIsNull};};
  if(mode==='inventory'||mode==='retain'){
   const values=records.map(describe);if(new Set(values.map(v=>v.name)).size!==values.length||new Set(values.map(v=>v.id)).size!==values.length)fail('duplicate variable');
   if(mode==='retain'){
    p.crossTableLocalVariables??=new Map();p.crossTableLocalVariables.set(b.node.node_id,{document_id:b.document_id,workflow:wf,nodeData:rec.nodeData,port:rec.port,portData:rec.portData,values});
   }
   return values;
  }
  if(mode==='row'){
   const matches=records.filter(r=>r.data.ID===extra.id&&r.data.Name===extra.name);if(matches.length!==1)fail('edit record');
   const item=grid.getView().getNode(matches[0]);if(!item||grid.getView().getRecord(item)!==matches[0])fail('edit row');if(extra.selected){const selected=grid.getSelectionModel().getSelection();if(selected.length!==1||selected[0]!==matches[0])fail('selected edit record');}return point(item);
  }
  if(mode==='button'){
   const e=exact(root+';'+extra.tid).filter(visible);if(e.length!==1||!exact(root)[0].contains(e[0])||e[0].closest('.x-item-disabled,.x-btn-disabled'))fail('wizard button');return point(e[0]);
  }
  if(mode==='cancel_confirmation'){
   const dialogs=[...document.querySelectorAll('[role="dialog"],.x-message-box')].filter(visible);
   if(dialogs.length!==1||dialogs[0].innerText.replace(/\s+/g,' ').trim()!=='Подтвердить Вы действительно хотите закрыть мастер настройки? Да Нет')fail('cancel confirmation');
   const es=exact('msgbox;tlb;yes').filter(visible);if(es.length!==1||!dialogs[0].contains(es[0])||es[0].textContent!=='Да')fail('cancel yes');return point(es[0]);
  }
  const dialogs=[...document.querySelectorAll('[role="dialog"],.x-window,.bg-dialog')].filter(visible),ds=exact('EditTuneVariableForm').filter(visible);
  if(ds.length!==1||dialogs.length!==1||ds[0]!==dialogs[0]||Ext.getCmp(ds[0].id)?.$className!=='bg.wizards.variables.view.EditVariableForm')fail('nested editor');
  if(extra.name!==undefined&&cmp('EditTuneVariableForm;edtName')?.getValue()!==extra.name||extra.type!==undefined&&cmp('EditTuneVariableForm;cbxDataType')?.getValue()!==extra.type)fail('editor identity');
  if(mode==='dialog')return true;
  if(mode==='type'){
   const combo=cmp('EditTuneVariableForm;cbxDataType'),picker=combo?.picker,matches=combo?.getStore().getData().items.filter(r=>r.data.Value===extra.value&&r.data.DisplayText===({1:'Логический',4:'Целый',5:'Строковый'})[extra.value]);
   if(matches?.length!==1||!picker?.el.dom||!visible(picker.el.dom))fail('type picker');const item=picker.getNode(matches[0]);if(!item||picker.getRecord(item)!==matches[0])fail('type record');return point(item);
  }
  if(mode==='boolean'){
   const tid='EditTuneVariableForm;pgcValue;radiogroup;radiofield'+(extra.value?'-1':''),radio=cmp(tid),e=exact(tid+';DisplayEl');
   if(radio?.$className!=='Ext.form.field.Radio'||radio.el.dom.textContent!==String(extra.value)||e.length!==1)fail('boolean value');return point(e[0]);
  }
  fail('mode');
 },{task,mode,extra});
 try{
  const before=await readNode(page,b);if(!before.verified||before.surface!=='graph'||before.locked)throw Error('Owned unlocked CrossTable graph required');
  // Selecting the exact native label dismisses the selected body's hover
  // toolbar. Moving the pointer alone leaves that toolbar over the body.
  const leave=await inspect('leave_hover');effect=true;await page.mouse.click(leave.x,leave.y);
  let graph;while(remaining()>0){try{graph=await inspect('graph');break;}catch(error){if(!String(error.message).includes('node body native hit'))throw error;await page.waitForTimeout(Math.min(100,remaining()));}}
  if(!graph.visible){phase='show_control_menu';effect=true;await page.mouse.click(graph.point.x,graph.point.y,{button:'right'});await at('mn;mniShowControlVariablesPort').waitFor({state:'visible',timeout:remaining()});const point=await inspect('menu');await page.mouse.click(point.x,point.y);}
  phase='open_control_port';
  const opened=await openPort(page,{...task,operation_id:task.operation_id+':port',direction:'input',kind:'control',port:0},readNode);
  effect ||= opened.effect_possible;if(opened.status!=='SUCCEEDED')throw Error(opened.error);
  phase='control_inventory';let values=await inspect('inventory');const baseline=structuredClone(values),changed=[];
  const click=async tid=>{const point=await inspect('button',{tid});effect=true;await page.mouse.click(point.x,point.y);};
  for(const v of task.variables){
   phase='edit_local_variable_'+v.name;
   const type={boolean:1,integer:4,string:5}[v.type],old=values.find(x=>x.name===v.name);
   if(old&&old.type!==type)throw Error('Existing local variable type differs');
   if(old&&!old.is_null&&old.value===v.value)continue;
   if(old){const point=await inspect('row',{id:old.id,name:old.name});await page.mouse.click(point.x,point.y);await inspect('row',{id:old.id,name:old.name,selected:true});await click('TuneVariablesMappingWizard;btnEditMappingColumn');}
   else await click('TuneVariablesMappingWizard;btnAddMappingColumn');
   await at('EditTuneVariableForm').waitFor({state:'visible',timeout:remaining()});await inspect('dialog',old?{name:v.name,type}:{});
   if(!old){await at('EditTuneVariableForm;cbxDataType;trg_picker').click({timeout:remaining()});const point=await inspect('type',{value:type});await page.mouse.click(point.x,point.y);}
   const fill=async(tid,text)=>{await inspect('dialog',old?{name:v.name,type}:{type});const input=at('EditTuneVariableForm;'+tid).locator('input:visible');if(await input.count()!==1)throw Error('Unique local variable input required');await input.fill(text,{timeout:remaining()});await input.press('Tab',{timeout:remaining()});};
   if(!old){await fill('edtName',v.name);await fill('edtDisplayName',v.name);}
   if(type===1){const point=await inspect('boolean',{name:v.name,type,value:v.value});await page.mouse.click(point.x,point.y);}
   else await fill(type===4?'pgcValue;Int64Field':'pgcValue;txt',String(v.value));
   await inspect('dialog',{name:v.name,type});await at('EditTuneVariableForm;btnApply').click({timeout:remaining()});
   await page.locator('[data-tid="EditTuneVariableForm"]').waitFor({state:'hidden',timeout:remaining()});
   await page.waitForFunction(({root,gridTid})=>{const e=document.querySelector('[data-tid='+JSON.stringify(root)+']'),g=document.querySelector('[data-tid='+JSON.stringify(gridTid)+']');return e?.checkVisibility({checkVisibilityCSS:true})&&!e.classList.contains('bg-mask-message')&&g&&Ext.getCmp(g.id).getStore().isLoading()===false;},{root,gridTid},{timeout:remaining()});
   values=await inspect('inventory');const now=values.find(x=>x.name===v.name);if(!now||now.type!==type||now.value!==v.value||now.is_null||old&&now.id!==old.id)throw Error('Local variable readback differs');changed.push(v.name);
  }
  for(const old of baseline.filter(x=>!task.variables.some(v=>v.name===x.name)))if(JSON.stringify(values.find(v=>v.id===old.id))!==JSON.stringify(old))throw Error('Unrequested variable changed');
  phase='finish_control_port';values=await inspect('retain');
  if(task.variables.length){await click('btnDone');}
  else{
   await click('btnClose');
   await page.waitForFunction(root=>!document.querySelector('[data-tid='+JSON.stringify(root)+']')?.checkVisibility({checkVisibilityCSS:true})
    ||[...document.querySelectorAll('[role="dialog"],.x-message-box')].some(e=>e.checkVisibility({checkVisibilityCSS:true})),root,{timeout:remaining()});
   if(await page.locator('[data-tid='+JSON.stringify(root)+']:visible').count()){
    const point=await inspect('cancel_confirmation');await page.mouse.click(point.x,point.y);
   }
  }
  await page.locator('[data-tid='+JSON.stringify(root)+']').waitFor({state:'hidden',timeout:remaining()});
  while(remaining()>0){try{await inspect('graph_finished');break;}catch{await page.waitForTimeout(Math.min(100,remaining()));}}
  const after=await readNode(page,b);if(!after.verified||after.surface!=='graph'||after.node_id!==b.node.node_id)throw Error('Control variables graph return');
  return {status:'SUCCEEDED',verified:true,effect_possible:effect,cleanup_complete:true,node_context:after,variables:values,changed,settings_changed:changed.length>0,settings_applied:task.variables.length>0,draft_discarded:task.variables.length===0};
 }catch(error){return {status:effect?'AMBIGUOUS':'NOT_APPLIED',verified:false,effect_possible:effect,cleanup_complete:!effect,error:(phase+': '+String(error.message)).slice(0,500)};}
}
