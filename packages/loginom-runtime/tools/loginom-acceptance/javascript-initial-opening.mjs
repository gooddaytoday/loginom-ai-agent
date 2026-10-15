import {selectJavascriptForSettings} from '../../client/lib/javascript-owned-selection.mjs';

// Fresh-node opening has no reopen/deactivation confirmation authority.
export async function openJavascriptInitialWizard({page,binding,node,icon,deadline,record,guard,report,save,waitVisible,lifecycle}) {
  if(lifecycle.attempted)throw Error('Initial JavaScript opening already attempted; no replay');
  Object.assign(lifecycle,{attempted:true,deadline,openingIntent:false,settingDispatched:false,settingGestureReturned:false,wizardVisible:false});
  report.initial_opening=lifecycle;
  await selectJavascriptForSettings(page,{binding,node,icon,deadline,openSettings:true,lifecycle,beforeOpen:guard,
    record:async event=>{
      const saved=await record(event);
      if(event.phase==='javascript_private_open_dispatch'){
        lifecycle.openingIntent=true;
        report.effects.push({at:new Date().toISOString(),action:'open-wizard',node_id:node.id,state:'dispatching'});
        report.wizard_hit={...event.point,setting_tid:node.tid+';Setting',hit_tid:node.tid+';Setting'};
        await save();
      }
      if(event.phase==='javascript_private_open_gesture_returned')await save();
      return saved;
    }});
  if(!lifecycle.settingDispatched||!lifecycle.settingGestureReturned||Date.now()>=deadline)
    throw Error('Initial JavaScript opening unconfirmed under original deadline');
  await waitVisible(deadline);
  if(Date.now()>=deadline)throw Error('Initial JavaScript visible wait exceeded original deadline');
  lifecycle.wizardVisible=true;
  await save();
}

// Intent/ACK is not an opened wizard. An uncertain Setting reply cannot authorize
// restoreWorkflowForCleanup, Close or package disposal without observed ownership.
export function requireJavascriptInitialOpeningCleanup(lifecycle) {
  if(lifecycle.settingDispatched&&!lifecycle.wizardVisible)
    throw Error('Initial Setting dispatch unresolved; cleanup unconfirmed, no replay');
}
