import {makeJavascriptManagedPageCode,inspectManagedJavascriptPage} from './javascript-managed-page.mjs';
import {readJavascriptStage} from './javascript-stage-read.mjs';

// Retained selection ownership plus the native wizard/connection/page guards.
// A model cannot supply this host-only inspector or choose a browser context.
export function inspectManagedJavascriptStage({held,task},inspectPage,readStage) {
  return inspectPage({held,task},args=>{
    const map=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree;
    const lineage=new Set();
    for(let item=held.wizard;item&&lineage.size<32&&!lineage.has(item);item=item.ParentNode)lineage.add(item);
    if(location.origin!==task.targetOrigin||args.expectedWizard!==held.wizard||args.expectedRoot!==held.wizardRoot
      ||held.wizard?.ParentNode?.FGuid!==task.owner.node_id
      ||held.wizard.ParentNode.FModelNode!==args.binding.nodeData||held.wizard.ParentNode.ParentNode!==args.binding.workflow
      ||map?.PackageNodes?.Count!==1||map.PackageNodes.Items(0)!==held.receipt.packageNode||!lineage.has(held.receipt.packageNode)
      ||held.wizardRoot?.getAttribute('data-tid')!==task.workflow_ref.prefix+';WizrdMCF')
      throw Error('Managed JavaScript stage retained wizard changed');
    const stage=readStage({root:held.wizardRoot,native:held.wizard,binding:args.binding,
      prefix:args.prefix,account:args.account,build:task.targetBuild});
    stage.pending ||= [...document.querySelectorAll('.x-mask')].some(element=>element.isConnected
      &&element.getBoundingClientRect().width>0&&element.getBoundingClientRect().height>0
      &&getComputedStyle(element).visibility!=='hidden');
    if(stage.native_owner_verified!==true||!Object.values(stage.connection_diagnostic).every(Boolean))
      throw Error('Managed JavaScript stage native owner/connection changed');
    const result={owner:task.owner,...stage};
    if(new TextEncoder().encode(JSON.stringify(result)).length>16384)
      throw Error('Managed JavaScript stage response bound exceeded');
    return result;
  });
}

export async function runManagedJavascriptStageRead(page,task,inspect) {
  const lease=page[Symbol.for('loginom-dock.javascript-owned-selection-v1')]?.get(task.operation_id);
  const identity=JSON.stringify([task.owner,task.workflow_ref,task.targetOrigin,task.targetBuild,task.deadline]);
  if(!lease||lease.identity!==identity||lease.settingAttempted!==true||!lease.wizardCaptured||Date.now()>=task.deadline)
    throw Error('Managed JavaScript stage lease unavailable');
  return page.evaluate(inspect,{held:lease.handle,task});
}

export function javascriptManagedStageInspector() {
  return `function inspect(args){const pageRead=${inspectManagedJavascriptPage.toString()};`+
    `const stageRead=${readJavascriptStage.toString()};`+
    `return (${inspectManagedJavascriptStage.toString()})(args,pageRead,stageRead);}`;
}

export function makeJavascriptManagedStageCode(task) {
  makeJavascriptManagedPageCode(task);
  const inspect=javascriptManagedStageInspector();
  return `async page=>(${runManagedJavascriptStageRead.toString()})(page,${JSON.stringify(task)},${inspect})`;
}
