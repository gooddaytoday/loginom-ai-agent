// Read-only DOM/native-owner snapshot. Global console history is deliberately
// excluded: it cannot attribute a stale message to the current wizard effect.
export function readJavascriptStage({root,native,binding,prefix,account,build}) {
  const app=globalThis.bg?.app,main=app?.Application?.FInstance?.FMainForm;
  const tab=main?.Items?.Workspace?.getActiveTab?.(),connection=main?.FMapTree?.FServerConnection;
  // The same explicit read-only connection properties used by the operator's
  // account/build guard; no session recovery or server proxy traversal.
  const connectionDiagnostic={present:!!connection,connected:connection?.Connected===true,
    account_matches:typeof account==='string'&&connection?.UserName===account,
    build_matches:typeof build==='string'&&app?.Version===build};
  const visible=e=>e?.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
  const nativeOwner=tab===binding.tab&&tab?.Controller?.Node?.data?.node===native
    &&tab.Controller.FController?.FModelNode===binding.nodeData&&tab.Controller.FController?.FView?.el?.dom===root;
  const connectionValid=Object.values(connectionDiagnostic).every(Boolean);
  const owner=nativeOwner&&connectionValid;
  const previewTid=prefix+';WizrdMCF;JavaScriptOutputPreviewForm';
  const previews=[...document.querySelectorAll('[data-tid='+JSON.stringify(previewTid)+']')].filter(visible);
  const preview=previews.length===1?previews[0]:null;
  // These are local UI data fields from BaseWizard/ViewController and the
  // JavaScript/CodePreview controllers. Never dereference FEngine/FPreview.
  const value=(object,key)=>object&&Object.getOwnPropertyDescriptor(object,key)?.value;
  const dom=control=>value(value(control,'el'),'dom');
  const model=tab?.Controller?.FController;
  const codeRoots=owner?[...root.querySelectorAll('[data-tid='+JSON.stringify(prefix+';WizrdMCF;JavaScriptCodeWizard')+']')]:[];
  const codeRoot=codeRoots.length===1?codeRoots[0]:null;
  const codeView=codeRoot&&globalThis.Ext?.getCmp?.(codeRoot.id);
  // JoinWizard moves child pages out of the vendor FView. The main wizard
  // retains their exact Ext objects in each local item.FPages array.
  const collection=value(model,'FWizardItems'),items=value(collection,'FItems');
  const arrayData=array=>{
    if(!Array.isArray(array)||array.length>32)return null;
    const result=[];
    for(let i=0;i<array.length;i++){
      const item=value(array,String(i));
      if(!item||typeof item!=='object')return null;
      result.push(item);
    }
    return result;
  };
  const localItems=arrayData(items),matches=[];
  let pagesValid=!!localItems;
  if(localItems){
    if(new Set(localItems).size!==localItems.length)pagesValid=false;
    for(const item of localItems){
      const pages=arrayData(value(item,'FPages'));
      if(!pages||new Set(pages).size!==pages.length){pagesValid=false;continue;}
      if(codeView&&pages.includes(codeView))matches.push(item);
    }
  }
  const codeController=pagesValid&&matches.length===1?value(matches[0],'FWizard'):null;
  const codeChecks={root_unique:codeRoots.length===1,root_contained:!!codeRoot&&root.contains(codeRoot),
    root_visible:!!codeRoot&&!!visible(codeRoot),page_native_el:!!codeRoot&&dom(codeView)===codeRoot,
    collection_present:!!collection,items_data_bounded:!!localItems,pages_data_unique_bounded:pagesValid,
    item_unique:matches.length===1,controller_present:!!codeController,
    controller_owner:!!codeController&&value(codeController,'FWizardForm')===model};
  const codeOwned=Object.values(codeChecks).every(Boolean);
  const previewController=codeOwned&&value(codeController,'FPreviewController');
  const previewForm=value(previewController,'FPreviewForm'),previewView=value(previewForm,'FView');
  const inspect=element=>{
    const control=globalThis.Ext?.getCmp?.(element.id),rect=element.getBoundingClientRect(),style=getComputedStyle(element);
    const ancestors=new Set();let ancestor=element,ancestorsVisible=true;
    while(ancestor&&ancestors.size<64&&!ancestors.has(ancestor)){
      ancestors.add(ancestor);const css=getComputedStyle(ancestor);
      if(css.display==='none'||css.visibility==='hidden'||css.visibility==='collapse')ancestorsVisible=false;
      ancestor=ancestor.parentElement;
    }
    const inViewport=rect.width>0&&rect.height>0&&rect.x<innerWidth&&rect.y<innerHeight&&rect.x+rect.width>0&&rect.y+rect.height>0;
    const chain=[],seen=new Set();let current=control;
    while(current&&seen.size<8&&!seen.has(current)){
      seen.add(current);chain.push({root:dom(current)===root,code:current===codeView,preview:current===previewView});
      current=value(current,'ownerCt');
    }
    return {rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},viewport_intersects:inViewport,
      display:style.display,visibility:style.visibility,ancestors_visible:ancestorsVisible,ancestor_bound_complete:!ancestor,
      connected:element.isConnected,native_el:dom(control)===element,native_hidden:value(control,'hidden')===true,
      native_class:typeof value(control,'$className')==='string'?value(control,'$className').slice(0,160):null,
      native_form_view:control===previewView,native_form_dom:dom(previewView)===element,
      native_reciprocal:!!previewForm&&value(control,'Controller')===previewForm,owner_chain:chain,owner_chain_truncated:!!current};
  };
  const exactPreviews=[...document.querySelectorAll('[data-tid='+JSON.stringify(previewTid)+']')];
  const previewDiagnostic=exactPreviews.slice(0,3).map(inspect),proof=preview&&inspect(preview);
  const previewBound=!!owner&&!!codeOwned&&!!proof&&proof.native_el&&proof.native_form_view&&proof.native_form_dom
    &&proof.native_reciprocal&&proof.connected&&!proof.native_hidden&&proof.viewport_intersects
    &&proof.ancestors_visible&&proof.ancestor_bound_complete;
  const dialogs=[...document.querySelectorAll('[role="dialog"],.x-message-box')].filter(visible);
  const foreignDialogs=dialogs.filter(element=>!(owner&&element===root)&&!(previewBound&&element===preview));
  const errorTid=prefix+';WizrdMCF;btnError';
  const errorButtons=[...root.querySelectorAll('[data-tid='+JSON.stringify(errorTid)+']')];
  const errorButton=errorButtons.length===1&&root.contains(errorButtons[0])&&visible(errorButtons[0])?errorButtons[0]:null;
  const errorTooltip=errorButton?.getAttribute('data-qtip');
  const wizardError={exact_count:errorButtons.length,visible:!!nativeOwner&&connectionValid&&!!errorButton,
    tooltip:typeof errorTooltip==='string'?errorTooltip.slice(0,4096):null,
    tooltip_truncated:typeof errorTooltip==='string'&&errorTooltip.length>4096,tid:errorButton?errorTid:null};
  const boundaryRefusal=!connectionDiagnostic.connected?'connection_unavailable'
    :!connectionDiagnostic.account_matches?'account_changed':!connectionDiagnostic.build_matches?'build_changed'
    :foreignDialogs.length?'foreign_dialog':null;
  const ownerVerified=!!owner&&!boundaryRefusal,previewOwned=previewBound&&!boundaryRefusal;
  const candidates=ownerVerified?[root]:[];
  const loaded=value(previewForm,'FLoaded');
  const previewSettled=previewOwned&&loaded===true;
  if(previewOwned&&!root.contains(preview))candidates.push(preview);
  const messages=[];
  for(const candidate of candidates){
    for(const element of candidate.querySelectorAll('.bg-error-messages,[data-tid$=";cntErrorInfo"],[data-tid*=";colMessage_"]')){
      if(!visible(element))continue;
      const text=element.textContent??'';
      if(text.length>4096)throw Error('Execution message exceeds observation bound');
      messages.push({key:element.getAttribute('data-tid')??element.id,text});
    }
  }
  if(messages.length>64)throw Error('Execution error inventory bound exceeded');
  const masks=[...document.querySelectorAll('.bg-mask-message,.x-mask-msg')].filter(visible);
  const pages=owner?[...root.querySelectorAll('[data-tid]')].filter(e=>visible(e)&&/^MF;TF(?:-\d+)?;WizrdMCF;[^;]+Wizard$/.test(e.getAttribute('data-tid'))):[];
  return {owner_verified:ownerVerified,native_owner_verified:!!nativeOwner,boundary_refusal:boundaryRefusal,
    connection_diagnostic:connectionDiagnostic,dialog_diagnostic:{visible_count:dialogs.length,foreign_count:foreignDialogs.length,
      roots:foreignDialogs.slice(0,3).map(element=>({tid:(element.getAttribute('data-tid')??'').slice(0,160),
        native_el:dom(globalThis.Ext?.getCmp?.(element.id))===element}))},wizard_visible:visible(root),preview_visible:previews.length>0,preview_owned:previewOwned,preview_settled:previewSettled,
    wizard_error:wizardError,
    preview_diagnostic:{exact_count:exactPreviews.length,visible_count:previews.length,code_count:codeRoots.length,code_owned:!!codeOwned,code_checks:codeChecks,
      wizard_item_count:Array.isArray(items)?items.length:null,matched_item_count:matches.length,
      controller_present:!!previewController,form_present:!!previewForm,loaded:typeof loaded==='boolean'?loaded:null,roots:previewDiagnostic},
    page_tid:pages.length===1?pages[0].getAttribute('data-tid'):null,pending:masks.length>0,messages};
}
