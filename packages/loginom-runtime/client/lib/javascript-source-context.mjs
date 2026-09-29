import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';

// Keep the full text inside the trusted host boundary. Callers must run the
// source reader's redaction and chunk admission before publishing any content.
export function makeJavascriptSourceContextCode(binding,account) {
  validatePreparedNodeContext(binding);
  if(typeof account!=='string'||!account||account.length>200)throw Error('JavaScript account required');
  return `async page=>(${readJavascriptSourceContext.toString()})(page,${JSON.stringify(binding)},${JSON.stringify(account)},${readPreparedNodeContext.toString()},${readJavascriptSourceBrowser.toString()})`;
}

export async function readJavascriptSourceContext(page,binding,account,readNode=readPreparedNodeContext,readBrowser=readJavascriptSourceBrowser) {
  const before=await readNode(page,binding);
  if(before.verified!==true||before.surface!=='wizard'||before.input_port||before.output_port)
    return {verified:false,reason:'javascript_source_surface'};
  const result=await page.evaluate(readBrowser,{prepared:binding,account});
  const after=await readNode(page,binding);
  if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'javascript_source_owner_changed'};
  return {...result,node_context:after};
}

// A single read of the active CodeMirror document. No editor setter, proxy,
// script evaluation, preview or wizard step is reachable from this function.
export function readJavascriptSourceBrowser({prepared,account}) {
  const refuse=reason=>({verified:false,reason});
  const visible=element=>!!element?.isConnected&&element.getBoundingClientRect().width>0
    &&element.getBoundingClientRect().height>0&&getComputedStyle(element).visibility!=='hidden';
  const app=globalThis.bg?.app,form=app?.Application?.FInstance?.FMainForm;
  const card=form?.Items?.Workspace?.getActiveTab?.(),wizard=card?.Controller?.Node?.data?.node;
  const node=wizard?.ParentNode,model=card?.Controller?.FController,root=model?.FView?.el?.dom;
  const preparation=globalThis.__loginomDockPreparationV1;
  const receipts=[...(preparation?.receipts?.values()??[])].filter(entry=>entry.phase==='verified'
    &&entry.workflowId===prepared.workflow_ref.workflow_id);
  const receipt=receipts.find(entry=>entry.nodeTargetWorkflowNode);
  const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
  const tabs=exact(prepared.workflow_ref.tab_tid);
  const roots=exact(prepared.workflow_ref.prefix+';WizrdMCF');
  if(preparation?.document!==document||preparation.id!==prepared.document_id
    ||app?.Version!=='7.4.2'||form?.FMapTree?.FServerConnection?.UserName!==account
    ||!receipt||receipts.some(entry=>entry.tab!==receipt.tab||entry.packageNode!==receipt.packageNode)
    ||tabs.length!==1||tabs[0]!==receipt.tab||!tabs[0].classList.contains('x-tab-active')
    ||roots.length!==1||roots[0]!==root
    ||!app?.WizardTreeNode||!(wizard instanceof app.WizardTreeNode)
    ||!app.ModelNodeTreeNode||!(node instanceof app.ModelNodeTreeNode)
    ||node.ParentNode!==receipt.nodeTargetWorkflowNode||node.FGuid!==prepared.node.node_id
    ||!node.FModelNode||node.FModelNode!==model?.FModelNode||!visible(root))
    return refuse('javascript_source_owner');
  const blockers=[...document.querySelectorAll('[role="dialog"],.x-message-box,.bg-mask-message,.x-mask-msg')].filter(visible);
  if(blockers.length)return refuse('javascript_source_blocked');
  const pageTid=prepared.workflow_ref.prefix+';WizrdMCF;JavaScriptCodeWizard';
  const pages=exact(pageTid).filter(element=>root.contains(element)&&visible(element));
  if(pages.length!==1)return refuse('javascript_source_page');
  const wrappers=[...root.querySelectorAll('.CodeMirror')].filter(element=>pages[0].contains(element)&&visible(element));
  if(wrappers.length!==1)return refuse('javascript_source_editor');
  const wrapper=wrappers[0],cm=wrapper.CodeMirror,doc=cm?.getDoc?.(),input=cm?.getInputField?.();
  if(!doc||cm.getWrapperElement?.()!==wrapper||!input?.isConnected||!wrapper.contains(input)
    ||!root.contains(input)||cm.getOption?.('readOnly')!==false||input.disabled===true||input.readOnly===true)
    return refuse('javascript_source_binding');
  const count=doc.lineCount?.();
  if(!Number.isSafeInteger(count)||count<1||count>1024||doc.firstLine?.()!==0||doc.lastLine?.()!==count-1)
    return refuse('javascript_source_lines');
  const lines=[];let bytes=0;
  for(let index=0;index<count;index++){
    const line=doc.getLine(index);
    if(typeof line!=='string'||/[\r\n\0]/u.test(line)||!line.isWellFormed())return refuse('javascript_source_characters');
    bytes+=new TextEncoder().encode(line).length+(index?1:0);
    if(bytes>32768)return refuse('javascript_source_bytes');
    lines.push(line);
  }
  return {verified:true,source:lines.join('\n'),source_utf8_bytes:bytes,source_lf_lines:count,page_tid:pageTid};
}
