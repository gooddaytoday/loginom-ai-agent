import {readPreparedNodeContext} from './node-context.mjs';
import {readNodeTargetLinkValidation} from './executor.mjs';
export const makeRestRequestCode=t=>`async page=>(${restRequestCapability.toString()})(page,${JSON.stringify(t)},${readPreparedNodeContext.toString()})`;
export const makeRestLinkCode=t=>`async page=>(${restLinkCapability.toString()})(page,${JSON.stringify(t)},${readNodeTargetLinkValidation.toString()})`;

export async function restLinkCapability(page,t,readValidation){
 let effect=false,held=false;
 try{
  const need=(v,m)=>{if(!v)throw Error('REST link: '+m);};
  const request={document_id:t.document_id,workflow_ref:t.workflow_ref};
  const nodes=await page.evaluate(t=>{
   const d=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController.FDiagram;
   return [t.connection.reference_node_id,t.node.node_id].map(id=>{
    const ns=d.FNodes.FCollection.filter(n=>n.FGuid===id);if(ns.length!==1)throw Error('REST link node changed');
    const tid=d.FmxGraph.view.getState(ns[0].FCell)?.shape?.node?.getAttribute('data-tid');if(!tid)throw Error('REST link node is not rendered');
    return {id,tid:tid.split(';Graph;')[1]};
   });
  },t);
  const context={request,dom_epoch:t.dom_epoch,nodes};
  const sourceTid=t.workflow_ref.prefix+';Graph;'+nodes[0].tid+';Output_Connection-0',targetTid=t.workflow_ref.prefix+';Graph;'+nodes[1].tid+';Input_Connection-0';
  const find=tid=>page.locator('[data-tid='+JSON.stringify(t.workflow_ref.prefix+';ModelForm;cmpDiagram')+']').locator('[data-tid='+JSON.stringify(tid)+']');
  const edgeTid=t.workflow_ref.prefix+';Graph;'+nodes[0].tid+'|Output_Connection-0|'+nodes[1].tid+'|Input_Connection-0';
  need(await page.locator('[data-tid*="|Input_Connection-0"]').evaluateAll((es,p)=>es.every(e=>!e.getAttribute('data-tid').endsWith(p.suffix)||e.getAttribute('data-tid')===p.tid),{tid:edgeTid,suffix:'|'+nodes[1].tid+'|Input_Connection-0'}),'connection input is occupied');
  if(await find(edgeTid).count()===1)return {verified:true,cleanup_complete:true,effect_possible:false,node_context:{...t.node,verified:true}};
  const point=async tid=>{need(await find(tid).count()===1,'port is ambiguous');return find(tid).evaluate(e=>{const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);if(!(r.width>0&&r.height>0&&hit&&(e===hit||e.contains(hit))))throw Error('REST link port is covered');return{x,y};});};
  const source=await point(sourceTid),target=await point(targetTid);
  need(Date.now()<t.deadline,'deadline elapsed');await page.mouse.move(source.x,source.y);effect=true;held=true;await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:16});
  const parameters={source_port:{kind:'connection',index:0},target_port:{kind:'connection',index:0}};
  let validation;
  do{need(Date.now()<t.deadline,'validation deadline elapsed');validation=await readValidation(page,context,parameters);need(validation.state!=='rejected','native compatibility rejected the ports');if(validation.state==='pending')await page.waitForTimeout(Math.min(50,t.deadline-Date.now()));}while(validation.state==='pending');
  await page.mouse.move(validation.point.x,validation.point.y);validation=await readValidation(page,context,parameters);need(validation.state==='ready'&&validation.target_ready,'native target marker is not ready');
  await page.mouse.up();held=false;
  while(await find(edgeTid).count()!==1){need(Date.now()<t.deadline,'connection edge did not settle');await page.waitForTimeout(Math.min(80,t.deadline-Date.now()));}
  need(await page.evaluate(t=>{const d=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController.FDiagram,g=d.FmxGraph;
   const port=(id,tid)=>d.FNodes.FCollection.filter(n=>n.FGuid===id).flatMap(n=>n.FPorts.flatMap(p=>p.FCollection)).filter(p=>g.view.getState(p.FCell)?.shape?.node?.getAttribute('data-tid')===tid);
   const s=port(t.connection.reference_node_id,t.sourceTid),p=port(t.node.node_id,t.targetTid);
   return s.length===1&&p.length===1&&s[0].FCell.edges?.filter(e=>e.source===s[0].FCell&&e.target===p[0].FCell&&g.view.getState(e)?.shape?.node?.getAttribute('data-tid')===t.edgeTid).length===1;
  },{...t,edgeTid,sourceTid,targetTid}),'native connection edge is unavailable');
  return {verified:true,cleanup_complete:true,effect_possible:true,node_context:{...t.node,verified:true}};
 }catch(error){return {verified:false,cleanup_complete:!effect,effect_possible:effect,error:String(error.message).slice(0,1000)};}
 finally{if(held)await page.mouse.up();}
}

export async function restRequestCapability(page,t,readContext){
 const need=(v,m)=>{if(!v)throw Error('REST request: '+m);};
 const remaining=()=>{const ms=t.deadline-Date.now();need(ms>0,'operation deadline exceeded');return ms;};
 const binding={document_id:t.document_id,workflow_ref:t.workflow_ref,node:t.node},root=t.workflow_ref.prefix+';WizrdMCF',base=root+';RESTRequestWizard;ParamLinks;';
 const find=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']');
 let effect=false;
 try{
  const guard=async()=>{remaining();const b=await readContext(page,binding);need(b.verified&&b.surface==='wizard'&&b.node_id===t.node.node_id,'owned node wizard changed');need(await page.evaluate(t=>location.origin===t.origin&&bg.app.Version===t.build,t),'target changed');return b;};
  const wait=async(label,read)=>{while(remaining()>0){await guard();const v=await read();if(v)return v;await page.waitForTimeout(Math.min(80,remaining()));}throw Error(label+' did not settle');};
  const quiet=()=>wait('wizard loading',()=>page.locator('.x-mask:visible,.x-mask-msg:visible,.bg-mask-message:visible,.x-window:visible').count().then(n=>n===0));
  const point=async tid=>{need(await find(tid).count()===1,'control is ambiguous');return find(tid).evaluate(e=>{const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);if(r.width<=0||r.height<=0||!hit||!(hit===e||e.contains(hit))||e.closest('.x-item-disabled,.x-btn-disabled'))throw Error('REST control is not reachable');return{x,y};});};
  const click=async tid=>{await quiet();await guard();const p=await point(tid);effect=true;await page.mouse.click(p.x,p.y);};
  const title=()=>find(root+';cardWizardPanel;p.h;p.t').innerText();
  const panel=()=>page.evaluate(()=>bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController.FCardLayout.getActiveItem().id);
  const advance=async()=>{const before=await panel();await click(root+';btnNext');await wait('wizard page transition',async()=>{
   const error=find(root+';btnError');if(await error.count()===1&&await error.isVisible())throw Error((await error.getAttribute('data-qtip'))??'Loginom refused this wizard page');
   return await panel()!==before;
  });await quiet();};
  while(!await find(root+';RESTRequestWizard;ParamLinks').isVisible()){
   need((await title()).trim()==='Настройка входных столбцов','unexpected page before request');await advance();
  }
  const read=async()=>{
   await guard();return page.evaluate(({root,base})=>{
    const c=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController,w=c.FWizardItems.map(w=>w.FWizard).find(w=>w.constructor.name==='RESTRequestWizard'),p=w?.FRequestConfig;
    const exact=tid=>document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']');
    if(!p||exact(root).length!==1||c.FView.el.dom!==exact(root)[0]||exact(base.slice(0,-1)).length!==1||p.FView.el.dom!==exact(base.slice(0,-1))[0]||!c.FCardLayout.getActiveItem().el.dom.contains(p.FView.el.dom)
     ||p.FItems.grdFields.getStore()!==p.FColumnsStore||p.FItems.grdParams.getStore()!==p.FGrdParamStore||p.FColumnsStore.loading||p.FGrdParamStore.loading||p.FRequestParamLinks.loading||p.FRequestParamLinks.complete!==true)throw Error('Native REST binding inventories are unavailable');
    const columnRows=p.FColumnsStore.getRange(),parameterRows=p.FParamStore.getRange();
    const columns=columnRows.map(r=>({name:r.data.Name,type:r.data.DataType,index:r.data.Index}));
    const parameters=parameterRows.map(r=>({name:r.data.Name,type:r.data.DataType}));
    // AutoLink changes the rendered draft; FRequestParamLinks still contains
    // the saved bindings until the wizard commits its page.
    const grid=p.FItems.pnlLinkGrid,draw=grid?.FLinkDrawContainer;
    if(!draw||draw.FOwner!==grid||!draw.FLinks||typeof draw.FLinks!=='object')throw Error('Native REST draft links are unavailable');
    const pairs=Object.values(draw.FLinks);
    if(pairs.length>32)throw Error('REST binding inventory exceeds bound');
    const links=pairs.map(pair=>{
     if(!Array.isArray(pair)||pair.length!==2||!columnRows.includes(pair[0])||!parameterRows.includes(pair[1]))throw Error('REST draft link records differ from the bound inventories');
     return {name:pair[1].data.Name,field:pair[0].data.Name};
    });
    if(columns.length>1000||parameters.length>32||links.length>32)throw Error('REST binding inventory exceeds bound');
    return {method:w.FVerb,columns,parameters,links};
   },{root,base});
  };
  let current=await read();need(current.method===0,'only GET is supported');
  if(t.query_parameters){
   need(JSON.stringify(current.parameters.map(p=>p.name))===JSON.stringify(t.query_parameters.map(p=>p.name))&&current.parameters.every(p=>p.type===5),'query parameter definitions differ');
   need(t.query_parameters.every(q=>current.columns.some(c=>c.name===q.field&&c.type===5)),'each query parameter requires an existing string input field');
   const same=(a,b)=>JSON.stringify([...a].sort((a,b)=>a.name.localeCompare(b.name)))===JSON.stringify([...b].sort((a,b)=>a.name.localeCompare(b.name)));
   if(!same(current.links,t.query_parameters)){
    if(current.links.length)await click(base+'btnLinksDel');
    if(t.query_parameters.every(q=>q.name===q.field))await click(base+'btnAutoLink');
    else for(const q of t.query_parameters){
     const columns=current.columns.filter(c=>c.name===q.field);
     need(columns.length===1&&Number.isSafeInteger(columns[0].index)&&columns[0].index>=0,'input field index is ambiguous');
     // Field cells use the native column Index; record IDs are field names.
     await quiet();await guard();const source=await point(base+'colColumnName_'+columns[0].index),target=await point(base+'colParam_'+q.name);effect=true;
     await page.mouse.move(source.x,source.y);await page.mouse.down();try{await page.mouse.move(target.x,target.y,{steps:12});}finally{await page.mouse.up();}
    }
    current=await wait('requested query bindings',async()=>{const r=await read();return same(r.links,t.query_parameters)?r:null;});
   }
  }
  const configuration={verified:true,node_context:{...t.node,verified:true},method:'GET',query_parameters:current.links,input_fields:current.columns.map(c=>({name:c.name,type:c.type===5?'string':'unsupported'}))};
  await advance();
  const allowed=['Настройка пользовательских заголовков','Дополнительные параметры','Настройка выходных столбцов'];
  for(let i=0;i<6;i++){
   const caption=(await title()).trim();if(caption==='Описание узла')return {verified:true,cleanup_complete:true,effect_possible:effect,configuration,node_context:{...t.node,verified:true}};
   need(allowed.includes(caption),'unexpected REST wizard page: '+caption);await advance();
  }
  throw Error('REST wizard page bound exceeded');
 }catch(error){return {verified:false,cleanup_complete:!effect,effect_possible:effect,error:String(error.message).slice(0,1000)};}
}
