// Hold native objects from before this drop. A matching caption or dialog ID
// alone cannot authorize closing anything.
export function bindAddOnlyDrop({request,origin,build,effect,types}) {
  const preparation=globalThis.__loginomDockPreparationV1,app=globalThis.bg?.app;
  const card=app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab();
  const controller=card?.Controller,model=controller?.FController;
  const receipt=[...(preparation?.receipts.values()??[])].find(r=>
    r.phase==='verified'&&r.workflowId===request.workflow_ref.workflow_id&&r.nodeTargetWorkflowNode);
  const workflow=receipt?.nodeTargetWorkflowNode,graph=model?.FDiagram?.FmxGraph,root=graph?.container;
  if(location.origin!==origin||app?.Version!==build||preparation?.document!==document||preparation.id!==request.document_id
    ||!receipt||!root||!root.isConnected||!app.ModelForm||!(model instanceof app.ModelForm)
    ||controller.Node?.data?.node!==workflow||preparation.nodeTargetDomEpochs?.objects.get(root)!==effect.before.dom_epoch)
    throw Error('Cannot bind the add-only drop to its native graph');
  const blockers=[...document.querySelectorAll('[role="dialog"],.x-window,[aria-modal="true"]')];
  if(blockers.some(e=>e.isConnected&&e.getBoundingClientRect().width>0
    &&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden'))
    throw Error('A native window was already open before the add-only drop');
  const nodes=model.FDiagram.FNodes?.FCollection;
  if(!Array.isArray(nodes)||nodes.length!==effect.before.nodes.length
    ||!nodes.every(n=>effect.before.nodes.some(known=>known.ref.node_id===n.FGuid)))
    throw Error('Native graph changed before add-only drop');
  return {request,origin,build,app,preparation,receipt,card,controller,model,workflow,
    nodes:new Map(nodes.map(n=>[n.FGuid,n])),icon:types[effect.parameters.type].icon_class,
    created:null,closing:new WeakSet()};
}

// Serialized into the authenticated browser. Return an exact DOM element only
// for a native Cancel/Close control bound to the new node and current surface.
export function readAddOnlyDrop({binding:b,expectedControl,claim=false}) {
  const {request,app,preparation,receipt,card,controller,model,workflow}=b;
  const prefix=request.workflow_ref.prefix,ext=globalThis.Ext;
  const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
  const visible=e=>e?.isConnected&&e.getBoundingClientRect().width>0
    &&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
  const tabs=exact(request.workflow_ref.tab_tid);
  if(location.origin!==b.origin||globalThis.bg?.app!==app||app.Version!==b.build
    ||globalThis.__loginomDockPreparationV1!==preparation||preparation.document!==document
    ||preparation.id!==request.document_id||![...preparation.receipts.values()].includes(receipt)
    ||receipt.phase!=='verified'||receipt.nodeTargetWorkflowNode!==workflow||tabs.length!==1||tabs[0]!==receipt.tab
    ||!tabs[0].classList.contains('x-tab-active')
    ||app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab()!==card||card.Controller!==controller)
    throw Error('Native add-only window context changed');

  const nodes=model.FDiagram?.FNodes?.FCollection;
  if(!Array.isArray(nodes)||nodes.length>200||[...b.nodes].some(([id,node])=>
    nodes.filter(n=>n.FGuid===id).length!==1||!nodes.includes(node)))
    throw Error('Native add-only graph ownership changed');
  const added=nodes.filter(n=>!b.nodes.has(n.FGuid));
  if(added.length>1||added.some(n=>!n.FGuid||!n.data||n.FIconCls!==b.icon)
    ||b.created&&added[0]!==b.created)
    throw Error('Native add-only node ownership changed');
  if(!added.length)return {};
  const node=b.created=added[0],surface=controller.FController,tree=controller.Node?.data?.node;
  const wizardRoot=exact(prefix+';WizrdMCF').filter(visible);
  const ownsWizard=app.WizardTreeNode&&tree instanceof app.WizardTreeNode
    &&app.ModelNodeTreeNode&&tree.ParentNode instanceof app.ModelNodeTreeNode
    &&tree.ParentNode.ParentNode===workflow&&tree.ParentNode.FGuid===node.FGuid
    &&tree.ParentNode.FModelNode===node.data&&surface?.constructor?.name==='WizardModelComponentForm'
    &&surface.FModelNode===node.data&&wizardRoot.length===1&&surface.FView?.el?.dom===wizardRoot[0];
  const blocked=[...document.querySelectorAll('[role="dialog"],.x-window,[aria-modal="true"]')].filter(visible);
  const dialogs=blocked.filter(e=>e!==wizardRoot[0]&&!blocked.some(other=>other!==e&&other!==wizardRoot[0]&&other.contains(e)));
  const atGraph=surface===model&&tree===workflow&&wizardRoot.length===0;
  let owner, controls=[];
  if(dialogs.length===1){
    const dialog=dialogs[0],window=ext?.getCmp?.(dialog.id);
    if(window?.el?.dom!==dialog)return {};
    const nativeWizard=surface?.FView;
    const seen=new Set();
    for(let parent=window.ownerCt;parent&&!seen.has(parent)&&seen.size<32;parent=parent.ownerCt){
      seen.add(parent);
      if(ownsWizard&&parent===nativeWizard||parent.FModelNode===node.data&&parent.FModelNode!==undefined){
        owner=dialog;
        break;
      }
    }
    if(!owner)return {};
    controls=[...owner.querySelectorAll('[data-tid]')].filter(e=>
      /;(?:cancel|btnCancel|btnClose)$/.test(e.getAttribute('data-tid'))&&visible(e));
  }else if(dialogs.length===0&&ownsWizard){
    owner=wizardRoot[0];
    controls=exact(prefix+';WizrdMCF;btnClose').filter(e=>owner.contains(e)&&visible(e));
  }else if(dialogs.length===0&&atGraph){
    return {graph:true,node_id:node.FGuid};
  }
  if(!owner||b.closing.has(owner)||controls.length!==1)return {};
  const control=controls[0],component=ext?.getCmp?.(control.id);
  if(component?.el?.dom!==control||component.disabled===true
    ||control.closest('.x-item-disabled,.x-btn-disabled,[aria-disabled="true"]'))return {};
  const box=control.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2;
  if(!control.contains(document.elementFromPoint(x,y)))return {};
  if(claim){
    if(control!==expectedControl)throw Error('Native add-only Close control changed');
    b.closing.add(owner);
  }
  return {control};
}

export async function settleAddOnlyDrop(page,binding,{readSurface,readQuietGraph,remaining,now=Date.now}) {
  let quietSince,quietGraph;
  for(;;){
    remaining();
    const surface=await page.evaluateHandle(readSurface,{binding});
    try{
      const controlHandle=await surface.getProperty('control');
      try{
        const control=controlHandle.asElement();
        if(control){
          const checked=await page.evaluateHandle(readSurface,{binding,expectedControl:control,claim:true});
          try{
            const sameControl=await checked.getProperty('control');
            try{
              if(!sameControl.asElement())throw Error('Native add-only Close control changed');
            }finally{await sameControl.dispose();}
            await control.click({timeout:remaining()});
          }finally{await checked.dispose();}
          quietSince=undefined;
        }else{
          const state=await surface.jsonValue();
          const graph=state?.graph?await readQuietGraph():null;
          if(!graph?.interaction_ready||!graph.nodes.some(n=>n.ref.node_id===state.node_id)){
            quietSince=undefined;
          }else if(quietSince===undefined||JSON.stringify(quietGraph)!==JSON.stringify(graph)){
            quietSince=now();quietGraph=graph;
          }else if(now()-quietSince>=200){
            return graph;
          }
        }
      }finally{await controlHandle.dispose();}
    }finally{await surface.dispose();}
    await page.waitForTimeout(Math.min(80,remaining()));
  }
}
