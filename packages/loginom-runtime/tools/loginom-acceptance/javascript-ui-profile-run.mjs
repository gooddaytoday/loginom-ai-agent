import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createJavascriptManagedSourceAdapter} from '../../client/lib/javascript-managed-source-adapter.mjs';
import {openManagedJavascriptExistingWizard} from '../../client/lib/javascript-managed-existing.mjs';
import {dispatchManagedJavascriptNext} from '../../client/lib/javascript-managed-next.mjs';
import {makeJavascriptManagedPageCode} from '../../client/lib/javascript-managed-page.mjs';
import {makeJavascriptManagedSourceCode} from '../../client/lib/javascript-managed-source.mjs';
import {closeManagedJavascriptWizard} from '../../client/lib/javascript-managed-close.mjs';
import {makeJavascriptManagedSelectionReadCode} from '../../client/lib/javascript-managed-selection.mjs';
import {makeJavascriptSchemaContextCode} from '../../client/lib/javascript-schema-context.mjs';
import {makeJavascriptExistingGraphTypeCode} from '../../client/lib/javascript-existing-type.mjs';
import {javascriptSourceIdentity} from '../../client/lib/javascript-source-read.mjs';
import {javascriptSourceSettingsDigest} from '../../client/lib/javascript-source-admission.mjs';
import {verifyJavascriptMappingGraph} from '../../client/lib/javascript-graph-preservation.mjs';
import {createNodeProcedure} from '../../client/lib/node-procedure.mjs';
import {makeJavascriptUiProfileCode} from './javascript-ui-profile.mjs';

const need=(condition,message)=>{if(!condition)throw Error(message);};
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);

// SavedExecutionRuntime intentionally has no channel/configuration surface.
// This private observer exposes only the existing prepared-node observation.
export function createJavascriptUiProfileChannel({prepared,node,deadline,targetOrigin,execute,record}) {
  need(prepared?.document_id===node?.document_id&&prepared.workflow_ref?.workflow_id===node.workflow_id
    &&typeof node.node_id==='string'&&Number.isSafeInteger(deadline)&&deadline>Date.now(),
  'UI profile observation channel owner/deadline unavailable');
  const reader=createNodeProcedure({operation:{id:'js-ui-observe-'+randomUUID(),
    action:{action_key:'diagnostic.javascript',revision:'1'},deadline},execute,record,
    targetOrigin,targetBuild:'7.4.2',maxSteps:4096,
    preparedNodeContext:{document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node}});
  return Object.freeze({observe:options=>reader.observe(options)});
}

// Two independent preserved openings, never a writer/Done/Execute procedure.
export async function runJavascriptUiProfile({page,prepared,node,targetOrigin,deadline,record,
  report,save,onPending,schemaMode,runtime,directory}) {
  need(['code','declared'].includes(schemaMode)&&Date.now()+240000<deadline,'UI profile original mode/budget unavailable');
  const execute=code=>Function('return ('+code+')')()(page),namespace='js-ui-profile-'+randomUUID();
  const beforeGraph=await runtime.graph(),openings=[];
  report.ui_profile={version:1,status:'RUNNING',schema_mode:schemaMode,node,openings,
    helper_invoked:false,engine_selection_changed:false,explicit_execute_requested:false,
    hidden_execution_absence_claimed:false,full_type_observed:false};
  report.scope='private G1/J22 retained wizard UI profile; preserved independent source/settings opens';
  report.explicit_execution_limit=0;report.candidate_verified=false;report.cli_verified=false;report.gates_closed=[];
  await save();
  for(let index=0;index<2;index++){
    const owner={document_id:node.document_id,workflow_id:node.workflow_id,node_id:node.node_id,
      operation_id:namespace+'-'+index,ui_epoch:index},profiles=[];
    const observe=async task=>{
      const pageState=await execute(makeJavascriptManagedPageCode(task));
      const observation=await execute(makeJavascriptUiProfileCode(task));
      need(observation.owner_verified===true&&observation.native_owner_verified===true
        &&observation.ui_profile.quiet_owner_verified===true&&observation.ui_profile.mask_classification.blocker_count===0
        &&same(observation.owner,task.owner)
        &&observation.ui_profile?.inventory_complete===true&&pageState.ready===true
        &&pageState.node_guid===node.node_id&&pageState.page.tid===observation.ui_profile.page_tid,
      'UI profile ownership/quiet state differs');
      const file='ui-profile-'+index+'-'+profiles.length+'.png';
      await page.screenshot({path:directory+'/'+file,fullPage:false,timeout:10000,
        mask:[page.locator('input:not([type="checkbox"]):not([type="radio"]),textarea,[contenteditable="true"],.CodeMirror,.monaco-editor')]});
      const after=await execute(makeJavascriptUiProfileCode(task));
      need(same(after,observation),
        'UI profile changed during image observation');
      observation.ui_profile.navigation=pageState.page;
      const image={file,sha256:createHash('sha256').update(await readFile(directory+'/'+file)).digest('hex'),
        scope:'private masked owned wizard viewport'};
      const event={phase:'javascript_ui_profile_observed',operation_id:task.operation_id,owner:task.owner,
        deadline:task.deadline,observation,image};
      const ack=await record(structuredClone(event));
      need(same(Object.fromEntries(Object.keys(event).map(key=>[key,ack?.[key]])),event),'UI profile journal ACK differs');
      profiles.push({...observation,image});return observation;
    };
    const driver={openManagedJavascriptExistingWizard,makeJavascriptExistingGraphTypeCode,
      makeJavascriptSchemaContextCode,makeJavascriptManagedPageCode,makeJavascriptManagedSourceCode,
      closeManagedJavascriptWizard,makeJavascriptManagedSelectionReadCode,
      dispatchManagedJavascriptNext:async options=>{
        const observed=await observe(options.task);
        need(observed.page_tid===prepared.workflow_ref.prefix+';WizrdMCF;JavaScriptColumnsWizard',
          'UI profile initial Columns page differs');
        const result=await dispatchManagedJavascriptNext(options);
        const event={phase:'javascript_ui_profile_next_returned',operation_id:options.task.operation_id,
          owner:options.task.owner,deadline:options.task.deadline,result};
        const ack=await record(structuredClone(event));
        need(same(Object.fromEntries(Object.keys(event).map(key=>[key,ack?.[key]])),event),'UI profile Next ACK differs');
        return result;
      }};
    const adapter=createJavascriptManagedSourceAdapter({page,prepared,node,uiEpoch:index,deadline,targetOrigin,
      execute,record,driver,channel:until=>createJavascriptUiProfileChannel({prepared,node,deadline:until,
        targetOrigin,execute,record}),
      receiptOptions:(id,key,signature)=>({receipt_namespace:namespace,receipt_id:id,receipt_signature:signature})});
    report.stage='ui-profile-opening-'+index;onPending(true);await save();
    const handle=await adapter.open({owner,deadline}),source=await adapter.read(handle,{owner,deadline});
    await observe(handle.task);
    need(source.settings.generation===(schemaMode==='code')&&profiles.length===2,
      'UI profile saved schema mode/pages differ');
    const entry={owner,managed_operation_id:handle.task.operation_id,managed_deadline:handle.task.deadline,
      ...javascriptSourceIdentity(source.source),settings:source.settings,
      settings_sha256:javascriptSourceSettingsDigest(source.settings),profiles,source_read_complete:true};
    const ack=await record({phase:'javascript_ui_profile_source_verified',proof:structuredClone(entry)});
    need(same(ack.proof,entry),'UI profile source/settings ACK differs');
    const closed=await adapter.discard(handle,{owner,deadline});
    need(closed.closed===true&&!adapter.active&&!adapter.uncertain,'UI profile owned discard unconfirmed');
    openings.push({...entry,closed});onPending(false);await save();
  }
  need(openings.length===2
    &&['source_sha256','source_utf8_bytes','source_lf_lines','settings_sha256'].every(key=>openings[0][key]===openings[1][key])
    &&same(openings[0].settings,openings[1].settings),'UI profile independent source/settings drift');
  const afterGraph=await runtime.graph();
  verifyJavascriptMappingGraph(beforeGraph,afterGraph,node);
  Object.assign(report.ui_profile,{status:'OBSERVED',graph_before:beforeGraph,graph_after:afterGraph,
    source_settings_preserved:true,observed_pages:openings[0].profiles.map(item=>item.ui_profile.page_tid)});
  report.stage='ui-profile-observed';await save();
}
