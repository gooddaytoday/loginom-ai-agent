// Dedicated acceptance close/open. Never used by an intermediate product save.
// No save command or unsaved-changes confirmation is available in this helper.
export function makePackageReopenQaCode({path,workflow_ref}) {
  if(typeof path!=='string'||!path.startsWith('/')||!path.endsWith('.lgp')
      ||!workflow_ref?.tab_tid||!workflow_ref?.prefix)throw Error('Exact saved path/workflow required');
  return `async page=>(${reopen.toString()})(page,${JSON.stringify({path,workflow_ref})})`;
}
async function reopen(page,{path,workflow_ref}) {
  const trace=[];const at=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']');
  const identity=()=>page.evaluate(()=>{
    const app=globalThis.bg?.app;let node=app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab()?.Controller?.Node?.data?.node;
    const seen=new Set();for(let depth=0;node&&depth<32&&!seen.has(node);depth++,node=node.ParentNode){seen.add(node);
      if(app.PackageTreeNode&&node instanceof app.PackageTreeNode)return {path:node.PackageFileName,name:node.PackageName};}
    return null;
  });
  const normalize=value=>typeof value==='string'?'/'+value.replaceAll('\\','/').replace(/^\/+/, ''):null;
  const before=await identity();if(normalize(before?.path)!==path||!await at(workflow_ref.tab_tid).isVisible())throw Error('QA saved package binding changed');
  if(!/(?:^|\s)x-tab-active(?:\s|$)/.test(await at(workflow_ref.tab_tid).getAttribute('class')??'')
      ||!await at(workflow_ref.prefix+';ModelForm;cntDiagram').isVisible())throw Error('QA exact saved graph is not active');
  await at('MF;cntMain;tlbMainToolbar;btnPackagesMenu').click();trace.push({event:'qa_menu_opened'});
  await at('MF;MainMenuForm;btnClosePackage').click();trace.push({event:'qa_close_clicked'});
  await at(workflow_ref.tab_tid).waitFor({state:'detached',timeout:15000});trace.push({event:'qa_saved_package_closed',workflow_ref});
  await at('MF;MainMenuForm;btnOpenPackage').waitFor({state:'hidden',timeout:15000});
  await at('MF;cntMain;tlbMainToolbar;btnPackagesMenu').click();trace.push({event:'qa_menu_opened'});
  await at('MF;MainMenuForm;btnOpenPackage').click();trace.push({event:'qa_open_clicked'});
  const input=at('OpenDialogForm;edtFileName').locator('input');await input.fill(path);await input.press('Tab');
  if(await input.inputValue()!==path)throw Error('QA open path did not commit');
  await at('OpenDialogForm;btnOpen').click();trace.push({event:'qa_open_confirmed',path});
  await at('OpenDialogForm;edtFileName').waitFor({state:'hidden',timeout:15000});
  await page.waitForFunction(expected=>{
    const app=globalThis.bg?.app;let node=app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab()?.Controller?.Node?.data?.node;
    for(let depth=0;node&&depth<32;depth++,node=node.ParentNode)if(app.PackageTreeNode&&node instanceof app.PackageTreeNode)
      return typeof node.PackageFileName==='string'&&'/'+node.PackageFileName.replaceAll('\\','/').replace(/^\/+/, '')===expected;
    return false;
  },path,{timeout:15000});
  const after=await identity();trace.push({event:'qa_reopened_path_observed',path:normalize(after?.path)});
  return {status:'SUCCEEDED',path,old_workflow_ref:workflow_ref,closed:true,reopened:true,save_performed:false,trace};
}
