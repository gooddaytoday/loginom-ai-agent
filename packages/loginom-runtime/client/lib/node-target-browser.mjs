import { createHash } from 'node:crypto';
import { withBrowserReceipt, makeCapabilityCode } from './executor.mjs';
import { NODE_TYPES, NODE_POSITION_MIN } from './node-contracts.mjs';
import {activatePreparedWorkflow} from './node-workflow-activation.mjs';
import {exportPaletteScroll} from './text-export-palette.mjs';
import {nodePlacementViewport,nodePlacementPoint,nodePlacementPosition,revealNodePlacement,samePlacementGraph} from './node-placement.mjs';

// Read cached graph objects and rendered SVG only. Never dereference the data
// proxy or call Loginom server methods. GUID + prepared document/workflow is the
// identity; labels and native port indexes are rebound on every observation.
export async function readGraph(page, task) {
  return page.evaluate(({ request, types, origin, build, read_bindings=false }) => {
    const fail = message => { throw new Error(message); };
    const preparation = globalThis.__loginomDockPreparationV1;
    if (location.origin !== origin || globalThis.bg?.app?.Version !== build || preparation?.document !== document
      || preparation.id !== request.document_id) fail('Prepared graph document changed');
    const record = [...preparation.receipts.values()].find(r => r.workflowId === request.workflow_ref.workflow_id && r.phase === 'verified');
    const exact = value => document.querySelectorAll('[data-tid=' + JSON.stringify(value) + ']');
    const active = exact(request.workflow_ref.tab_tid);
    if (!record || active.length !== 1 || active[0] !== record.tab || !active[0].classList.contains('x-tab-active')) fail('Prepared workflow changed');
    const crumbs = [...document.querySelectorAll('[data-tid^=' + JSON.stringify(request.workflow_ref.prefix + ';cnrNaviMode;b.s_') + ']')].map(e => ({tid:e.getAttribute('data-tid'),label:e.textContent.trim()}));
    if (crumbs.length!==request.workflow_ref.navigation_path.length || crumbs.some((c,i)=>c.tid!==request.workflow_ref.navigation_path[i].tid||c.label!==request.workflow_ref.navigation_path[i].label)) fail('Workflow navigation changed');
    const visible = e => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0 && getComputedStyle(e).visibility !== 'hidden';
    const blockers = [...document.querySelectorAll('[role="dialog"],.bg-mask-message,.x-mask-msg')].filter(visible);
    if (blockers.length) fail('Graph is blocked');
    const app = bg.app, card = app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab();
    let ancestor = card.Controller.Node?.data?.node, packageNode = null, workflowNode = null;
    for (let i=0;ancestor && i<32;i++,ancestor=ancestor.ParentNode) {
      if (app.WorkFlowTreeNode && ancestor instanceof app.WorkFlowTreeNode) workflowNode=ancestor;
      if (ancestor instanceof app.PackageTreeNode) {packageNode=ancestor;break;}
    }
    if (packageNode !== record.packageNode) fail('Prepared package identity changed');
    const model = card.Controller.FController, diagram = model.FDiagram, graph = diagram?.FmxGraph;
    const containers = exact(request.workflow_ref.prefix + ';ModelForm;cmpDiagram');
    if (!(model instanceof app.ModelForm) || containers.length !== 1 || graph?.container !== containers[0] || !visible(containers[0])) fail('Graph model/DOM binding unavailable');
    // Retain the cached UI tree identity for the later embedded node wizard.
    // Older hosts without this native class still support the graph driver,
    // but cannot enter a bound composite node configuration.
    if (record.nodeTargetWorkflowNode && record.nodeTargetWorkflowNode !== workflowNode) fail('Prepared workflow object changed');
    if (workflowNode) record.nodeTargetWorkflowNode=workflowNode;
    const epochs=preparation.nodeTargetDomEpochs??={objects:new WeakMap(),next:0};
    const epoch=e=>{if(!epochs.objects.has(e))epochs.objects.set(e,++epochs.next);return epochs.objects.get(e);};
    const domEpoch=epoch(containers[0]);
    const portIdentities=record.nodeTargetPortIdentities??=new WeakMap();
    const collection = diagram.FNodes?.FCollection;
    if (!Array.isArray(collection) || collection.length > 200) fail('Graph node bound exceeded');
    const nodeTypes = Object.values(types), byTid = new Map(),nativeBindings=[];
    const nodes = collection.map(n => {
      const dom = graph.view.getState(n.FCell)?.shape?.node, tid = dom?.getAttribute('data-tid');
      if (!tid || !containers[0].contains(dom) || !n.FGuid || !n.FCell?.geometry) fail('Node identity is not rendered');
      const labelElements = [...exact(tid + ';Label;Label')].filter(e=>containers[0].contains(e));
      // Loginom renders wrapping as <br> and spaces as &nbsp;. textContent
      // concatenates those lines; joining them would also corrupt long words
      // and literal whitespace. Read the original cached label of this GUID.
      const nativeLabel = n.FLabel;
      if (nativeLabel?.parent !== n || nativeLabel.FCell?.parent !== n.FCell
        || typeof nativeLabel.FRawValue !== 'string') fail('Cached node label identity unavailable');
      if (labelElements.length > 1 || (nativeLabel.FCell.visible === true
        && (labelElements.length !== 1 || graph.view.getState(nativeLabel.FCell)?.text?.node !== labelElements[0]
          || !containers[0].contains(labelElements[0]) || !visible(labelElements[0])))) fail('Node label is not bound to its rendered identity');
      const label = nativeLabel.FRawValue;
      const type = nodeTypes.find(t => t.icon_class === n.FIconCls)?.type ?? n.FIconCls;
      const inputs = [], outputs = [], allPorts=[];
      for (const ports of n.FPorts ?? []) for (const p of ports.FCollection ?? []) {
        const element = graph.view.getState(p.FCell)?.shape?.node;
        let ptid = element?.getAttribute('data-tid');
        let renderedPort=element;
        // Loginom 7.4.2 can expose a second SVG even on a newly created port,
        // retaining data-tid on the first element. Bind only a unique rendered
        // port whose live hit-test resolves to this exact native cell. Preserve
        // prior identity checks; never infer an index or repair the DOM.
        const previous=portIdentities.get(p);
        if(!ptid && element && containers[0].contains(element) && visible(element)
          && p.FGuid && p.data && p.parent===n && p.FCell.parent===n.FCell
          && (!previous || (previous.graph===graph && previous.node===n && previous.cell===p.FCell
            && previous.guid===p.FGuid && previous.data===p.data && previous.nodeTid===tid
            && previous.type===p.FType && previous.subtype===p.FSubType))){
          const box=containers[0].getBoundingClientRect();
          const rendered=(previous?[...exact(previous.tid)]:[...containers[0].querySelectorAll('[data-tid]')]).filter(e=>{
            const candidate=e.getAttribute('data-tid');
            if(!containers[0].contains(e) || !visible(e) || !candidate?.startsWith(tid+';')
              || (!previous && !/^(Input|Output)_Data-\d+$/.test(candidate.slice(tid.length+1))))return false;
            if([...exact(candidate)].filter(e=>containers[0].contains(e)).length!==1)return false;
            const portBox=e.getBoundingClientRect();
            return graph.getCellAt(portBox.x-box.x+containers[0].scrollLeft+portBox.width/2,
              portBox.y-box.y+containers[0].scrollTop+portBox.height/2)===p.FCell;
          });
          if(rendered.length===1){
            renderedPort=rendered[0];ptid=renderedPort.getAttribute('data-tid');
          }
        }
        if (p.FCell?.visible===true && (!ptid || !containers[0].contains(element))) fail('Visible port identity is not rendered: '+JSON.stringify({
          node_id:n.FGuid,port_id:p.FGuid??null,node_tid:tid,port_tid:ptid??null,
          element_present:!!element,element_in_graph:!!element&&containers[0].contains(element),
          previous_tid:previous?.tid??null,type:p.FType,subtype:p.FSubType}));
        if (!ptid || !containers[0].contains(element)) continue; // Hidden service ports are outside tabular phase.
        if(!ptid.startsWith(tid+';'))fail('Port identity belongs to another node');
        if(renderedPort.getAttribute('data-tid')===ptid && p.FGuid && p.data && p.parent===n && p.FCell.parent===n.FCell
          && [...exact(ptid)].filter(e=>containers[0].contains(e)).length===1)portIdentities.set(p,{graph,node:n,cell:p.FCell,guid:p.FGuid,data:p.data,nodeTid:tid,type:p.FType,subtype:p.FSubType,tid:ptid});
        const suffix = ptid.slice(tid.length + 1), m = /^(Input|Output)_Data-(\d+)$/.exec(suffix);
        allPorts.push(suffix);
        if (m) { (m[1] === 'Input' ? inputs : outputs).push(Number(m[2])); byTid.set(ptid, {node:n.FGuid,index:Number(m[2]),direction:m[1]}); }
      }
      inputs.sort((a,b)=>a-b);outputs.sort((a,b)=>a-b);
      nativeBindings.push({node_id:n.FGuid,label:tid.split(";Graph;")[1],inputs:[...inputs],outputs:[...outputs]});
      for(const p of byTid.values())if(p.node===n.FGuid)p.index=(p.direction==='Input'?inputs:outputs).indexOf(p.index);
      return {ref:{document_id:request.document_id,workflow_id:request.workflow_ref.workflow_id,node_id:n.FGuid},type,label,dom_epoch:epoch(dom),
        position:{x:n.FCell.geometry.x,y:n.FCell.geometry.y},inputs:inputs.map((_,i)=>i),outputs:outputs.map((_,i)=>i),
        other_ports:allPorts.filter(p=>! /^(Input|Output)_Data-\d+$/.test(p)).sort(),locked:n.FLocked===true};
    }).sort((a,b)=>a.ref.node_id.localeCompare(b.ref.node_id));
    const links=[],foreign_links=[];
    for(const e of containers[0].querySelectorAll('[data-tid]')) {
      const tid=e.getAttribute('data-tid'), parts=tid.split(';Graph;'); if(parts.length!==2)continue;
      const body=parts[1];if(!/^[^|]+\|Output_[^;|]+\|[^|]+\|Input_[^;|]+$/.test(body))continue;
      const endpoints=body.split('|');
      const prefix=parts[0]+';Graph;',s=byTid.get(prefix+endpoints[0]+';'+endpoints[1]),t=byTid.get(prefix+endpoints[2]+';'+endpoints[3]);
      if(s&&t)links.push({source:s.node,output:s.index,target:t.node,input:t.index});else foreign_links.push(tid);
    }
    links.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));foreign_links.sort();
    if(links.length+foreign_links.length>400)fail('Graph link bound exceeded');
    return {complete:true,document_id:request.document_id,workflow_ref:request.workflow_ref,dom_epoch:domEpoch,nodes,links,foreign_links,...(read_bindings?{native_bindings:nativeBindings}:{}),
      interaction_ready:model.FCreateDraggedNodeStarted===false && model.FDraggingOverGraph===false && !model.FDraggedNode};
  },task);
}

// Fixed UI gestures used only through the enclosing graph phase. The complete
// pre-effect snapshot must still match immediately before the gesture.
export async function mutateGraph(page, task, read, scrollExport, readViewport, projectPosition, revealPosition, sameGraph) {
  let effectPossible=false, held=false, transient=false, outcome,placementRefusal,placementNavigation,placementNavigationUncertain=false,paletteScroll=null,paletteScrollUncertain=false;
  let gestureBefore=task.effect.before;
  const remaining=()=>{if(page[Symbol.for('loginom-dock.node-target-cancel')]?.has(task.effect.id))throw new Error('Node target cancelled');const value=task.deadline-Date.now();if(value<=0)throw new Error('Graph deadline');return value;};
  const ensureContext=()=>page.evaluate(({request,epoch})=>{
    const p=globalThis.__loginomDockPreparationV1;
    const r=p&&[...p.receipts.values()].find(r=>r.workflowId===request.workflow_ref.workflow_id&&r.phase==='verified');
    const all=tid=>document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']');
    const tab=all(request.workflow_ref.tab_tid),root=all(request.workflow_ref.prefix+';ModelForm;cmpDiagram');
    if(p?.document!==document||p.id!==request.document_id||!r||tab.length!==1||tab[0]!==r.tab||!tab[0].classList.contains('x-tab-active')||root.length!==1||p.nodeTargetDomEpochs?.objects.get(root[0])!==epoch)throw new Error('Node target document/workflow/DOM epoch changed');
  },{request:task.request,epoch:task.effect.before.dom_epoch});
  const find=value=>{const selector='[data-tid='+JSON.stringify(value)+']';return value.startsWith(task.request.workflow_ref.prefix+';Graph;')?page.locator('[data-tid='+JSON.stringify(task.request.workflow_ref.prefix+';ModelForm;cmpDiagram')+']').locator(selector):page.locator(selector);};
  const wait=async(name,probe,reserve=0)=>{const end=Math.min(task.deadline-reserve,Date.now()+15000);while(remaining() && Date.now()<end){await ensureContext();const v=await probe();if(v)return v;await page.waitForTimeout(Math.max(0,Math.min(80,end-Date.now())));}throw new Error('Readiness timeout: '+name);};
  const targetTid=async ref=>page.evaluate(id=>{
    const d=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController.FDiagram;
    const matches=d.FNodes.FCollection.filter(n=>n.FGuid===id);if(matches.length!==1)throw new Error('Node disappeared');
    return d.FmxGraph.view.getState(matches[0].FCell)?.shape?.node?.getAttribute('data-tid');
  },ref.node_id);
  const point=async locator=>{
    remaining();await ensureContext();
    if(await locator.count()!==1 || !await locator.isVisible() || !await locator.isEnabled())throw new Error('Exact interactive target unavailable');
    const p=await locator.evaluate(e=>{const b=e.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2;
      const hit=document.elementFromPoint(x,y);if(x<0||y<0||x>=innerWidth||y>=innerHeight||!(hit===e||e.contains(hit)))throw new Error('Target is covered');return{x,y};});return p;
  };
  const drag=async(source,to)=>{const from=await point(source);remaining();if(JSON.stringify(await read(page,task))!==JSON.stringify(gestureBefore))throw new Error('Graph or DOM epoch changed before drag');await page.mouse.move(from.x,from.y);held=true;effectPossible=true;
    try{remaining();await page.mouse.down();for(let step=1;step<=24;step++){remaining();await ensureContext();await page.mouse.move(from.x+(to.x-from.x)*step/24,from.y+(to.y-from.y)*step/24);}}finally{await page.mouse.up();held=false;}};
  try {
    const before=await read(page,task);
    if(JSON.stringify(before)!==JSON.stringify(task.effect.before) || !before.interaction_ready)throw new Error('Graph changed before gesture');
    const p=task.effect.parameters,kind=task.effect.kind;
    if(kind==='create'){
      const title=task.types[p.type].title.replace(/\s/g,'_');
      const palette=task.request.workflow_ref.prefix+';ModelForm;colVendors_Компоненты>'+task.types[p.type].palette_group+'>'+title+';TreeText';
      const canvas=find(task.request.workflow_ref.prefix+';ModelForm;cmpDiagram');
      placementNavigation=await revealPosition({page,root:canvas,position:p.position,prefix:task.request.workflow_ref.prefix,
        remaining,readViewport,project:projectPosition,guard:async()=>{remaining();await ensureContext();if(!sameGraph(before,await read(page,task)))throw Error('Graph changed during placement navigation');}});
      gestureBefore=await read(page,task);
      if(!sameGraph(before,gestureBefore))throw Error('Graph changed after placement navigation');
      placementNavigation.rebound_node_epochs=gestureBefore.nodes.filter(n=>before.nodes.find(b=>b.ref.node_id===n.ref.node_id)?.dom_epoch!==n.dom_epoch).map(n=>({node_id:n.ref.node_id,dom_epoch:n.dom_epoch}));
      const origin=await canvas.boundingBox(),target=placementNavigation.point;
      const reachable=await find(task.request.workflow_ref.prefix+';ModelForm;cmpDiagram').evaluate((e,p)=>{
        const b=e.getBoundingClientRect(),hit=document.elementFromPoint(p.x,p.y);
        return {reachable:p.x>=0&&p.y>=0&&p.x<innerWidth&&p.y<innerHeight&&p.x>=b.x&&p.x<b.right&&p.y>=b.y&&p.y<b.bottom&&!!hit&&(hit===e||e.contains(hit)),
          graph_rect:{x:b.x,y:b.y,width:b.width,height:b.height},viewport:{width:innerWidth,height:innerHeight},screen_point:p,hit_inside:!!hit&&(hit===e||e.contains(hit))};
      },target);
      if(!reachable.reachable){placementRefusal={kind:'unreachable_drop_surface',requested_position:p.position,...reachable};throw new Error('Requested drop surface is not reachable');}
      if(p.type==='exports.text'){
        const args={owner_tid:task.request.workflow_ref.prefix+';ModelForm;pnlVendors;tree',item_tid:palette};
        const owner=find(args.owner_tid);if(await owner.count()!==1)throw Error('Export palette owner is ambiguous');
        const handle=await owner.elementHandle();
        try{
          const plan=await handle.evaluate(scrollExport,args);paletteScroll={before:plan,applied:false};
          if(!plan.visible){
            remaining();await ensureContext();if(JSON.stringify(await read(page,task))!==JSON.stringify(gestureBefore))throw Error('Graph changed before palette scroll');
            effectPossible=true;paletteScrollUncertain=true;
            const moved=await handle.evaluate(scrollExport,{...args,before:plan,apply:true});
            paletteScroll={before:plan,...moved};paletteScrollUncertain=false;
            if(!moved.applied||moved.after!==plan.to)throw Error('Export palette scroll not confirmed');
            await wait('export_palette_item_reachable',async()=>{try{await point(find(palette));return true;}catch{return false;}});
          }
        }finally{await handle.dispose();}
        if(JSON.stringify(await read(page,task))!==JSON.stringify(gestureBefore))throw Error('Graph changed after palette reveal');
        const currentOrigin=await find(task.request.workflow_ref.prefix+';ModelForm;cmpDiagram').boundingBox();
        if(JSON.stringify(currentOrigin)!==JSON.stringify(origin)||!await find(task.request.workflow_ref.prefix+';ModelForm;cmpDiagram').evaluate((e,p)=>{const b=e.getBoundingClientRect(),hit=document.elementFromPoint(p.x,p.y);return p.x>=b.x&&p.x<b.right&&p.y>=b.y&&p.y<b.bottom&&p.x>=0&&p.y>=0&&p.x<innerWidth&&p.y<innerHeight&&!!hit&&(hit===e||e.contains(hit));},target))throw Error('Export drop changed after palette reveal');
      }
      await drag(find(palette),target);
    }else if(kind==='rename'){
      const tid=await targetTid(p.ref);await point(find(tid+';Label;Label'));effectPossible=true;
      await find(tid+';Label;Label').dblclick({timeout:remaining()});transient=true;
      const editor=find(task.request.workflow_ref.prefix+';ModelForm;cmpDiagram').locator('textarea:visible');
      await editor.click({timeout:remaining()});await editor.press('ControlOrMeta+A',{timeout:remaining()});
      await page.keyboard.type(p.label,{delay:20});await editor.press('Enter',{timeout:remaining()});transient=false;
    }else if(kind==='move'){
      const tid=await targetTid(p.ref);
      // Positions are logical grid coordinates; preserve the initial pointer's
      // offset within the node while moving its top-left origin.
      const old=task.effect.before.nodes.find(n=>n.ref.node_id===p.ref.node_id).position;
      // Deselect via an observed empty canvas point. Selection controls are
      // sibling SVG objects and consume drags; they are not a node drag handle.
      const blank=await find(task.request.workflow_ref.prefix+';ModelForm;cmpDiagram').evaluate(e=>{
        const b=e.getBoundingClientRect();for(const dy of [16,80,160])for(const dx of [280,400,560]){
          const x=b.x+dx,y=b.y+dy,hit=document.elementFromPoint(x,y);
          if(x<b.right&&y<b.bottom&&hit&&e.contains(hit)&&!hit.closest('[data-tid*=";Graph;"]'))return{x,y};
        }throw new Error('No observed empty graph point');
      });
      effectPossible=true;await page.mouse.click(blank.x,blank.y);
      await wait('node_selection_controls_closed',()=>page.evaluate(()=>bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController.FDiagram.FmxGraph.getSelectionCells().length===0));
      if(JSON.stringify(await read(page,task))!==JSON.stringify(before))throw new Error('Graph changed while deselecting');
      const source=find(tid),from=await point(source);
      const scale=await page.evaluate(()=>{const d=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController.FDiagram;return d.FmxGraph.view.scale/d.FInitialScale;});
      await drag(source,{x:from.x+(p.position.x-old.x)*scale,y:from.y+(p.position.y-old.y)*scale});
    }else if(kind==='add_input'){
      const tid=await targetTid(p.ref);const add=find(tid+';Input_Add');await point(add);effectPossible=true;await add.click({timeout:remaining()});
      const choice=await wait('additional_table_input_or_type_menu',async()=>{
        if(await page.locator('[data-tid^='+JSON.stringify(tid+';Input_Data-')+']').count()>p.input)return 'created';
        if(await find(tid+';Input_Add;Data').count()===1)return 'choose';
        return null;
      });
      if(choice==='choose'){const data=find(tid+';Input_Add;Data');await point(data);await data.click({timeout:remaining()});}

    }else if(kind==='remove_link'){
      const source=await targetTid({node_id:p.edge.source}),target=await targetTid({node_id:p.edge.target});
      const linkTid=source+'|Output_Data-'+p.edge.output+'|'+target.split(';Graph;')[1]+'|Input_Data-'+p.edge.input;
      const link=find(linkTid);
      if(await link.count()!==1)throw new Error('Owned link is not uniquely rendered');
      const hit=await link.evaluate(e=>{
        const paths=[e,...e.querySelectorAll('path')].filter(p=>typeof p.getTotalLength==='function');
        for(const path of paths){const matrix=path.getScreenCTM();if(!matrix)continue;for(const fraction of [.5,.25,.75]){
          const p=path.getPointAtLength(path.getTotalLength()*fraction),q=new DOMPoint(p.x,p.y).matrixTransform(matrix),top=document.elementFromPoint(q.x,q.y);
          if(top&&(top===e||e.contains(top)))return {x:q.x,y:q.y};}}
        throw new Error('Owned link has no reachable curve point');
      });
      // Selection can fail to appear. Leave time to return its ambiguous receipt
      // before the enclosing transport deadline, without repeating the gesture.
      if(remaining()<=1000)throw new Error('Insufficient deadline for owned link selection');
      await ensureContext();effectPossible=true;await page.mouse.click(hit.x,hit.y);
      const bend=find(linkTid+';TargetBend');
      await wait('owned_link_selection_visible',async()=>await bend.count()===1&&await bend.isVisible(),1000);
      const selected=await page.evaluate(()=>{const d=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController.FDiagram;
        return d.FmxGraph.getSelectionCells().map(c=>({edge:c.edge===true,tid:d.FmxGraph.view.getState(c)?.shape?.node?.getAttribute('data-tid')}));});
      if(selected.length!==1 || selected[0].edge!==true || selected[0].tid!==linkTid)throw new Error('Deletion selection includes another object');
      const remove=find(task.request.workflow_ref.prefix+';ModelForm;btnRemoveSelected');
      await wait('single_link_delete_toolbar_reachable',async()=>{try{await point(remove);return true;}catch{return false;}});
      const stillSelected=await page.evaluate(tid=>{const d=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController.FDiagram;const cells=d.FmxGraph.getSelectionCells();return cells.length===1&&cells[0].edge===true&&d.FmxGraph.view.getState(cells[0])?.shape?.node?.getAttribute('data-tid')===tid;},linkTid);
      if(!stillSelected || JSON.stringify(await read(page,task))!==JSON.stringify(before))throw new Error('Owned link selection or graph changed before deletion');
      await remove.click({timeout:remaining()});transient='delete';
      const message=find('msgbox;cnt;cnt;cmp');
      await message.waitFor({state:'visible',timeout:Math.min(15000,remaining())});
      if((await message.textContent()).trim()!=='Удалить выделенную связь?')throw new Error('Exact single-link confirmation unavailable');
      const yes=find('msgbox;tlb;yes');
      await wait('single_link_confirmation_reachable',async()=>{try{await point(yes);return true;}catch{return false;}});
      if((await message.textContent()).trim()!=='Удалить выделенную связь?')throw new Error('Single-link confirmation changed');
      await yes.click({timeout:remaining()});transient=false;
    }else throw new Error('Graph primitive is not implemented: '+kind);
    await page.mouse.move(10,10);
    let after=await wait('graph_effect_visible_and_drag_idle',async()=>{try{const g=await read(page,task);return g.interaction_ready&&JSON.stringify(g)!==JSON.stringify(before)?g:null;}catch{return null;}});
    if(kind==='create'){
      const created=after.nodes.filter(n=>!before.nodes.some(b=>b.ref.node_id===n.ref.node_id));
      if(created.length!==1)throw Error('Created node visibility owner is ambiguous');
      const baseline=after,node=created[0],canvas=find(task.request.workflow_ref.prefix+';ModelForm;cmpDiagram');
      const visibility=await revealPosition({page,root:canvas,nodeId:node.ref.node_id,position:node.position,prefix:task.request.workflow_ref.prefix,
        remaining,readViewport,project:projectPosition,guard:async()=>{remaining();await ensureContext();if(!sameGraph(baseline,await read(page,task)))throw Error('Graph changed while revealing created node');}});
      placementNavigation.node_visibility=visibility;
      if(!visibility.fully_visible)throw Error('Created node and ports are not fully visible');
      after=await read(page,task);
      if(!sameGraph(baseline,after))throw Error('Created node graph changed after viewport navigation');
    }
    outcome={status:'SUCCEEDED',effect_possible:true,after};
  }catch(error){if(error.placement_navigation_unverified){effectPossible=true;placementNavigationUncertain=true;}outcome={status:effectPossible?'AMBIGUOUS':'NOT_APPLIED',effect_possible:effectPossible,error:String(error.message),...(placementRefusal?{placement_refusal:placementRefusal}:{})};}
  finally{try{if(held){await page.mouse.up();held=false;}if(transient==='delete'){const cancel=find('msgbox;tlb;no');if(await cancel.isVisible())await cancel.click({timeout:3000});}else if(transient)await page.keyboard.press('Escape');transient=false;outcome.cleanup_complete=true;}catch(error){outcome={...outcome,status:'AMBIGUOUS',cleanup_complete:false,cleanup_error:String(error.message)};}}
  if(paletteScroll)outcome.palette_scroll=paletteScroll;
  if(placementNavigation)outcome.placement_navigation=placementNavigation;
  if(paletteScrollUncertain||placementNavigationUncertain)outcome.cleanup_complete=false;
  return outcome;
}

// Moving off a selected node can replace its SVG body when hover controls
// disappear. Settle that UI-only transition before binding the drag epochs.
export async function prepareLinkHover(page,task,read,sameGraph) {
  const observe=async()=>{
    for(let attempt=0;attempt<3;attempt++){
      try{return await read(page,task);}catch(error){
        if(attempt===2||!String(error.message).includes('Graph is blocked'))throw error;
        const timeout=Math.min(15000,Math.max(1,task.deadline-Date.now()));
        await page.waitForFunction(()=>![...document.querySelectorAll('[role="dialog"],.bg-mask-message,.x-mask-msg')].some(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden'),null,{timeout});
      }
    }
  };
  const before=await observe();
  if(JSON.stringify(before)!==JSON.stringify(task.effect.before))throw Error('Graph changed before link hover');
  const root=page.locator('[data-tid='+JSON.stringify(task.request.workflow_ref.prefix+';ModelForm;cmpDiagram')+']');
  const source=root.locator('[data-tid='+JSON.stringify(task.source_tid)+']');
  if(await source.count()!==1)throw Error('Link hover source is not unique');
  let point;
  for(let attempt=0;attempt<10;attempt++){
    point=await source.evaluate(e=>{const b=e.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2,hit=document.elementFromPoint(x,y);
      return b.width>0&&b.height>0&&x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&(hit===e||e.contains(hit))?{x,y}:null;});
    if(point)break;
    await page.waitForTimeout(50);
  }
  if(!point)throw Error('Link hover source is covered');
  if(!sameGraph(before,await observe()))throw Error('Graph changed before link hover gesture');
  await page.mouse.move(point.x,point.y);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const after=await observe();
  if(!sameGraph(before,after))throw Error('Graph changed during link hover');
  return after;
}

export function createNodeTargetBrowserAdapter({execute,origin,build,pinned}) {
  if(build!=='7.4.2')throw new Error('Node target browser profile is verified only for Loginom 7.4.2');
  let request;
  const task = extra => ({request,types:NODE_TYPES,origin,build,...extra});
  const readCode = t => `async page => (${readGraph.toString()})(page,${JSON.stringify(t)})`;
  const call = (code,deadline) => execute(code,{timeout:Math.max(1,deadline-Date.now())});
  const observeGraph=async(value,deadline,{readBindings=false}={})=>{
      request=value;
      const renderDeadline=Math.min(deadline,Date.now()+15000);
      let maskRefresh=0;
      for(;;){
        try{return await call(readCode(task({read_bindings:readBindings})),deadline);}
        catch(error){
          const message=String(error.message);
          if(message.includes('Visible port identity is not rendered')&&Date.now()<renderDeadline){
            // Headed Chromium can expose the cached port's visible flag one
            // animation frame before mxGraph attaches its SVG element. This is
            // a read-only observation retry; no gesture is repeated.
            // A background document may suspend frames entirely; it must not
            // keep this read pending beyond the enclosing observation budget.
            await call('async page => {await page.evaluate(()=>new Promise(resolve=>{const timer=setTimeout(resolve,100);requestAnimationFrame(()=>requestAnimationFrame(()=>{clearTimeout(timer);resolve();}));}));return true;}',deadline);
            await new Promise(resolve=>setTimeout(resolve,80));
            continue;
          }
          if(maskRefresh++>=2 || !message.includes('Graph is blocked') || Date.now()>=deadline)throw error;
          // Observe only: a transient loading mask may arrive after the prior
          // graph receipt. Wait for its disappearance, then recheck the complete
          // original preparation identity; never retry a possible gesture.
          await call(`async page => {await page.waitForFunction(()=>![...document.querySelectorAll('[role="dialog"],.bg-mask-message,.x-mask-msg')].some(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden'),null,{timeout:${Math.max(1,Math.min(15000,deadline-Date.now()))}});return true;}`,deadline);
        }
      }
  };
  const workflowOptions=(value,ctx)=>({receipt_namespace:'node-workflow:'+value.document_id,receipt_id:ctx.receipt_id,
    operation_id:ctx.receipt_id,receipt_signature:createHash('sha256').update(JSON.stringify(value)).digest('hex')});
  return {
    async readWorkflowReceipt(value,ctx){
      return call(withBrowserReceipt('null',{...workflowOptions(value,ctx),receipt_read:true}),ctx.deadline);
    },
    async verifyWorkflow(value,ctx){
      ctx.signal?.throwIfAborted();
      return call(`async page => (${activatePreparedWorkflow.toString()})(page,${JSON.stringify({request:value,origin,build,deadline:ctx.deadline,observeOnly:true})})`,ctx.deadline);
    },
    async activateWorkflow(value,ctx){
      request=value;ctx.signal?.throwIfAborted();
      const options=workflowOptions(value,ctx);
      const code=withBrowserReceipt(`(${activatePreparedWorkflow.toString()})(page,${JSON.stringify(task({deadline:ctx.deadline}))})`,options);
      try{return await call(code,ctx.deadline);}
      catch(error){
        // Reconcile a lost transport reply by reading the original receipt only.
        const inspected=await call(withBrowserReceipt('null',{...options,receipt_read:true}),Date.now()+15000);
        if(inspected.output?.state==='completed')return inspected.output.receipt;
        throw error;
      }
    },
    observe:observeGraph,
    async choosePosition(value,graph,deadline,signal){
      signal?.throwIfAborted();
      if(JSON.stringify(await observeGraph(value,deadline))!==JSON.stringify(graph))throw Error('Graph changed before automatic placement');
      const tid=value.workflow_ref.prefix+';ModelForm;cmpDiagram';
      return call(`async page=>page.locator('[data-tid='+${JSON.stringify(JSON.stringify(tid))}+']').evaluate(e=>{
        const b=e.getBoundingClientRect(),width=Math.min(b.right,innerWidth)-b.x,height=Math.min(b.bottom,innerHeight)-b.y;
        const view=(${nodePlacementViewport.toString()})(e);
        const occupied=[...e.querySelectorAll('[data-tid*=";Graph;"]')].map(n=>n.getBoundingClientRect()).filter(r=>r.width>0&&r.height>0);
        for(let y=80;y<height-80;y+=128)for(let x=80;x<width-96;x+=160){
          const position=(${nodePlacementPosition.toString()})(view,{x:b.x+x,y:b.y+y});
          if(position.x<${NODE_POSITION_MIN}||position.y<${NODE_POSITION_MIN}||position.x>10000||position.y>10000)continue;
          const screen=(${nodePlacementPoint.toString()})(view,position),px=screen.x,py=screen.y,hit=document.elementFromPoint(px,py);
          if(px<0||py<0||!hit||!(hit===e||e.contains(hit)))continue;
          if(occupied.some(r=>px>r.left-72&&px<r.right+96&&py>r.top-56&&py<r.bottom+72))continue;
          return position;
        }
        throw Error('target.position: no free visible canvas position; enlarge the canvas or supply an explicit position');
      })`,deadline);
    },
    async preflight(value,graph,deadline){
      if(value.inputs.length && !pinned?.actions?.get('link.create'))throw new Error('Pinned link.create primitive is required');
      if(!graph.interaction_ready)throw new Error('Drag surface is not ready');
      if(value.target.kind==='new'){
        const title=NODE_TYPES[value.target.type].title.replace(/\s/g,'_');
        const tid=value.workflow_ref.prefix+';ModelForm;colVendors_Компоненты>'+NODE_TYPES[value.target.type].palette_group+'>'+title+';TreeText';
        const available=await call(`async page => page.locator('[data-tid='+${JSON.stringify(JSON.stringify(tid))}+']').evaluateAll(es=>es.length===1 && !!es[0].getBoundingClientRect().width && !es[0].closest('.x-item-disabled,.x-grid-row-disabled'))`,deadline);
        if(!available)throw new Error('Component unavailable in the observed platform/license or palette');
        // Palette rows below the viewport still have nonzero DOM bounds. Bring
        // this exact admitted component into view before capturing the drag.
        if(value.target.type!=='exports.text')await call(`async page => {const row=page.locator('[data-tid='+${JSON.stringify(JSON.stringify(tid))}+']');await row.scrollIntoViewIfNeeded({timeout:${Math.max(1,Math.min(15000,deadline-Date.now()))}});return row.evaluate(e=>{const b=e.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2,hit=document.elementFromPoint(x,y);if(x<0||y<0||x>=innerWidth||y>=innerHeight||!(hit===e||e.contains(hit)))throw Error('Palette row is covered after scrolling');return true;});}`,deadline);
      }
      if(value.target.kind==='existing' && graph.nodes.find(n=>n.ref.node_id===value.target.ref.node_id)?.locked)throw new Error('Node is locked');
      // Cycles are rejected against the full tabular graph before any creation.
      if(value.target.kind==='existing')for(const input of value.inputs){const seen=new Set(),queue=[value.target.ref.node_id];while(queue.length){const id=queue.pop();if(id===input.source.node_id)throw new Error('Requested link would create a cycle');if(seen.has(id))continue;seen.add(id);queue.push(...graph.links.filter(e=>e.source===id).map(e=>e.target));}}
    },
    positionMatches:(node,position)=>Math.abs(node.position.x-Math.round(position.x/8)*8)<0.1&&Math.abs(node.position.y-Math.round(position.y/8)*8)<0.1,
    async mutate(effect,deadline,signal){
      signal?.throwIfAborted();let cancellation;
      const cancel=()=>{cancellation=call(`async page=>{(page[Symbol.for('loginom-dock.node-target-cancel')]??=new Set()).add(${JSON.stringify(effect.id)});return true;}`,Math.max(deadline,Date.now()+3000));cancellation.catch(()=>{});};
      signal?.addEventListener('abort',cancel,{once:true});
      try{
      const t=task({effect,deadline});
      if(effect.kind==='connect' && pinned){
        // Reuse the admitted link primitive. It owns observed port rebinding,
        // graph-diff reconciliation, mouse cleanup and bounded validation.
        // A loading mask can arrive after any freshly created/renamed node,
        // not only Text Export. Re-observe read-only until that transient mask
        // clears before dispatching the single admitted link gesture.
        let graph=await observeGraph(request,deadline);
        signal?.throwIfAborted();if(Date.now()>=deadline)throw Error('Connect deadline elapsed');
        if(JSON.stringify(graph)!==JSON.stringify(effect.before))return {status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};
        // Reuse the complete native graph reader, including its strictly verified
        // rendered-port cache fallback; a second SVG-only resolver loses that identity.
        const bindingGraph=await observeGraph(request,deadline,{readBindings:true});
        const {native_bindings:bindings,...observed}=bindingGraph;
        if(!samePlacementGraph(graph,observed))return {status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};
        const resolve=(id,direction,index)=>{
          const matches=bindings.filter(b=>b.node_id===id);
          if(matches.length!==1||!Number.isInteger(matches[0][direction][index]))throw Error('Exact tabular port disappeared');
          return {label:matches[0].label,index:matches[0][direction][index]};
        };
        const edge=effect.parameters.edge,bound={source:resolve(edge.source,'outputs',edge.output),target:resolve(edge.target,'inputs',edge.input)};
        signal?.throwIfAborted();if(Date.now()>=deadline)throw Error('Connect deadline elapsed');
        const hoverTask=task({effect,deadline,source_tid:request.workflow_ref.prefix+';Graph;'+bound.source.label+';Output_Data-'+bound.source.index});
        graph=await call(`async page=>(${prepareLinkHover.toString()})(page,${JSON.stringify(hoverTask)},${readGraph.toString()},${samePlacementGraph.toString()})`,deadline);
        const legacy=bound=>({kind:'node',node_label:bound.label,workflow_ref:{tab_tid:request.workflow_ref.tab_tid,prefix:request.workflow_ref.prefix}});
        const params={source_node:legacy(bound.source),target_node:legacy(bound.target),
          source_port:{kind:'data',index:bound.source.index},target_port:{kind:'data',index:bound.target.index}};
        signal?.throwIfAborted();if(Date.now()>=deadline)throw Error('Connect deadline elapsed');
        return await call(makeCapabilityCode(pinned.actions.get('link.create'),pinned.selectors,params,{mode:'apply',operation_id:effect.id,expected_build:build,
          deadline_at:deadline,node_target_graph_reader:readGraph,node_target_context:{request,graph_baseline:graph,graph_probe:task(),dom_epoch:graph.dom_epoch,nodes:[{id:effect.parameters.edge.source,tid:bound.source.label,dom_epoch:graph.nodes.find(n=>n.ref.node_id===effect.parameters.edge.source).dom_epoch},{id:effect.parameters.edge.target,tid:bound.target.label,dom_epoch:graph.nodes.find(n=>n.ref.node_id===effect.parameters.edge.target).dom_epoch}]},node_target_cancellation_id:effect.id,receipt_namespace:'node-target:'+request.document_id,receipt_id:effect.id,
          receipt_signature:createHash('sha256').update(JSON.stringify(effect)).digest('hex')}),deadline);
      }
      const options={receipt_namespace:'node-target:'+request.document_id,receipt_id:effect.id,
        operation_id:effect.id,receipt_signature:createHash('sha256').update(JSON.stringify(effect)).digest('hex')};
      return await call(withBrowserReceipt(`(${mutateGraph.toString()})(page,${JSON.stringify(t)},${readGraph.toString()},${exportPaletteScroll.toString()},${nodePlacementViewport.toString()},${nodePlacementPoint.toString()},${revealNodePlacement.toString()},${samePlacementGraph.toString()})`,options),deadline);
      }finally{signal?.removeEventListener('abort',cancel);if(cancellation){await cancellation;await call(`async page=>{page[Symbol.for('loginom-dock.node-target-cancel')]?.delete(${JSON.stringify(effect.id)});return true;}`,Date.now()+3000);}}
    },
    async reconcile(effect,graph,deadline){
      const options={receipt_namespace:'node-target:'+request.document_id,receipt_id:effect.id,
        operation_id:effect.id,receipt_signature:createHash('sha256').update(JSON.stringify({...effect,receipt:undefined})).digest('hex'),receipt_read:true};
      const value=await call(withBrowserReceipt('null',options),deadline);
      const receipt=value.output?.receipt;
      return {completed:value.output?.state==='completed',verified:value.output?.state==='completed' && ['SUCCEEDED','AMBIGUOUS'].includes(receipt?.status),
        cleanup_complete:receipt?.cleanup_complete===true,receipt};
    },
  };
}
