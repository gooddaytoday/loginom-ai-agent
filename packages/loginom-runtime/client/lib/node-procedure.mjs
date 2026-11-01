import {makeSamplingContextCode} from './sampling-context.mjs';
import {makeLogRegressionContextCode} from './log-regression-context.mjs';
import {makeLinRegressionContextCode} from './linregression-context.mjs';
import {makeAutoCorrelationContextCode} from './auto-correlation-context.mjs';
import {makeCorrAnalysisContextCode} from './corr-analysis-context.mjs';
import {makeElimOutlierContextCode} from './elim-outlier-context.mjs';
import {makeClusteringContextCode} from './clustering-context.mjs';
import {readGraph} from './node-target-browser.mjs';
import {NODE_TYPES} from './node-contracts.mjs';
import {revealPreparedGraphNode,revealNodePlacement,nodePlacementViewport,nodePlacementPoint,samePlacementGraph} from './node-placement.mjs';
import {makeJavascriptOutputPreviewCode} from './javascript-output-preview.mjs';
import {makeCrossTableContextCode} from './crosstable-context.mjs';
import {makeCrossTableVariablesCode,makeCrossTableBindingsCode} from './crosstable-variables.mjs';
import {makeNodeProcessControlCode} from './node-process-control.mjs';
import {makeReplacementContextCode} from './replacement-context.mjs';
import {makeSlidingWindowContextCode} from './sliding-window-context.mjs';
import {makeDateTimeContextCode} from './date-time-context.mjs';
import {makeMissingValuesContextCode} from './missing-values-context.mjs';
import {makeCollapseContextCode} from './collapse-context.mjs';
import { createHash } from 'node:crypto';
import { makeWorkspaceUiCode, validateUiAction, makeBlockingWindowDiagnosticCode } from './workspace-ui.mjs';
import {validatePreparedNodeContext} from './node-context.mjs';
import {makeNodeMappingContextCode} from './node-mapping-context.mjs';
import {makeNodePreviewSchemaCode} from './node-preview-schema.mjs';
import {makeSortingContextCode} from './sorting-context.mjs';
import {makeUnionContextCode} from './union-context.mjs';
import {makeJoinContextCode} from './join-context.mjs';
import {makeFilterContextCode} from './filter-context.mjs';
import {makeDuplicatesContextCode} from './duplicates-context.mjs';
import {makeReformContextCode} from './reform-context.mjs';
import {makeGroupingContextCode} from './grouping-context.mjs';
import {makeCalculatorContextCode} from './calculator-context.mjs';
import {makeJavascriptSchemaContextCode} from './javascript-schema-context.mjs';
import {makePreparedOutputPortOpenCode,makePreparedInputPortOpenCode} from './node-port-open.mjs';
import {makeNodeProcessContextCode} from './node-process-context.mjs';
import {makeNodeOutputContextCode,makeTreeWizardContextCode} from './node-output-context.mjs';
import {makeNodePortOutputCode} from './node-port-output.mjs';
import {makeNodeTableContextCode} from './node-table-context.mjs';
import {boundWizardCloseConfirmation,wizardCloseDialogOwner,wizardCloseBinding,boundInputMappingConflict} from './node-wizard-close.mjs';
import {boundWizardDeactivationConfirmation,wizardDeactivationDialogOwner} from './node-wizard-open.mjs';
import {isUnchangedTransformExecution} from './node-read-contract.mjs';
const boundWizardConfirmation=(...args)=>boundWizardCloseConfirmation(...args)||boundWizardDeactivationConfirmation(...args)||boundInputMappingConflict(...args);
const wizardConfirmationOwner=(...args)=>wizardCloseDialogOwner(...args)||wizardDeactivationDialogOwner(...args);

export class NodeReadinessTimeout extends Error {
  constructor(condition) {
    super('Node procedure readiness timeout: '+condition+'; no mutation was authorized');
    this.name='NodeReadinessTimeout';this.condition=condition;
  }
}

export class NodeProcedureStepError extends Error {
  constructor(receipt) {
    super('Node procedure step did not confirm completion; inspect before retry'
      +(typeof receipt?.error?.message==='string'?': '+receipt.error.message.slice(0,500):''));
    this.name = 'NodeProcedureStepError';
    this.receipt = structuredClone(receipt);
  }
}

// Остаток бюджета наблюдения бывает короче самого чтения; обрезанный до него
// таймаут выдаёт исчерпание ожидания за потерю транспорта.
const MIN_OBSERVATION_READ_MS = 5000;
const OUTPUT_SETTLEMENT_READ_MS = 35000;

const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

// Private transport for fixed, client-pinned node procedures. No recipes, UI
// selectors or step arrays are accepted from the caller. The enclosing action
// runtime owns its mutation gate for the whole procedure, including observations.
export function createNodeProcedure({ operation, execute, record, wrapMutation,
  targetOrigin, targetBuild, now = Date.now, monotonicNow = now === Date.now ? () => performance.now() : now, maxSteps = 96, signal, preparedNodeContext,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  let sequence = 0;
  const nextStep=()=>{sequence++;return operation.nodeStepSequence=(operation.nodeStepSequence??0)+1;};
  let snapshot = null;
  let lastPreparedStep = null;
  // Bounded identities of prepared gestures. A recovery reads their own
  // browser receipts; the log never authorizes a gesture by itself.
  const preparedSteps = [];
  let preparedStepsTrimmed = false;
  let evidenceSnapshot = null;
  let snapshotTableDialog = null;
  let snapshotWizardConfirmation = null;
  let launchConfirmed = false;
  let launchConsoleControl;
  const rememberConsoleControl = state => {
    if(launchConfirmed||!preparedNodeContext||state.prepared_node_context?.surface!=='graph')return;
    const buttons=state.ui.elements.filter(e=>e.tid==='MF;cntMain;tlbMainToolbar;btnProgress');
    if(buttons.length===1&&buttons[0].ref&&buttons[0].signature&&buttons[0].enabled===true
      &&buttons[0].allowed_actions.includes('click'))
      launchConsoleControl={ref:buttons[0].ref,signature:structuredClone(buttons[0].signature)};
  };
  if(preparedNodeContext)validatePreparedNodeContext(preparedNodeContext);
  const boundOptions=preparedNodeContext?{prepared_node_context:structuredClone(preparedNodeContext)}:{};
  let uiContext=preparedNodeContext?null:operation.checkpoint;
  const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const checkBudget = () => {
    signal?.throwIfAborted();
    if (sequence >= maxSteps || now() >= operation.deadline) {
      throw new Error('Node procedure budget exhausted; inspect the partial result');
    }
  };
  const entry = (phase, details) => record({ operation_id: operation.id,
    action_key: operation.action.action_key, action_revision: operation.action.revision,
    phase, internal_provenance: 'client_node_procedure_v1', ...details });
  const allowedDialog=(d,dialog)=>dialog && d.identity?.anchor_tid===dialog.table.table_tid+';ModalWindow_Browse'+(dialog.kind==='format'?'Format':'Filter');
  const allowedOutputEditor=(dialog,state)=>['output_mapping','input_mapping'].includes(state.wizard?.stage)
    &&state.wizard.column_parameters?.status==='observed'&&state.wizard.column_parameters.portal_bound===true
    &&state.wizard.column_parameters.root_tid===(state.wizard.stage==='input_mapping'?'EditTuneColumnDefForm':'EditColumnDefForm')
    &&state.wizard.column_parameters.selected_column?.status==='observed'
    &&dialog.ref===state.wizard.column_parameters.root_ref&&dialog.identity?.anchor_tid===state.wizard.column_parameters.root_tid;
  const allowedExpressionEditor=(dialog,state)=>state.wizard?.stage==='calculator'
    &&state.wizard.expression_parameters?.status==='observed'&&state.wizard.expression_selection?.status==='observed'
    &&state.wizard.expression_parameters.selected_expression?.tid===state.wizard.root_tid+';CalcDataWizard;colExpressionName_'+state.wizard.expression_selection.name
    &&dialog.ref===state.wizard.expression_parameters.root_ref&&dialog.identity?.anchor_tid===state.wizard.root_tid+';ExprDataEditForm';
  const allowedFactorEditor=(dialog,state)=>state.wizard?.stage==='grouping'
    &&state.wizard.factor_editor?.status==='rendered_factor_options'
    &&state.wizard.factor_editor.selected_field?.status==='rendered_selected'
    &&dialog.ref===state.wizard.factor_editor.dialog_ref
    &&dialog.identity?.anchor_tid===state.wizard.root_tid+';FactorEditDialog';
  const allowedPreview=(dialog,state)=>state.node_preview_schema?.verified===true
    &&dialog.identity?.anchor_tid===state.node_preview_schema.root_tid
    &&state.node_preview_schema.node_id===preparedNodeContext?.node.node_id;
  const allowedCalculatorPreview=(dialog,state)=>state.prepared_node_context?.surface==='wizard'
    &&state.wizard?.stage==='calculator'&&state.wizard.calculator_preview?.status==='observed'
    &&dialog.ref===state.wizard.calculator_preview.root_ref
    &&dialog.identity?.anchor_tid===state.wizard.root_tid+';CalcPreviewForm';
  const pendingPreviewDialog=(dialog,state)=>{
    const root=preparedNodeContext?.workflow_ref.prefix+';ModelForm;PreviewWindow';
    return !!preparedNodeContext&&state.prepared_node_context?.surface==='graph'
      &&state.node_preview_schema?.verified===false&&dialog.identity?.anchor_tid===root
      &&state.ui.masks?.some(m=>m.kind==='busy'&&m.dialog_ref===dialog.ref
        &&[root+';PreviewForm',root+';PreviewForm;DataSetForm'].includes(m.target_tid));
  };
  const allowedReformEditor=(dialog,state)=>state.wizard?.stage==='field_parameters'
    &&state.wizard.reform_parameters?.status==='observed'&&state.wizard.reform_parameters.portal_bound===true
    &&state.wizard.reform_parameters.selected_column?.status==='observed'
    &&dialog.ref===state.wizard.reform_parameters.root_ref&&dialog.identity?.anchor_tid===state.wizard.reform_parameters.root_tid;
  const allowedFilterEditor=(dialog,state)=>state.wizard?.stage==='row_filter'&&state.node_filter?.verified===true
    &&state.node_filter.dialogs?.length===1&&state.node_filter.dialogs[0].root_tid===dialog.identity?.anchor_tid;
  const allowedMissingValuesEditor=(dialog,state)=>state.wizard?.stage==='missing_values'
    &&state.node_missing_values?.verified===true&&state.node_missing_values.method_context
    &&dialog.title==='Редактирование значения замены для пропусков'
    &&state.node_missing_values.fields.some(f=>f.record_id===state.node_missing_values.method_context.record_id&&f.name===state.node_missing_values.method_context.field_name&&f.used&&f.method==='constant'&&f.type==='string')
    &&['msgbox;cnt;cnt;txt','msgbox;tlb;ok','msgbox;tlb;cancel'].every(tid=>state.ui.elements.some(e=>(e.tid===tid||e.identity?.anchor_tid===tid)&&e.signature?.dialog_ref===dialog.ref));
  // An owned filter modal may paint its loading mask before its native editor
  // record is available. This permits waiting only; it cannot satisfy readiness.
  const pendingFilterDialog=(dialog,state)=>{
    const filter=state.node_filter,wizard=state.wizard,tid=dialog.identity?.anchor_tid;
    const codes=tid===wizard?.root_tid+';ModalWindow_BetweenValuesEditor'?[8,9]
      :tid===wizard?.root_tid+';ModalWindow_ValueListEditor'?[10,11]:[];
    return wizard?.stage==='row_filter'&&filter?.verified===true&&codes.length>0
      &&filter.selection?.length===1&&filter.rows?.some(r=>r.record_id===filter.selection[0]&&codes.includes(r.operator_code))
      &&state.ui.masks?.some(m=>m.kind==='busy'&&m.ref===dialog.ref&&m.dialog_ref===dialog.ref&&m.target_tid===tid);
  };
  const allowedCrossTableEditor=(dialog,state)=>{
    const c=state.node_crosstable,name=dialog.identity?.anchor_tid?.split(';').at(-1);
    return state.wizard?.stage==='crosstable'&&c?.verified===true&&c.selected_used?.length===1
      &&c.input_fields.some(f=>f.record_id===c.selected_used[0]&&f.disposition===(name==='FactorEditDialog'?3:name==='ColumnEditDialog'?1:-1))
      &&c.dialogs?.filter(d=>d.tid===dialog.identity.anchor_tid&&d.name===name).length===1
      &&dialog.identity.anchor_tid===state.wizard.root_tid+';'+name;
  };
  const allowedClusteringEditor=(dialog,state)=>state.wizard?.stage==='normalization'&&state.node_clustering?.verified===true
    &&state.node_clustering.kind==='normalization'&&state.node_clustering.editor?.root_tid===state.wizard.root_tid+';ColumnsEditForm'
    &&dialog.identity?.anchor_tid===state.node_clustering.editor.root_tid
    &&state.node_clustering.editor.record_ids.length>0&&state.node_clustering.editor.record_ids.every(id=>state.node_clustering.selected.includes(id));
  const allowedNodeEditor=(dialog,state)=>allowedClusteringEditor(dialog,state)||allowedCrossTableEditor(dialog,state)||allowedMissingValuesEditor(dialog,state)||allowedFilterEditor(dialog,state)||allowedExpressionEditor(dialog,state)||allowedFactorEditor(dialog,state)||allowedPreview(dialog,state)||allowedCalculatorPreview(dialog,state)||allowedReformEditor(dialog,state);
  const assertContext = (state, allowTransient = false, tableDialog = null, rootsOnly = false, wizardConfirmation = null) => {
    if(preparedNodeContext) {
      const b=state.prepared_node_context;
      if(b?.verified!==true || b.document_id!==preparedNodeContext.document_id
        || b.workflow_id!==preparedNodeContext.workflow_ref.workflow_id || b.node_id!==preparedNodeContext.node.node_id)
        throw new Error('Prepared node binding is missing or changed');
      uiContext??={workflow_ref:structuredClone(state.workflow_ref),document_id:state.dom_epoch?.document};
    }
    const expected = uiContext;
    if (state.origin !== targetOrigin || state.loginom_build !== targetBuild
      || JSON.stringify(canonical(state.workflow_ref)) !== JSON.stringify(canonical(expected.workflow_ref))
      || !expected.document_id || state.dom_epoch?.document !== expected.document_id) {
      throw new Error('Node procedure document or workflow changed');
    }
    // Root discovery carries identity but deliberately omits blocker details.
    // A rediscovery never authorizes a gesture; its next full read checks them.
    if(rootsOnly)return;
    const closing=boundWizardConfirmation(state,wizardConfirmation,false);
    const expressionModal=state.ui?.dialogs?.length===1&&allowedNodeEditor(state.ui.dialogs[0],state);
    const expressionMask=m=>expressionModal&&m.kind==='modal_background'&&m.target_tid===state.wizard.root_tid&&m.ref===state.wizard.root_ref;
    if (!Array.isArray(state.ui?.masks) || !Array.isArray(state.ui?.dialogs)
      || (!allowTransient && !closing && state.ui.masks.some(m=>!expressionMask(m)))
      || !closing && state.ui.dialogs.some(d => !allowedDialog(d,tableDialog) && !allowedOutputEditor(d,state) && !allowedNodeEditor(d,state) && (!allowTransient || d.identity?.anchor_tid !== 'toast' && !pendingFilterDialog(d,state) && !pendingPreviewDialog(d,state)))
      || ['dialogs','masks'].some(key => state.ui.truncated?.[key] !== false)
      || state.scan?.complete !== true) {
      throw new Error('Node procedure is blocked by a mask or dialog');
    }
  };
  const crossTableOwnedStep=async(verb,payload,makeCode)=>{
    checkBudget();
    if(!preparedNodeContext)throw Error('Prepared CrossTable owner required');
    const step=nextStep(),id=operation.id+':n'+step,actionKey='node.crosstable.'+verb+'.internal',action={verb,...payload};
    const signature=digest([id,action,preparedNodeContext]);snapshot=null;evidenceSnapshot=null;
    const prepared=await entry('node_step_prepared',{step,internal_operation_id:id,action,signature});
    if(prepared?.signature!==signature||JSON.stringify(prepared.action)!==JSON.stringify(action))throw Error('CrossTable step was not durably prepared');
    checkBudget();
    const deadline=operation.deadline,code=makeCode(preparedNodeContext,{...payload,origin:targetOrigin,build:targetBuild,operation_id:id,deadline});
    const envelope=`async page=>{const r=await (${code})(page);return {status:r.status,action_key:${JSON.stringify(actionKey)},action_revision:'1',operation_id:${JSON.stringify(id)},phase:${JSON.stringify(verb)},effect_possible:r.effect_possible,cleanup_complete:r.cleanup_complete,output:r,error:r.error?{code:'CROSSTABLE_VARIABLE_STEP_UNCONFIRMED',message:r.error}:null,trace:[]}}`;
    let result;
    try{result=await execute(wrapMutation(envelope,{id,signature,action_key:actionKey}),{timeout:Math.max(5000,deadline-now()+5000)});}
    catch(error){operation.transportUncertain=true;operation.cleanupConfirmed=false;throw error;}
    if(result.operation_id!==id||result.action_key!==actionKey){operation.transportUncertain=true;operation.cleanupConfirmed=false;throw Error('CrossTable step receipt differs');}
    operation.cleanupConfirmed=result.cleanup_complete===true;operation.nodeEffectPossible ||= result.effect_possible===true;
    const completed=await entry('node_step_completed',{step,internal_operation_id:id,outcome:structuredClone(result)});
    if(JSON.stringify(completed?.outcome)!==JSON.stringify(result))throw Error('CrossTable outcome was not durably preserved');
    if(result.status!=='SUCCEEDED'||!operation.cleanupConfirmed||result.output?.verified!==true
      ||!['document_id','workflow_id','node_id'].every(k=>result.output.node_context?.[k]===(k==='document_id'?preparedNodeContext.document_id:k==='workflow_id'?preparedNodeContext.workflow_ref.workflow_id:preparedNodeContext.node.node_id)))throw new NodeProcedureStepError(result);
    return structuredClone(result.output);
  };
  const channel = {
    // Private cleanup proofs must use the same clock as this procedure's deadline.
    now,
    async readOutputPort(request) {
      checkBudget();
      if(!preparedNodeContext)throw Error('Prepared node required for direct output read');
      const code=makeNodePortOutputCode(preparedNodeContext,request,{origin:targetOrigin,build:targetBuild,deadline:operation.deadline});
      snapshot=null;evidenceSnapshot=null;
      // Only an actual dispatch invalidates the previous read's cleanup proof.
      operation.portReadCleanupComplete=false;
      operation.cleanupConfirmed=false;
      let result;
      try{result=await execute(code,{timeout:Math.max(5000,operation.deadline-now()+5000)});}
      catch(error){operation.transportUncertain=true;throw error;}
      const context=result?.node_context;
      const owner=context?.verified===true&&context.document_id===preparedNodeContext.document_id
        &&context.workflow_id===preparedNodeContext.workflow_ref.workflow_id&&context.node_id===preparedNodeContext.node.node_id;
      const valid=!!result&&typeof result.verified==='boolean'&&typeof result.cleanup_complete==='boolean'
        &&(result.verified?owner&&result.output?.port===request.port&&result.output.fresh===true
          &&result.output.execution_id===request.execution.execution_id&&result.output.freshness_basis==='completed_execution_port_source'
          :typeof result.reason==='string');
      operation.portReadCleanupComplete=operation.cleanupConfirmed=valid&&result.cleanup_complete===true;
      checkBudget();
      if(valid&&!result.verified&&result.read_diagnostic)await entry('node_port_output_read_refused',{reason:result.reason,diagnostic:structuredClone(result.read_diagnostic),cleanup_complete:result.cleanup_complete});
      if(!valid||!result.verified||!operation.cleanupConfirmed)throw Error('Direct output read refused'+(valid&&!result.verified?': '+result.reason:''));
      await entry('node_port_output_read',{outcome:structuredClone(result)});
      checkBudget();
      return structuredClone(result);
    },
    async openJavascriptPreview(port){
      checkBudget();
      if(!preparedNodeContext||!['transform.group_data','transform.sorting','transform.calculator','transform.filter_data','transform.join_data'].includes(operation.parameters?.target?.type))
        throw Error('Managed preview is restricted to native Group, Sort, Calculator, Filter and Join preflight');
      const task={operation_id:operation.id+':preview'+nextStep(),owner:preparedNodeContext.node,
        workflow_ref:{prefix:preparedNodeContext.workflow_ref.prefix,tab_tid:preparedNodeContext.workflow_ref.tab_tid},
        output:{index:port.index,native_index:port.native_index,active:port.active,port_guid:port.port_guid},
        targetOrigin,targetBuild,deadline:operation.deadline};
      const read=mode=>execute(makeJavascriptOutputPreviewCode({...task,mode}),{timeout:Math.max(5000,operation.deadline-now()+5000)});
      const captureKey='node.javascript.preview.capture.internal',captureSignature=digest([task,'capture']);
      let expected;
      try{expected=await execute(wrapMutation(makeJavascriptOutputPreviewCode({...task,mode:'capture'}),
        {id:task.operation_id,signature:captureSignature,action_key:captureKey}),
        {timeout:Math.max(5000,operation.deadline-now()+5000)});}
      catch(error){operation.transportUncertain=true;operation.cleanupConfirmed=false;throw error;}
      if(expected?.status==='NOT_APPLIED'){
        if(expected.operation_id!==task.operation_id||expected.action_key!==captureKey||expected.action_revision!=='1'
          ||expected.phase!=='capture'||expected.effect_possible!==false||expected.cleanup_complete!==true
          ||expected.output?.lease_disposed!==true||expected.output.execution_started!==false
          ||expected.output.port_guid!==port.port_guid
          ||!['document_id','workflow_id','node_id'].every(k=>expected.output.node_context?.[k]===task.owner[k]))
          throw Error('Managed preview capture receipt identity differs');
        const event={lease_operation_id:task.operation_id,owner:task.owner,port_guid:port.port_guid,
          reference:structuredClone(operation.lastReceipt),receipt:structuredClone(expected)};
        const saved=await entry('node_preview_capture_refused',event);
        if(JSON.stringify(Object.fromEntries(Object.keys(event).map(k=>[k,saved?.[k]])))!==JSON.stringify(event))
          throw Error('Managed preview capture refusal was not durably acknowledged');
        if(operation.groupingPreview?.managed===true)Object.assign(operation.groupingPreview,
          {failed:true,capture_refused:true,lease_disposed:true,reference:event.reference,receipt:event.receipt});
        throw Error(expected.error?.message??'Managed preview capture refused');
      }
      snapshot=null;evidenceSnapshot=null;
      try{
        for(const mode of ['select','open']){
          checkBudget();
          const step=nextStep(),id=operation.id+':n'+step,actionKey='node.javascript.preview.'+mode+'.internal';
          const action={verb:'javascript_preview_'+mode,lease_operation_id:task.operation_id,owner:task.owner,port_guid:port.port_guid,expected};
          const signature=digest([id,action,task]);
          const prepared=await entry('node_step_prepared',{step,internal_operation_id:id,action,signature});
          if(prepared?.signature!==signature||JSON.stringify(prepared.action)!==JSON.stringify(action))
            throw Error('Managed preview step was not durably prepared');
          checkBudget();
          const code=makeJavascriptOutputPreviewCode({...task,mode,gesture_id:id,expected});
          let result;
          try{result=await execute(wrapMutation(code,{id,signature,action_key:actionKey}),{timeout:Math.max(5000,operation.deadline-now()+5000)});}
          catch(error){operation.transportUncertain=true;operation.cleanupConfirmed=false;throw error;}
          if(result?.operation_id!==id||result.action_key!==actionKey||result.action_revision!=='1'){
            operation.transportUncertain=true;operation.cleanupConfirmed=false;throw Error('Managed preview receipt identity differs');
          }
          operation.cleanupConfirmed=false;operation.nodeEffectPossible ||= result.effect_possible===true;
          const completed=await entry('node_step_completed',{step,internal_operation_id:id,outcome:structuredClone(result)});
          if(JSON.stringify(completed?.outcome)!==JSON.stringify(result)){
            operation.cleanupConfirmed=false;throw Error('Managed preview outcome was not durably preserved');
          }
          if(result.status!=='SUCCEEDED'||result.effect_possible!==true||result.cleanup_complete!==(mode==='select')
            ||result.output?.verified!==true||result.output.execution_started!==false||result.output.port_guid!==port.port_guid
            ||!['document_id','workflow_id','node_id'].every(k=>result.output.node_context?.[k]===task.owner[k]))
            throw new NodeProcedureStepError(result);
          operation.cleanupConfirmed=mode==='select';
          if(mode==='select'){
            do{checkBudget();expected=await read('inspect');if(!expected.selected)await wait(100);}while(!expected.selected);
          }
        }
      }finally{if(!operation.transportUncertain){
        const disposed=await read('dispose');
        if(operation.groupingPreview?.managed===true&&disposed?.disposed===true){
          const saved=await entry('node_preview_lease_disposed',{lease_operation_id:task.operation_id,
            owner:task.owner,port_guid:port.port_guid,disposed:true});
          if(saved?.lease_operation_id!==task.operation_id||saved.port_guid!==port.port_guid||saved.disposed!==true
            ||JSON.stringify(saved.owner)!==JSON.stringify(task.owner))throw Error('Preview disposal was not durably acknowledged');
          operation.groupingPreview.lease_disposed=true;
        }
      }}
      return {verified:true,port_guid:port.port_guid,execution_started:false};
    },
    async configureCrossTableVariables(variables) {return crossTableOwnedStep('local_variables',{variables},makeCrossTableVariablesCode);},
    async bindCrossTableVariables(bindings) {return crossTableOwnedStep('bindings',{bindings},makeCrossTableBindingsCode);},
    async revealGraphNode({target='drawing'}={}) {
      if(!['drawing','body'].includes(target))throw Error('Unknown node viewport target');
      checkBudget();
      if(!preparedNodeContext)throw Error('Viewport navigation requires a prepared node');
      const before=await channel.observe({condition:'prepared graph before node viewport navigation',
        ready:s=>s.prepared_node_context?.surface==='graph'&&s.prepared_node_context.locked===false&&s.wizard?.status==='absent'});
      assertContext(before);checkBudget();
      const step=nextStep(),id=operation.id+':n'+step,action={verb:'reveal_prepared_node',target},actionKey='node.viewport.reveal.internal';
      const signature=digest([id,action,evidenceSnapshot]),observationHash=digest(evidenceSnapshot);
      snapshot=null;evidenceSnapshot=null;
      const prepared=await entry('node_step_prepared',{step,internal_operation_id:id,action,observation_sha256:observationHash,signature});
      if(prepared?.signature!==signature||JSON.stringify(prepared.action)!==JSON.stringify(action))throw Error('Node viewport navigation was not durably prepared');
      signal?.throwIfAborted();checkBudget();
      const code=`async page=>(${revealPreparedGraphNode.toString()})(page,${JSON.stringify({binding:preparedNodeContext,origin:targetOrigin,build:targetBuild,deadline:operation.deadline,types:NODE_TYPES,target})},${readGraph.toString()},${revealNodePlacement.toString()},${nodePlacementViewport.toString()},${nodePlacementPoint.toString()},${samePlacementGraph.toString()})`;
      const envelope=`async page=>{const r=await (${code})(page);return {status:r.status,action_key:${JSON.stringify(actionKey)},action_revision:'1',operation_id:${JSON.stringify(id)},phase:'node_viewport',effect_possible:r.effect_possible,cleanup_complete:r.cleanup_complete,output:r,error:r.status==='SUCCEEDED'?null:{code:'NODE_VIEWPORT_NOT_REVEALED',message:'Prepared node viewport: node not revealed'},trace:[]}}`;
      let result;
      try{result=await execute(wrapMutation(envelope,{id,signature,action_key:actionKey}),{timeout:Math.max(1,operation.deadline-now())});}
      catch(error){operation.transportUncertain=true;operation.cleanupConfirmed=false;throw error;}
      if(result.operation_id!==id||result.action_key!==actionKey){operation.transportUncertain=true;operation.cleanupConfirmed=false;throw Error('Node viewport receipt identity differs');}
      operation.cleanupConfirmed=result.cleanup_complete===true;operation.nodeEffectPossible ||= result.effect_possible===true;
      const completed=await entry('node_step_completed',{step,internal_operation_id:id,outcome:structuredClone(result)});
      if(JSON.stringify(completed?.outcome)!==JSON.stringify(result))throw Error('Node viewport outcome was not durably preserved');
      if(result.status!=='SUCCEEDED'||!operation.cleanupConfirmed||result.output?.verified!==true
        ||result.output.graph_unchanged!==true||result.output.fully_visible!==true||result.output.settings_applied!==false
        ||['document_id','workflow_id','node_id'].some(k=>result.output.node?.[k]!==preparedNodeContext.node[k]))throw new NodeProcedureStepError(result);
      return structuredClone(result);
    },
    async openOutputPort(port) {return channel.openPort('output',port);},
    async openInputPort(port) {return channel.openPort('input',port);},
    async openPort(direction,port) {
      if(!['input','output'].includes(direction))throw Error('Explicit port direction required');
      checkBudget();
      if(!preparedNodeContext||!Number.isInteger(port)||port<0||port>99)throw Error('A prepared output port index is required');
      let before=await channel.observe({condition:'prepared graph before opening output port',
        ready:s=>s.prepared_node_context?.surface==='graph'&&s.prepared_node_context.locked===false&&s.wizard?.status==='absent'});
      assertContext(before);
      const body=before.ui.elements.filter(e=>e.tid===before.prepared_node_context.tid&&e.graph_node?.part==='body');
      if(body.length===1&&body[0].interaction?.state==='outside_viewport') {
        await channel.revealGraphNode();
        before=await channel.observe({condition:'prepared graph node revealed before opening port',
          ready:s=>s.prepared_node_context?.surface==='graph'&&s.prepared_node_context.locked===false&&s.wizard?.status==='absent'
            &&s.ui.elements.some(e=>e.tid===s.prepared_node_context.tid&&e.graph_node?.part==='body'&&e.interaction?.state==='point_observed')});
        assertContext(before);
      }
      checkBudget();
      const step=nextStep(),id=operation.id+':n'+step,action={verb:'open_'+direction+'_port',port},actionKey='node.'+direction+'_port.open.internal';
      const signature=digest([id,action,evidenceSnapshot]),observationHash=digest(evidenceSnapshot);
      snapshot=null;evidenceSnapshot=null;
      const prepared=await entry('node_step_prepared',{step,internal_operation_id:id,action,observation_sha256:observationHash,signature});
      if(prepared?.signature!==signature||JSON.stringify(prepared.action)!==JSON.stringify(action))throw Error('Port opening was not durably prepared');
      signal?.throwIfAborted();
      if(now()>=operation.deadline)throw Error('Port opening deadline elapsed before mutation');
      const code=(direction==='input'?makePreparedInputPortOpenCode:makePreparedOutputPortOpenCode)(preparedNodeContext,{port,operation_id:id,origin:targetOrigin,build:targetBuild,
        deadline:operation.deadline});
      const envelope=`async page=>{const r=await (${code})(page);return {status:r.status,action_key:${JSON.stringify(actionKey)},action_revision:'1',operation_id:${JSON.stringify(id)},phase:'port_open',effect_possible:r.effect_possible,cleanup_complete:r.cleanup_complete,output:r,error:r.error?{code:'OUTPUT_PORT_OPEN_UNCONFIRMED',message:r.error}:null,trace:r.trace}}`;
      let result;
      try{result=await execute(wrapMutation(envelope,{id,signature,action_key:actionKey}),{timeout:Math.max(1,operation.deadline-now())});}
      catch(error){operation.transportUncertain=true;operation.cleanupConfirmed=false;throw error;}
      if(result.operation_id!==id||result.action_key!==actionKey){operation.transportUncertain=true;operation.cleanupConfirmed=false;throw Error('Port opening receipt identity differs');}
      operation.cleanupConfirmed=result.cleanup_complete===true;operation.nodeEffectPossible ||= result.effect_possible===true;
      const completed=await entry('node_step_completed',{step,internal_operation_id:id,outcome:structuredClone(result)});
      if(completed?.outcome?.operation_id!==id||JSON.stringify(completed.outcome)!==JSON.stringify(result))throw Error('Port opening outcome was not durably preserved');
      const owner=result.output;
      if(result.status!=='SUCCEEDED'||!operation.cleanupConfirmed||owner?.verified!==true||owner.direction!==direction||owner.port!==port
        ||owner.opening_operation_id!==id||owner.document_id!==preparedNodeContext.document_id
        ||owner.workflow_id!==preparedNodeContext.workflow_ref.workflow_id||owner.node_id!==preparedNodeContext.node.node_id)
        throw new NodeProcedureStepError(result);
      return structuredClone(result);
    },
    async observe({ condition, ready, confirmIdentity, timeoutMs = 15000, importColumnPage, outputColumnPage, readLogRegression = false, readLinRegression = false, readAutoCorrelation = false, readCorrAnalysis = false, readClustering = false, readTraining = false, readProcesses = false, readProcessControls = false, readOutputs = false, readMappings = false, mappingEditor, readCalculator = false, readJavascript = false, readGrouping = false, readCrossTable = false, readSampling = false, readTrees = false, readSlidingWindow = false, readDateTime = false, readElimOutlier = false, readCollapse = false, readMissingValues = false, readSorting = false, readReplacement = false, readDuplicates = false, readReform = false, readFilter = false, readJoin = false, readUnion = false, readPreview = false, readNavigation = false, tablePage, tableDialog, tableFormatPage, wizardConfirmation, settleOutputPort, settleProcessConsole, releaseWizard = false, settleWizard } = {}) {
      checkBudget();
      if (typeof condition !== 'string' || !condition.trim() || typeof ready !== 'function'
        || !Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 15000) {
        throw new Error('A named, bounded readiness condition is required');
      }
      if(settleOutputPort!==undefined&&(!readOutputs||!preparedNodeContext||tablePage||tableDialog
        ||typeof settleOutputPort!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(settleOutputPort)))
        throw Error('Output settlement requires a prepared native port');
      if(settleProcessConsole!==undefined&&(!readProcessControls||readProcesses||!preparedNodeContext
        ||typeof settleProcessConsole.ref!=='string'||!settleProcessConsole.signature))
        throw Error('Process console settlement requires its prepared control');
      if(settleProcessConsole?.quiet&&!launchConfirmed)throw Error('Console epoch settlement requires a confirmed launch');
      readOutputs ||= !!tablePage || !!tableDialog;
      if(wizardConfirmation && (!preparedNodeContext || !['close','deactivation'].includes(wizardConfirmation.kind)))throw Error('A prepared wizard confirmation binding is required');
      if(releaseWizard&&!preparedNodeContext)throw Error('Wizard release requires its prepared node');
      if(settleWizard&&(!releaseWizard||!Number.isFinite(settleWizard.deadline)||settleWizard.deadline>operation.deadline
        ||!settleWizard.root_ref&&settleWizard.graph_only!==true||!settleWizard.node))throw Error('Wizard settlement requires its original receipt and deadline');
      if(tableDialog && (!['format','filter'].includes(tableDialog.kind)||!tableDialog.table))throw new Error('A typed Table dialog binding is required');
      if(tablePage)makeNodeTableContextCode(preparedNodeContext,tablePage.table,tablePage.page);
      if(tableDialog)makeNodeTableContextCode(preparedNodeContext,tableDialog.table,{row_offset:0,row_limit:0,column_offset:0,column_limit:1});
      if ((readLogRegression || readLinRegression || readProcesses || readProcessControls || readOutputs || readMappings || readCalculator || readJavascript || readGrouping || readCrossTable || readSampling || readTrees || readSlidingWindow || readDateTime || readElimOutlier || readCollapse || readMissingValues || readSorting || readReplacement || readDuplicates || readReform || readFilter || readJoin || readUnion || readPreview) && !preparedNodeContext) throw new Error('Native process/output reads require a prepared node');
      if(mappingEditor!==undefined){
        if(!readMappings||!preparedNodeContext)throw Error('Owned input editor requires a prepared full mapping read');
        makeNodeMappingContextCode(preparedNodeContext,mappingEditor);
      }
      const mappingEditorBinding=mappingEditor===undefined?undefined:structuredClone(mappingEditor);
      // A failed wait must invalidate even a previously usable observation.
      snapshot = null;
      evidenceSnapshot = null;
      snapshotTableDialog=null;
      snapshotWizardConfirmation=null;
      const step = nextStep(), id = operation.id + ':n' + step;
      // Bound Table and post-launch console settling share the parent's clock and deadline.
      // Other observation windows retain their monotonic elapsed-time policy.
      const started = now(), monotonicStarted = settleOutputPort||settleProcessConsole?.quiet?undefined:monotonicNow();
      const observationNow = settleOutputPort||settleProcessConsole?.quiet ? now : () => started + monotonicNow() - monotonicStarted;
      let deadline = Math.min(settleWizard?.deadline??Infinity,settleOutputPort||settleProcessConsole?.quiet?operation.deadline:Math.min(operation.deadline, started + timeoutMs));
      const readTimeout = () => Math.min(35000, Math.max(settleWizard||settleProcessConsole?.quiet?0:MIN_OBSERVATION_READ_MS, Math.min(deadline,settleWizard?.deadline??Infinity) - observationNow()));
      const read = async (code,options,readDeadline=deadline) => {
        const limit=settleOutputPort?Math.min(readDeadline,deadline,now()+OUTPUT_SETTLEMENT_READ_MS):deadline;
        if((settleOutputPort||settleWizard||settleProcessConsole?.quiet)&&observationNow()>=limit)throw new NodeReadinessTimeout(condition);
        if(settleOutputPort)options={...options,timeout:Math.max(1,limit-now())};
        const value=await execute(code,options);
        if((settleOutputPort||settleWizard||settleProcessConsole?.quiet)&&observationNow()>=limit)throw new NodeReadinessTimeout(condition);
        return value;
      };
      const readUi = options => {
        if(!settleOutputPort)return read(makeWorkspaceUiCode(options),{timeout:readTimeout()});
        // Capture before transport: dispatch and browser reads consume one allowance.
        const readDeadline=Math.min(deadline,now()+OUTPUT_SETTLEMENT_READ_MS);
        return read(makeWorkspaceUiCode({...options,deadline:readDeadline,
          output_settlement_read:{port_guid:settleOutputPort,timeout_ms:OUTPUT_SETTLEMENT_READ_MS}}),
        {timeout:Math.max(1,readDeadline-now())},readDeadline);
      };
      const assertSettlement = state => {
        if(!settleWizard)return;
        const n=state.prepared_node_context,w=state.wizard;
        if(n?.verified!==true||!['document_id','workflow_id','node_id','input_port','output_port'].every(k=>
          JSON.stringify(n[k])===JSON.stringify(settleWizard.node[k]))
          ||!(n.surface==='graph'&&w?.status==='absent'
            ||!settleWizard.graph_only&&n.surface==='wizard'&&w?.status==='observed'&&w.root_ref===settleWizard.root_ref))
          throw Error('Original wizard receipt context changed');
      };
      let result, lastGeometry, satisfied = false, previousIdentity, confirmations = 0, rootRefreshes = 0, settlingConsole = false, settlingWizard, sampleStarted = observationNow();
      try {
      for (let sample = 0; settleOutputPort || settleProcessConsole || settlingWizard || sample < 80; sample++) {
        signal?.throwIfAborted();
        if (observationNow() >= deadline) break;
        // Pending reads already spend time polling. Keep a 200 ms start-to-start
        // interval instead of adding that delay to a slow read. A ready identity
        // still gets the full existing pause before its second confirmation.
        const pause = satisfied ? 200 : Math.max(0, 200 - (observationNow() - sampleStarted));
        if (sample && pause > 0) await wait(Math.min(pause, Math.max(0, deadline - observationNow())));
        signal?.throwIfAborted();
        if (observationNow() >= deadline) break;
        sampleStarted = observationNow();
        // Rediscover the root: wizard transitions and combo portals can replace it.
        const roots = await readUi({ mode: 'observe', operation_id: id,
          ...boundOptions,
          discover_roots: true, expected_origin: targetOrigin, expected_build: targetBuild });
        if (roots.status !== 'SUCCEEDED') {
          if (timeScanRefusal(roots,'workspace.observe')) {
            await entry('node_observation_scan_retried',{step,sample,internal_operation_id:id,
              condition,stage:'roots',outcome:structuredClone(roots)});
            satisfied=false;confirmations=0;previousIdentity=undefined;
            continue;
          }
          // Retain only bounded, non-content diagnostics: a root refusal must
          // not disappear behind a generic exception or leave usable refs.
          const outcome={status:roots.status,action_key:roots.action_key,phase:roots.phase,
            effect_possible:roots.effect_possible,cleanup_complete:roots.cleanup_complete,
            error:{code:typeof roots.error?.code==='string'?roots.error.code.slice(0,100):null},
            binding_reason:['surface_unavailable','document','receipt','workflow_unbound','tab','package_or_workflow','node_guid','navigation','graph_binding','graph_node','wizard_model','views_model','views_binding','surface_ambiguous']
              .find(reason=>roots.error?.message?.endsWith(': '+reason))??null,
            surface_pending:roots.output?.prepared_node_context?.surface_pending===true,
            trace:Array.isArray(roots.trace)?roots.trace.slice(-12).map(e=>({event:String(e.event??'').slice(0,100),
              ...(typeof e.limit_kind==='string'?{limit_kind:e.limit_kind.slice(0,40)}:{})})):[]};
          await entry('node_observation_refused',{step,sample,internal_operation_id:id,condition,stage:'roots',outcome});
          const error=new Error('Node procedure roots could not be observed'+(outcome.error.code?': '+outcome.error.code:''));
          error.nodeObservationRefusal=outcome;
          throw error;
        }
        assertSettlement(roots.output);
        const wizard = roots.output.wizard;
        if(releaseWizard&&wizard?.status==='observed') {
          assertContext(roots.output,true,null,true);
          const port=roots.output.prepared_node_context?.input_port??roots.output.prepared_node_context?.output_port;
          if(port&&!port.opening_operation_id?.startsWith(operation.id+':n'))throw Error('Wizard port was not opened by this stopped operation');
          wizardConfirmation??=wizardCloseBinding(roots.output);
        }
        const portals = wizard?.status === 'observed' ? (roots.output.ui?.elements??[]).filter(e =>
          (e.tid?.startsWith(wizard.root_tid + ';') || wizard.stage==='field_parameters' && e.tid?.startsWith('EditReformColumnDefForm;') || wizard.stage==='input_mapping' && e.tid==='EditTuneColumnDefForm;cbxUsageType;boundlist') && e.tid.endsWith(';boundlist')) : [];
        if(portals.length>1)throw new Error('Node procedure dropdown owner is ambiguous');
        // Dropdowns live outside the wizard subtree. Reading the unique
        // portal plus fixed wizard guards avoids scanning unrelated file tabs.
        if((readProcesses||readProcessControls)&&(roots.output.ui?.elements??[]).filter(e=>['ConsoleForm','MF;ConsoleForm'].includes(e.tid)).length>1)throw Error('Process console root is ambiguous');
        const processRoot=(readProcesses||readProcessControls) ? ['mnContextMenu','ConsoleForm','MF;ConsoleForm','MF;cntMain;tlbMainToolbar'].map(tid=>(roots.output.ui?.elements??[]).filter(e=>e.tid===tid))
          .find(xs=>xs.length===1)?.[0].ref : undefined;
        const outputRoot=readOutputs ? [preparedNodeContext.workflow_ref.prefix+';ViewsForm;BrowseView',preparedNodeContext.workflow_ref.prefix+';ViewsForm',preparedNodeContext.workflow_ref.prefix+';ModelForm;cmpDiagram']
          .map(tid=>(roots.output.ui?.elements??[]).filter(e=>e.tid===tid)).find(xs=>xs.length===1)?.[0].ref : undefined;
        const dialogRoot=tableDialog ? (roots.output.ui?.elements??[]).filter(e=>e.tid===tableDialog.table.table_tid+';ModalWindow_Browse'+(tableDialog.kind==='format'?'Format':'Filter')) : [];
        if(dialogRoot.length>1)throw new Error('Table dialog is ambiguous');
        const navigationRoot=readNavigation&&preparedNodeContext?(roots.output.ui?.elements??[]).find(e=>e.tid===preparedNodeContext.workflow_ref.prefix+';NavigationBar;NavigationPanel')?.ref:undefined;
        const graphRoot=preparedNodeContext?(roots.output.ui?.elements??[]).find(e=>e.tid===preparedNodeContext.workflow_ref.prefix+';ModelForm;cmpDiagram')?.ref:undefined;
        if(readNavigation&&!navigationRoot)throw Error('Prepared workflow navigation region unavailable');
        const outputEditors=['output_mapping','input_mapping'].includes(wizard?.stage)?(roots.output.ui?.elements??[]).filter(e=>e.tid===(wizard.stage==='input_mapping'?'EditTuneColumnDefForm':'EditColumnDefForm')):[];
        if(outputEditors.length>1)throw Error('Output field editor is ambiguous');
        const editorSuffix=wizard?.stage==='calculator'?';ExprDataEditForm':wizard?.stage==='grouping'?';FactorEditDialog':null;
        const expressionEditors=editorSuffix?(roots.output.ui?.elements??[]).filter(e=>e.tid===wizard.root_tid+editorSuffix):wizard?.stage==='field_parameters'?(roots.output.ui?.elements??[]).filter(e=>['EditReformColumnDefForm',wizard.root_tid+';EditReformColumnDefForm'].includes(e.tid)):[];
        if(expressionEditors.length>1)throw Error('Calculator expression editor is ambiguous');
        // This is read-only root selection. The subsequent full read must prove
        // its native ownership before any dialog or mutation is admitted.
        const previewRoot=readPreview?(roots.output.ui?.elements??[]).find(e=>e.tid===preparedNodeContext.workflow_ref.prefix+';ModelForm;PreviewWindow')?.ref
          :wizard?.stage==='calculator'?(roots.output.ui?.elements??[]).find(e=>e.tid===wizard.root_tid+';CalcPreviewForm')?.ref:undefined;
        const filterDialogs=readFilter&&wizard?.stage==='row_filter'?(roots.output.ui?.elements??[]).filter(e=>
          [';ModalWindow_BetweenValuesEditor',';ModalWindow_ValueListEditor'].some(suffix=>e.tid===wizard.root_tid+suffix)):[];
        if(filterDialogs.length>1)throw Error('Filter dialog is ambiguous');
        const joinMenus=readJoin&&wizard?.stage==='join'?(roots.output.ui?.elements??[]).filter(e=>e.tid==='mn'):[];
        if(joinMenus.length>1)throw Error('Join link menu is ambiguous');
        const missingValuesDialogs=readMissingValues&&wizard?.stage==='missing_values'?(roots.output.ui?.elements??[]).filter(e=>e.tid==='msgbox'):[];
        if(missingValuesDialogs.length>1)throw Error('Missing values dialog is ambiguous');
        const crossTableEditors=readCrossTable&&wizard?.stage==='crosstable'?(roots.output.ui?.elements??[]).filter(e=>
          ['ColumnEditDialog','FactorEditDialog'].some(name=>e.tid===wizard.root_tid+';'+name)):[];
        if(crossTableEditors.length>1)throw Error('CrossTable editor is ambiguous');
        const rolePortal=wizard?.stage==='input_mapping'&&portals[0]?.tid==='EditTuneColumnDefForm;cbxUsageType;boundlist'?portals[0].ref:undefined;
        const produceMenus=readMappings&&wizard?.stage==='output_mapping'?(roots.output.ui?.elements??[]).filter(e=>e.tid===wizard.root_tid+';DerivedDataSourceMappingEngineOutputPortWizard;btnProduceType;mn'||e.tid===wizard.root_tid+';DerivedDataSourceOutputSocketWizard;btnProduceType;mn'):[];
        if(produceMenus.length>1)throw Error('Derived output policy menu is ambiguous');
        const trainingRoot=readTraining?(roots.output.ui?.elements??[]).find(e=>e.tid==='mn')?.ref:undefined;
        const normEditor=readClustering&&wizard?.stage==='normalization'?(roots.output.ui?.elements??[]).find(e=>e.tid===wizard.root_tid+';ColumnsEditForm')?.ref:undefined;
        const normPortal=readClustering&&wizard?.stage==='normalization'&&portals[0]?.tid===wizard.root_tid+';ColumnsEditForm;cbxNormType;boundlist'?portals[0].ref:undefined;
        const root = normPortal ?? normEditor ?? trainingRoot ?? crossTableEditors[0]?.ref ?? missingValuesDialogs[0]?.ref ?? rolePortal ?? produceMenus[0]?.ref ?? joinMenus[0]?.ref ?? filterDialogs[0]?.ref ?? previewRoot ?? dialogRoot[0]?.ref ?? outputEditors[0]?.ref ?? navigationRoot ?? processRoot ?? outputRoot ?? (portals.length===1 ? portals[0].ref : expressionEditors[0]?.ref ?? (wizard?.status === 'observed' ? wizard.root_ref : graphRoot));
        if (observationNow() >= deadline) break;
        // Polling repaints the native process console. Read its cache before
        // issuing final UI refs/epoch, so those refs do not age across the
        // separate native transport. The exact node context must still match.
        const nativeProcesses=readProcesses?await read(makeNodeProcessContextCode(preparedNodeContext),
          {timeout:readTimeout()}):null;
        if (observationNow() >= deadline) break;
        result = await readUi({ mode: 'observe', operation_id: id,
          ...boundOptions,
          root_ref: root, expected_origin: targetOrigin, expected_build: targetBuild,
          ...(importColumnPage===undefined?{}:{import_column_page:importColumnPage}),
          ...(outputColumnPage===undefined?{}:{output_column_page:outputColumnPage}),
          ...(tableFormatPage===undefined?{}:{table_format_page:tableFormatPage}) });
        if(result.status==='SUCCEEDED'&&readMissingValues&&result.output.wizard?.stage==='missing_values'&&result.output.ui.dialogs.length===1){
          // Ext's message box has no root data-tid. Re-read its observed portal;
          // native field ownership and exact prompt controls are checked below.
          result=await read(makeWorkspaceUiCode({mode:'observe',operation_id:id,...boundOptions,
            root_ref:result.output.ui.dialogs[0].ref,expected_origin:targetOrigin,expected_build:targetBuild}),
          {timeout:readTimeout()});
        }
        if(result.status==='SUCCEEDED' && wizardConfirmationOwner(result.output,wizardConfirmation)) {
          // The native message box is a portal outside the wizard subtree.
          const dialog=result.output.ui.dialogs[0];
          result=await read(makeWorkspaceUiCode({mode:'observe',operation_id:id,...boundOptions,
            root_ref:dialog.ref,expected_origin:targetOrigin,expected_build:targetBuild}),
          {timeout:readTimeout()});
        }
        if (result.status !== 'SUCCEEDED') {
          // A wall-clock scan can expire under contention without producing
          // refs or effects. Rediscover within this same observation deadline;
          // work/element limits and uncertain gestures are never retried here.
          if (timeScanRefusal(result,'workspace.observe')) {
            assertContext(roots.output,true,tableDialog,true);
            await entry('node_observation_scan_retried',{step,sample,internal_operation_id:id,
              condition,stage:'detail',outcome:structuredClone(result)});
            satisfied=false;confirmations=0;previousIdentity=undefined;
            continue;
          }
          // A closing modal can disappear after root discovery. Only this
          // strict read-only refusal permits rediscovery, never replay a gesture.
          if (root && rootRefreshes < 2 && result.status === 'NOT_APPLIED'
            && result.action_key === 'workspace.observe' && result.phase === 'observing'
            && result.error?.code === 'UI_ROOT_STALE' && result.effect_possible === false
            && result.cleanup_complete === true) {
            assertContext(roots.output, true, tableDialog, true);
            await entry('node_observation_root_refreshed', {step, sample, internal_operation_id:id,
              refresh:++rootRefreshes, condition, outcome:structuredClone(result)});
            confirmations=0;previousIdentity=undefined;
            continue;
          }
          await entry('node_observation_refused', {step, sample, internal_operation_id:id,
            condition, outcome:structuredClone(result)});
          const error = new Error('Node procedure observation is incomplete' +
            (typeof result.error?.code === 'string' ? ': ' + result.error.code : ''));
          error.nodeObservationRefusal = structuredClone(result);
          throw error;
        }
        assertSettlement(result.output);
        if(readPreview){
          result.output.node_preview_schema=await read(makeNodePreviewSchemaCode(preparedNodeContext),{timeout:readTimeout()});
        }
        if(readFilter){
          result.output.node_filter=await read(makeFilterContextCode(preparedNodeContext),{timeout:readTimeout()});
          if(result.output.node_filter.node_context&&JSON.stringify(canonical(result.output.node_filter.node_context))!==JSON.stringify(canonical(result.output.prepared_node_context)))throw Error('Native filter context changed during observation');
        }
        if(readMissingValues){
          result.output.node_missing_values=await read(makeMissingValuesContextCode(preparedNodeContext),{timeout:readTimeout()});
          if(result.output.node_missing_values.node_context&&JSON.stringify(canonical(result.output.node_missing_values.node_context))!==JSON.stringify(canonical(result.output.prepared_node_context)))throw Error('Native missing values context changed during observation');
        }
        // CrossTable modal ownership is attested by its native cached record,
        // before a modal can pass the context gate or authorize any action.
        if(readCrossTable&&result.output.wizard?.stage==='crosstable'){
          result.output.node_crosstable=await read(makeCrossTableContextCode(preparedNodeContext),{timeout:readTimeout()});
          const native=result.output.node_crosstable;
          if(native.node_context&&JSON.stringify(canonical(native.node_context))!==JSON.stringify(canonical(result.output.prepared_node_context)))
            throw Error('CrossTable native owner changed during observation');
        }
        if(readLogRegression){
          result.output.node_logregression=await read(makeLogRegressionContextCode(preparedNodeContext),{timeout:readTimeout()});
          if(result.output.node_logregression.node_context&&JSON.stringify(canonical(result.output.node_logregression.node_context))!==JSON.stringify(canonical(result.output.prepared_node_context)))throw Error('Logistic regression native owner changed during observation');
        }
        if(readLinRegression){
          result.output.node_linregression=await read(makeLinRegressionContextCode(preparedNodeContext),{timeout:readTimeout()});
          if(result.output.node_linregression.node_context&&JSON.stringify(canonical(result.output.node_linregression.node_context))!==JSON.stringify(canonical(result.output.prepared_node_context)))throw Error('Linear regression native owner changed during observation');
        }
        if(readAutoCorrelation){
          result.output.node_auto_correlation=await read(makeAutoCorrelationContextCode(preparedNodeContext),{timeout:readTimeout()});
          if(result.output.node_auto_correlation.node_context&&JSON.stringify(canonical(result.output.node_auto_correlation.node_context))!==JSON.stringify(canonical(result.output.prepared_node_context)))throw Error('Autocorrelation native owner changed during observation');
        }
        if(readCorrAnalysis){
          result.output.node_corr_analysis=await read(makeCorrAnalysisContextCode(preparedNodeContext),{timeout:readTimeout()});
          if(result.output.node_corr_analysis.node_context&&JSON.stringify(canonical(result.output.node_corr_analysis.node_context))!==JSON.stringify(canonical(result.output.prepared_node_context)))throw Error('Correlation native owner changed during observation');
        }
        if(readClustering){
          result.output.node_clustering=await read(makeClusteringContextCode(preparedNodeContext),{timeout:readTimeout()});
          if(result.output.node_clustering.node_context&&JSON.stringify(canonical(result.output.node_clustering.node_context))!==JSON.stringify(canonical(result.output.prepared_node_context)))throw Error('Clustering native owner changed during observation');
        }
        try {
          assertContext(result.output, true, tableDialog, false, wizardConfirmation);
        } catch (error) {
          // Keep the native read that caused the refusal; it must never become
          // a usable snapshot or authorize a gesture.
          await entry('node_observation_context_refused', {step, sample, internal_operation_id:id,
            condition, reason:error.message, outcome:structuredClone(result)});
          const dialogs=result.output.ui?.dialogs;
          if(error.message==='Node procedure is blocked by a mask or dialog'&&dialogs?.length
              &&!signal?.aborted&&observationNow()+MIN_OBSERVATION_READ_MS<deadline) {
            try {
              const snapshot=await read(makeBlockingWindowDiagnosticCode({refs:dialogs.map(d=>d.ref),origin:targetOrigin,build:targetBuild}),{timeout:readTimeout()});
              await entry('node_blocking_window_native',{step,sample,internal_operation_id:id,condition,snapshot});
            } catch {
              await entry('node_blocking_window_native_unavailable',{step,sample,internal_operation_id:id,condition}).catch(()=>{});
            }
          }
          const blocker=dialogs?.length===1&&dialogs[0].text==='[outside selected root]'?dialogs[0]:null;
          // Inspect this already observed portal for diagnostics only. It is
          // never promoted to a usable node snapshot or dismissed as owned.
          if(error.message==='Node procedure is blocked by a mask or dialog'&&typeof blocker?.ref==='string'
              &&!signal?.aborted&&observationNow()+MIN_OBSERVATION_READ_MS<deadline) {
            try {
              const detail=await read(makeWorkspaceUiCode({mode:'observe',operation_id:id,...boundOptions,
                root_ref:blocker.ref,expected_origin:targetOrigin,expected_build:targetBuild}),{timeout:readTimeout()});
              await entry('node_blocking_dialog_observed',{step,sample,internal_operation_id:id,
                condition,dialog_ref:blocker.ref,outcome:structuredClone(detail)});
            } catch(inspectionError) {
              await entry('node_blocking_dialog_observation_failed',{step,sample,internal_operation_id:id,
                condition,dialog_ref:blocker.ref,reason:String(inspectionError?.message??inspectionError)}).catch(()=>{});
            }
          }
          throw error;
        }
        if(result.output.geometry)lastGeometry=structuredClone(result.output.geometry);
        if(readNavigation)result.output.node_navigation_read=true;
        if(readProcessControls)result.output.node_process_controls_read=true;
        if(readProcesses) {
          result.output.node_processes=nativeProcesses;
          if(nativeProcesses.node_context&&JSON.stringify(canonical(nativeProcesses.node_context))
            !==JSON.stringify(canonical(result.output.prepared_node_context))) {
            const {locked:nativeLocked,...nativeOwner}=nativeProcesses.node_context;
            const {locked:uiLocked,...uiOwner}=result.output.prepared_node_context;
            // Execute/completion can change FLocked between these two reads.
            // Discard the mixed snapshot; never use it to authorize a gesture.
            if(nativeOwner.verified===true&&nativeOwner.surface==='graph'
              &&typeof nativeLocked==='boolean'&&typeof uiLocked==='boolean'&&nativeLocked!==uiLocked
              &&JSON.stringify(canonical(nativeOwner))===JSON.stringify(canonical(uiOwner))) {
              await entry('node_observation_lock_retried',{step,sample,internal_operation_id:id,condition,
                native_node_context:structuredClone(nativeProcesses.node_context),
                ui_node_context:structuredClone(result.output.prepared_node_context)});
              satisfied=false;confirmations=0;previousIdentity=undefined;
              continue;
            }
            throw new Error('Native process/output context changed during observation');
          }
        }
        if(readTraining)result.output.node_training_read=true;
        if(boundWizardConfirmation(result.output,wizardConfirmation))result.output.node_wizard_confirmation=structuredClone(wizardConfirmation);
        // These are bounded reads of native UI caches and DOM, guarded by the
        // prepared node before and after. Preserve them in the same journal
        // observation; they are not an execution or data-freshness claim.
        for (const [requested,key,makeCode] of [[readOutputs,'node_outputs',makeNodeOutputContextCode], [readMappings,'node_mapping',makeNodeMappingContextCode],
          [readTrees,'node_tree',makeTreeWizardContextCode], [readSampling,'node_sampling',makeSamplingContextCode], [readElimOutlier,'node_elim_outlier',makeElimOutlierContextCode], [readSlidingWindow,'node_sliding_window',makeSlidingWindowContextCode], [readCollapse,'node_collapse',makeCollapseContextCode], [readDateTime,'node_date_time',makeDateTimeContextCode], [readDuplicates,'node_duplicates',makeDuplicatesContextCode], [readUnion,'node_union',makeUnionContextCode], [readJoin,'node_join',makeJoinContextCode], [readCalculator,'node_calculator',makeCalculatorContextCode], [readJavascript,'node_javascript_schema',makeJavascriptSchemaContextCode], [readGrouping,'node_grouping',makeGroupingContextCode], [readReplacement,'node_replacement',makeReplacementContextCode], [readSorting,'node_sorting',makeSortingContextCode], [readReform,'node_reform',makeReformContextCode]]) {
          if (!requested) continue;
          if (observationNow() >= deadline) break;
          const native=await read(key==='node_mapping'?makeCode(preparedNodeContext,mappingEditorBinding):makeCode(preparedNodeContext),{timeout:readTimeout()});
          result.output[key]=native;
          if(key==='node_mapping'&&mappingEditorBinding)result.output.node_mapping_editor=structuredClone(mappingEditorBinding);
          if(native.node_context && JSON.stringify(canonical(native.node_context))!==JSON.stringify(canonical(result.output.prepared_node_context)))
            throw new Error('Native process/output context changed during observation');
        }
        if(tablePage) {
          if(observationNow()>=deadline)break;
          result.output.node_table_request=structuredClone(tablePage);
          result.output.node_table=await read(makeNodeTableContextCode(preparedNodeContext,tablePage.table,tablePage.page),
            {timeout:readTimeout()});
        }
        if(observationNow()>=deadline)break;
        if(tableDialog) {
          const tables=result.output.node_outputs?.tables??[];
          if(result.output.node_outputs?.verified!==true || tables.filter(t=>t.active&&t.view_guid===tableDialog.table.view_guid
            &&t.port_guid===tableDialog.table.port_guid&&t.table_tid===tableDialog.table.table_tid).length!==1)throw new Error('Table dialog owner changed');
          result.output.node_table_dialog=structuredClone(tableDialog);
        }
        const ws=result.output,w=ws.wizard,n=ws.prepared_node_context;
        const ownWizardMask=preparedNodeContext&&n?.verified===true&&n.surface==='wizard'&&w?.status==='observed'
          &&n.tid===w.root_tid&&ws.ui.dialogs.length===0&&ws.ui.masks.length>0
          &&ws.ui.masks.every(m=>m.kind==='busy'&&!m.dialog_ref&&(m.ref===w.root_ref&&m.target_tid===w.root_tid
            ||m.import_preview_owner_ref===w.root_ref||m.wizard_loading_owner_ref===w.root_ref));
        const returnedGraph=settleWizard&&n?.verified===true&&n.surface==='graph'&&w?.status==='absent'
          &&['document_id','workflow_id','node_id'].every(k=>n[k]===settleWizard.node[k])&&ws.ui.dialogs.length===0
          &&ws.ui.masks.every(m=>m.kind==='busy'&&!m.dialog_ref&&m.target_tid===ws.workflow_ref.prefix+';ModelForm'&&m.graph_loading_owner_ref);
        if(settlingWizard||(ownWizardMask||returnedGraph&&ws.ui.masks.length)&&(!releaseWizard||settleWizard)) {
          const expected=settlingWizard??{root_ref:w.root_ref,node:structuredClone(n)};
          if(!returnedGraph&&(w?.status!=='observed'||w.root_ref!==expected.root_ref||n?.surface!=='wizard'
              ||!['input_port','output_port'].every(k=>JSON.stringify(n[k])===JSON.stringify(expected.node[k])))
            ||!['document_id','workflow_id','node_id'].every(k=>n[k]===expected.node[k])
            ||ws.ui.dialogs.length||ws.ui.masks.length&&!ownWizardMask&&!returnedGraph
            ||settleWizard&&(!returnedGraph&&(settleWizard.graph_only||w.root_ref!==settleWizard.root_ref)
              ||!['document_id','workflow_id','node_id'].every(k=>n[k]===settleWizard.node[k])))
            throw Error('Owned wizard loading context changed');
          if(ownWizardMask||returnedGraph&&ws.ui.masks.length){settlingWizard=expected;deadline=Math.min(operation.deadline,settleWizard?.deadline??Infinity);}
        }
        if(settleProcessConsole&&(settleProcessConsole.quiet||settlingConsole||result.output.prepared_node_context?.locked===true||result.output.ui.masks.length
          &&result.output.ui.elements.some(e=>e.tid==='MF;cntMain;tlbMainToolbar;btnProgress'))){
          const state=result.output,buttons=state.ui.elements.filter(e=>e.tid==='MF;cntMain;tlbMainToolbar;btnProgress');
          const owned=state.prepared_node_context?.surface==='graph'&&typeof state.prepared_node_context.locked==='boolean'&&state.ui.dialogs.length===0
            &&state.wizard?.status==='absent'&&buttons.length===1&&buttons[0].ref===settleProcessConsole.ref
            &&buttons[0].enabled===true&&buttons[0].allowed_actions.includes('click')
            &&JSON.stringify(canonical(buttons[0].signature))===JSON.stringify(canonical(settleProcessConsole.signature))
            &&state.ui.masks.every(m=>m.kind==='busy'&&!m.dialog_ref
              &&m.target_tid===preparedNodeContext.workflow_ref.prefix+';ModelForm');
          if(!owned)throw Error('Owned process console settlement context changed');
          // Only the confirmed launch's own loading mask may outlive the local
          // readiness window. Keep the parent deadline and authorize no action.
          if(state.ui.masks.length||state.prepared_node_context.locked){settlingConsole=true;deadline=operation.deadline;}
        }
        if(settleOutputPort){
          const state=result.output,context=state.prepared_node_context;
          const outputs=state.node_outputs;
          const pending=outputs?.verified===false&&outputs.reason==='table_card_pending'
            &&outputs.pending_tables?.length===1&&outputs.pending_tables[0].port_guid===settleOutputPort
            &&state.ui.masks.length>0;
          if(context?.verified!==true||context.surface!=='views'
            ||context.document_id!==preparedNodeContext.document_id
            ||context.workflow_id!==preparedNodeContext.workflow_ref.workflow_id
            ||context.node_id!==preparedNodeContext.node.node_id
            ||!(outputs?.verified===true||pending)||outputs.surface!=='views'
            ||outputs.port_panels?.filter(p=>p.port_guid===settleOutputPort).length!==1
            ||state.ui.masks.some(mask=>mask.kind!=='busy'||mask.dialog_ref
              ||mask.target_tid!==preparedNodeContext.workflow_ref.prefix+';ViewsForm')){
            await entry('node_observation_context_refused',{step,sample,internal_operation_id:id,condition,
              reason:'Owned output settlement context changed',outcome:structuredClone(result)});
            throw Error('Owned output settlement context changed');
          }
        }
        satisfied = (boundWizardConfirmation(result.output,wizardConfirmation)
          || result.output.ui.masks.every(m=>result.output.ui.dialogs.length===1&&allowedNodeEditor(result.output.ui.dialogs[0],result.output)
            &&m.kind==='modal_background'&&m.target_tid===result.output.wizard.root_tid&&m.ref===result.output.wizard.root_ref)
            &&result.output.ui.dialogs.every(d=>allowedDialog(d,tableDialog)||allowedOutputEditor(d,result.output)||allowedNodeEditor(d,result.output)))
          && ready(result.output) === true && observationNow() < deadline;
        const identity = satisfied && confirmIdentity ? digest(confirmIdentity(result.output)) : null;
        confirmations = satisfied ? (confirmIdentity ? (identity === previousIdentity ? confirmations + 1 : 1) : 1) : 0;
        previousIdentity = identity;
        await entry('node_observation_sample', { step, sample, internal_operation_id: id,
          readiness: { policy: 'semantic_condition_v2', required_samples: confirmIdentity ? 2 : 1, identity_sha256: identity, condition, satisfied, timeout_ms: deadline-started, ...(settleOutputPort?{settle_output_port:settleOutputPort,deadline}:{}), ...(settleProcessConsole?.quiet?{console_epoch_settlement:true,deadline}:{}), elapsed_ms: observationNow() - started },
          outcome: structuredClone(result) });
        // The action transport checks the exact document epoch again before
        // the gesture. Repeating already satisfied observations adds latency
        // without making that check stronger.
        if (satisfied && confirmations >= (confirmIdentity ? 2 : 1)) break;
      }
      if (!satisfied || confirmations < (confirmIdentity ? 2 : 1) || observationNow() >= deadline) {
        const timedOut=await entry('node_observation_timeout',{step,internal_operation_id:id,condition,
          ...(lastGeometry?{geometry:lastGeometry}:{}),
          elapsed_ms:observationNow()-started,effect_possible:false});
        if(timedOut?.condition!==condition||timedOut.effect_possible!==false)throw Error('Observation timeout was not durably acknowledged');
        throw new NodeReadinessTimeout(condition);
      }
      const persisted = await entry('node_observation_completed', { step, internal_operation_id: id,
        readiness: { policy: 'semantic_condition_v2', required_samples: confirmIdentity ? 2 : 1, identity_sha256: previousIdentity, condition, satisfied: true, timeout_ms: deadline-started, ...(settleOutputPort?{settle_output_port:settleOutputPort,deadline}:{}), ...(settleProcessConsole?.quiet?{console_epoch_settlement:true,deadline}:{}), elapsed_ms: observationNow() - started }, outcome: structuredClone(result) });
      if (!persisted?.outcome?.output) throw new Error('Node observation requires a durable journal acknowledgement');
      if((settleOutputPort||settleWizard)&&observationNow()>=Math.min(deadline,settleWizard?.deadline??Infinity))throw new NodeReadinessTimeout(condition);
      evidenceSnapshot = structuredClone(persisted.outcome.output);
      snapshot = structuredClone(result.output);
      snapshotTableDialog=tableDialog?structuredClone(tableDialog):null;
      snapshotWizardConfirmation=snapshot.node_wizard_confirmation??null;
      if(readProcessControls)rememberConsoleControl(snapshot);
      return structuredClone(snapshot);
      } catch(error) {
        if(signal?.aborted&&error===signal.reason) {
          const interrupted=await entry('node_observation_interrupted',{step,internal_operation_id:id,
            condition,reason:'local_cancel',effect_possible:false,cleanup_complete:true});
          if(interrupted?.step!==step||interrupted.internal_operation_id!==id||interrupted.condition!==condition
            ||interrupted.reason!=='local_cancel'||interrupted.effect_possible!==false||interrupted.cleanup_complete!==true)
            throw Error('Interrupted observation was not durably acknowledged');
        }
        throw error;
      }
    },
    async act(action,processControl,{preserveJoinMapping=false}={}) {
      checkBudget();
      if (!snapshot) throw new Error('A fresh internal observation is required');
      if(preserveJoinMapping&&(!isUnchangedTransformExecution(operation.parameters)
        ||operation.parameters.target.type!=='transform.join_data'||action.verb!=='wizard_step'||action.expected_stage!=='join'
        ||snapshot.wizard?.stage!=='input_mapping'||snapshot.prepared_node_context?.input_port||snapshot.prepared_node_context?.output_port))
        throw Error('Preserved Join navigation requires its unchanged node read');
      validateUiAction(action, snapshot);
      assertContext(snapshot,false,snapshotTableDialog,false,snapshotWizardConfirmation);
      const mappingConflict=snapshotWizardConfirmation&&boundInputMappingConflict(snapshot,snapshotWizardConfirmation);
      const cancelOpening=snapshotWizardConfirmation?.release_opening;
      if(snapshotWizardConfirmation && (action.verb!==(mappingConflict||cancelOpening?'click':snapshotWizardConfirmation.kind==='close'?'confirm_wizard_close':'confirm_wizard_deactivation')
        || !(snapshotWizardConfirmation.kind==='close'&&!mappingConflict
          ? /^msgbox(?:-1)?;tlb;yes$/.test(snapshot.ui.elements.find(e=>e.ref===action.ref)?.tid??'')
          : snapshot.ui.elements.find(e=>e.ref===action.ref)?.tid===(mappingConflict||cancelOpening?'msgbox;tlb;cancel':'msgbox;tlb;yes'))))throw Error('Only the bound wizard confirmation can answer this question');
      const step = nextStep(), id = operation.id + ':n' + step;
      const before = snapshot;
      snapshot = null;
      const signature = digest([id, action, evidenceSnapshot,...(processControl?[processControl]:[]),
        ...(preserveJoinMapping?[{preserve_join_mapping:true}]:[])]);
      const processCode=processControl?makeNodeProcessControlCode(preparedNodeContext,before,action,processControl,
        {operation_id:id,deadline:operation.deadline,origin:targetOrigin,build:targetBuild}):null;
      // This write must be durable before the browser receives the mutation.
      const persisted = await entry('node_step_prepared', { step, internal_operation_id: id,
        action: structuredClone(action), observation_sha256: digest(evidenceSnapshot), signature,
        ...(processControl?{process_control:structuredClone(processControl)}:{}),
        ...(preserveJoinMapping?{preserve_join_mapping:true}:{}) });
      evidenceSnapshot = null;
      if (!persisted || JSON.stringify(persisted.action) !== JSON.stringify(action)
        || persisted.signature !== signature||processControl&&JSON.stringify(persisted.process_control)!==JSON.stringify(processControl)
        ||preserveJoinMapping&&persisted.preserve_join_mapping!==true) throw new Error('Prepared step was not durably preserved after redaction');
      lastPreparedStep = structuredClone(persisted);
      preparedSteps.push({ step: persisted.step, internal_operation_id: persisted.internal_operation_id, signature: persisted.signature, verb: action.verb });
      if (preparedSteps.length > 512) { preparedSteps.shift(); preparedStepsTrimmed = true; }
      signal?.throwIfAborted();
      if (now() >= operation.deadline) throw new Error('Node procedure deadline elapsed before mutation');
      // A dispatched visualizers opening replaces the graph asynchronously,
      // just like a wizard opening. Settle it once within the original budget.
      const openingWait=preparedNodeContext&&['open_wizard','begin_wizard','confirm_wizard_deactivation','wizard_step','open_node_views'].includes(action.verb)
        ?Math.max(1,Math.floor(operation.deadline-now())):null;
      const settlementWait=preparedNodeContext&&!openingWait&&(before.wizard?.status==='observed'
        ||['finish_wizard','execute_wizard','apply_output_column','cancel_output_column','apply_reform_column','cancel_reform_column'].includes(action.verb))
        ?Math.max(1,Math.floor(operation.deadline-now())):null;
      const code = processCode??makeWorkspaceUiCode({ mode: 'act', operation_id: id, action,
        ...(openingWait||settlementWait?{deadline:operation.deadline}:{}),
        ...(preserveJoinMapping?{preserve_join_mapping:true}:{}),
        ...(settlementWait?{settlement_timeout_ms:settlementWait}:{}),
        ...(openingWait?{opening_timeout_ms:openingWait}:{}),
        ...boundOptions,
        snapshot: before, expected_origin: targetOrigin, expected_build: targetBuild });
      const wrapped = wrapMutation(before.node_mapping_editor?`async page=>{
        const current=await (${makeNodeMappingContextCode(preparedNodeContext,before.node_mapping_editor)})(page);
        const {rendered_indices,...definition}=current;
        if(JSON.stringify(definition)!==${JSON.stringify(JSON.stringify((({rendered_indices,...definition})=>definition)(before.node_mapping)))})
          return {status:'NOT_APPLIED',action_key:'ui.act',action_revision:'1',operation_id:${JSON.stringify(id)},
            phase:'preconditions',effect_possible:false,cleanup_complete:true,trace:[],
            error:{code:'MAPPING_BINDING_CHANGED',message:'Original owned input mapping changed before gesture'}};
        return (${code})(page);
      }`:code, { id, signature, action_key: 'ui.act' });
      let result;
      try { result = await execute(wrapped, { timeout: settlementWait?settlementWait+5000:openingWait?openingWait+5000:35000 }); }
      catch (error) {
        operation.transportUncertain = true;
        operation.cleanupConfirmed = false;
        throw error;
      }
      if (result.operation_id !== id || result.action_key !== 'ui.act') {
        operation.transportUncertain = true;
        operation.cleanupConfirmed = false;
        await entry('node_step_completed', { step, internal_operation_id: id, outcome: structuredClone(result) });
        throw new Error('Node procedure receipt identity differs; inspect the original browser receipt');
      }
      operation.cleanupConfirmed = result.cleanup_complete === true;
      operation.nodeEffectPossible ||= result.effect_possible === true;
      await entry('node_step_completed', { step, internal_operation_id: id, outcome: structuredClone(result) });
      if (result.status !== 'SUCCEEDED' || !operation.cleanupConfirmed) {
        throw new NodeProcedureStepError(result);
      }
      const trainCommands=before.node_training_read===true?before.ui.elements.filter(e=>
        e.label==='Обучить узел'&&e.tid?.startsWith('mn;')&&e.allowed_actions.includes('click')):[];
      const trainingLaunch=action.verb==='click'&&trainCommands.length===1&&trainCommands[0].ref===action.ref;
      if(preparedNodeContext&&(['execute_graph_node','execute_wizard'].includes(action.verb)||trainingLaunch)){
        rememberConsoleControl(before);
        launchConfirmed=true;
      }
      // Even a successful gesture does not authorize the next one with old refs.
      return structuredClone(result);
    },
    // Fixed handlers supply the readiness condition and domain identity. Caller
    // input never contains a resolver or a recipe. Only a durably recorded,
    // strictly pre-gesture epoch/scan refusal, owned busy mask or proved body replacement
    // permits a new local attempt with unchanged identity and intent.
    async perform({ condition, ready, resolve, identity, confirmIdentity, timeoutMs = 15000, initialObservation, refreshReplacedBody, refreshWizardBusy, refreshGraphBusy, processControl, settleProcessConsole, preserveJoinMapping=false }) {
      if (typeof resolve !== 'function' || typeof identity !== 'function') {
        throw new Error('A bound action resolver and domain identity are required');
      }
      let binding, intent, bodyRefreshes = 0;
      const quietConsole=settleProcessConsole&&launchConfirmed;
      const initialPage=initialObservation?.wizard?.import_columns?.page;
      const initialOutputPage=initialObservation?.wizard?.output_columns?.page;
      for (let attempt = 0; quietConsole || attempt < 3; attempt++) {
        let observed;
        if (!attempt && initialObservation !== undefined) {
          checkBudget();
          if (!snapshot || digest(initialObservation) !== digest(snapshot) || ready(snapshot) !== true) {
            throw new Error('Initial bound observation is no longer current or ready');
          }
          observed=structuredClone(snapshot);
        } else observed = await channel.observe({ condition, ready, confirmIdentity, timeoutMs,
          ...(initialPage?{importColumnPage:{offset:initialPage.offset,limit:initialPage.limit}}:{}),
          ...(initialOutputPage?{outputColumnPage:{offset:initialOutputPage.offset,limit:initialOutputPage.limit}}:{}),
          tablePage:initialObservation?.node_table_request,
          wizardConfirmation:initialObservation?.node_wizard_confirmation,
          readNavigation:initialObservation?.node_navigation_read===true,
          readMappings:initialObservation?.node_mapping!==undefined,
          mappingEditor:initialObservation?.node_mapping_editor,
          readLogRegression:initialObservation?.node_logregression!==undefined,
          readLinRegression:initialObservation?.node_linregression!==undefined,
          readClustering:initialObservation?.node_clustering!==undefined,
          readAutoCorrelation:initialObservation?.node_auto_correlation!==undefined,
          readCorrAnalysis:initialObservation?.node_corr_analysis!==undefined,
          readTraining:initialObservation?.node_training_read===true,
          readCalculator:initialObservation?.node_calculator!==undefined,
          readJavascript:initialObservation?.node_javascript_schema!==undefined,
          readGrouping:initialObservation?.node_grouping!==undefined,
          readCrossTable:initialObservation?.node_crosstable!==undefined,
          readSampling:initialObservation?.node_sampling!==undefined,readTrees:initialObservation?.node_tree!==undefined,
          readSlidingWindow:initialObservation?.node_sliding_window!==undefined,
          readDateTime:initialObservation?.node_date_time!==undefined,
          readElimOutlier:initialObservation?.node_elim_outlier!==undefined,
          readCollapse:initialObservation?.node_collapse!==undefined,
          readSorting:initialObservation?.node_sorting!==undefined,
          readReplacement:initialObservation?.node_replacement!==undefined,
          readMissingValues:initialObservation?.node_missing_values!==undefined,
          readReform:initialObservation?.node_reform!==undefined,
          readDuplicates:initialObservation?.node_duplicates!==undefined,
          readFilter:initialObservation?.node_filter!==undefined,
          readJoin:initialObservation?.node_join!==undefined,
          readUnion:initialObservation?.node_union!==undefined,
          readPreview:initialObservation?.node_preview_schema!==undefined,
          readProcessControls:initialObservation?.node_process_controls_read===true,
          readProcesses:initialObservation?.node_processes!==undefined,readOutputs:initialObservation?.node_outputs!==undefined,tableDialog:initialObservation?.node_table_dialog,
          tableFormatPage:initialObservation?.table_settings?.format?.page?{offset:initialObservation.table_settings.format.page.offset,limit:initialObservation.table_settings.format.page.limit}:undefined });
        if(settleProcessConsole&&(observed.prepared_node_context?.surface!=='graph'
          ||observed.prepared_node_context?.verified!==true||typeof observed.prepared_node_context.locked!=='boolean'))
          throw Error('Running node console owner is unknown');
        // Only the driver's succeeded launch opts in. Poll before a console
        // gesture; keep the original deadline and every later epoch guard.
        if(settleProcessConsole&&(quietConsole||observed.prepared_node_context.locked===true)){
          const originalIdentity=digest(canonical(identity(observed)));
          const originalAction=resolve(observed),button=observed.ui.elements.find(e=>e.ref===originalAction.ref);
          if(originalAction.verb!=='click'||button?.tid!=='MF;cntMain;tlbMainToolbar;btnProgress'
            ||button.ref!==settleProcessConsole.ref||digest(canonical(button.signature))!==digest(canonical(settleProcessConsole.signature)))
            throw Error('Running node settlement requires its original console control');
          observed=await channel.observe({condition:'launched own node stops repainting its console control',readProcessControls:true,
            settleProcessConsole:{...settleProcessConsole,...(quietConsole?{quiet:true}:{})},
            ...(quietConsole?{confirmIdentity:s=>s.dom_epoch}:{}),
            ready:s=>s.prepared_node_context?.locked===false&&(!quietConsole||typeof s.dom_epoch?.document==='string'
              &&Number.isFinite(s.dom_epoch.revision))&&ready(s)});
          const freshAction=resolve(observed);
          if(digest(canonical(identity(observed)))!==originalIdentity||freshAction.verb!==originalAction.verb
            ||freshAction.ref!==settleProcessConsole.ref)
            throw Error('Running node console identity or intent changed');
        }
        const action = resolve(observed), object = identity(observed);
        if (!object || typeof object !== 'object' || !Object.keys(object).length) {
          throw new Error('A nonempty domain identity is required');
        }
        const nextBinding = digest(canonical(object));
        const nextIntent = digest(canonical(Object.fromEntries(Object.entries(action)
          .filter(([key]) => !['ref', 'source_ref', 'target_ref'].includes(key)))));
        if (attempt && (binding !== nextBinding || intent !== nextIntent)) {
          snapshot = null;
          throw new Error('Node procedure recovery target or intent changed');
        }
        binding = nextBinding; intent = nextIntent;
        try { return await channel.act(action,processControl,{preserveJoinMapping}); }
        catch (error) {
          const r = error instanceof NodeProcedureStepError ? error.receipt : null;
          if (r?.status !== 'NOT_APPLIED'
            || r.effect_possible !== false || r.cleanup_complete !== true
            || r.trace?.some(e => ['ui_preconditions_verified','ui_gesture_applied'].includes(e.event))
            || !Array.isArray(r.trace)) throw error;
          const epochRefusal=r.phase==='preconditions'&&r.error?.code==='UI_EPOCH_CHANGED'
            ||r.phase==='observing'&&r.error?.code==='UI_ROOT_STALE';
          const consoleEpochRefusal=quietConsole&&epochRefusal&&r.error?.code==='UI_EPOCH_CHANGED';
          if(attempt>=2&&!consoleEpochRefusal)throw error;
          const scanRefusal=timeScanRefusal(r,'ui.act');
          const graphRefusal=action.verb==='execute_graph_node'&&r.phase==='preconditions'
            &&r.error?.code==='GRAPH_EXECUTION_CONTEXT_CHANGED';
          const nodeChanges=r.trace.filter(e=>['prepared_node_context_changed_before_gesture','prepared_node_surface_mismatch'].includes(e.event));
          const before=nodeChanges[0]?.before,after=nodeChanges[0]?.after;
          // The strict pre-gesture guard did not dispatch. Only a lock-only
          // change of this same native graph node permits a full fresh read;
          // neither the rejected snapshot nor its UI refs can be reused.
          const progressReadRefusal=r.phase==='observing'&&action.verb==='click'
            &&observed.ui.elements.find(e=>e.ref===action.ref)?.tid==='MF;cntMain;tlbMainToolbar;btnProgress'
            &&nodeChanges[0]?.event==='prepared_node_surface_mismatch';
          const nodeLockRefusal=!!preparedNodeContext&&(progressReadRefusal
            ||r.phase==='preconditions'&&nodeChanges[0]?.event==='prepared_node_context_changed_before_gesture')
            &&r.error?.code==='PREPARED_NODE_CONTEXT_CHANGED'&&nodeChanges.length===1
            &&before?.verified===true&&after?.verified===true&&before.surface==='graph'&&after.surface==='graph'
            &&typeof before.locked==='boolean'&&typeof after.locked==='boolean'&&before.locked!==after.locked
            &&JSON.stringify(canonical({...before,locked:false}))===JSON.stringify(canonical({...after,locked:false}))
            &&JSON.stringify(canonical({...before,locked:false}))===JSON.stringify(canonical({...observed.prepared_node_context,locked:false}));
          // Only an opting-in source selector can prove a replaced native body.
          // This remains a new observation and bound attempt, never a raw retry.
          const bodyRefusal=r.phase==='preconditions'&&['UI_REFERENCE_STALE','UI_REFERENCE_OBSCURED'].includes(r.error?.code)
            &&bodyRefreshes===0&&typeof refreshReplacedBody==='function'
            &&refreshReplacedBody({receipt:r,observation:observed,action})===true;
          const graphBusyRefusal=r.phase==='preconditions'&&r.error?.code==='UI_REFERENCE_OBSCURED'
            &&typeof refreshGraphBusy==='function'&&refreshGraphBusy({receipt:r,observation:observed,action})===true;
          const wizard=observed.wizard,masked=r.output,control=observed.ui.elements.find(e=>e.ref===action.ref);
          const covered=masked?.ui?.elements?.filter(e=>e.tid===control?.tid);
          // An opting-in picker may wait for its own late loading mask only
          // after a matched no-effect refusal. A new read must clear every
          // blocker and rebind the same owner/field before another guarded act.
          const busyRefusal=refreshWizardBusy===true&&!!preparedNodeContext&&action.verb==='click'
            &&r.phase==='preconditions'&&r.error?.code==='UI_REFERENCE_OBSCURED'
            &&wizard?.status==='observed'&&masked?.wizard?.status==='observed'
            &&['root_ref','root_tid','stage'].every(k=>wizard[k]&&wizard[k]===masked.wizard[k])
            &&[observed,masked].every(s=>s.prepared_node_context?.surface==='wizard'&&s.prepared_node_context.tid===wizard.root_tid)
            &&control?.wizard_combo?.kind==='picker'&&control.wizard_combo.field?.root_ref===wizard.root_ref
            &&covered?.length===1&&covered[0].wizard_combo?.kind==='picker'
            &&covered[0].wizard_combo.field?.root_ref===wizard.root_ref
            &&covered[0].wizard_combo.field.name===control.wizard_combo.field.name
            &&covered[0].interaction?.state==='point_not_observed'
            &&covered[0].interaction.covering?.length===1&&covered[0].interaction.covering[0].tid===wizard.root_tid
            &&masked.ui.dialogs?.length===0&&masked.ui.masks?.length===1
            &&masked.ui.masks[0].kind==='busy'&&masked.ui.masks[0].ref===wizard.root_ref
            &&masked.ui.masks[0].target_tid===wizard.root_tid&&masked.ui.masks[0].dialog_ref===null;
          if(busyRefusal)assertContext(masked,true);
          if(!epochRefusal&&!bodyRefusal&&!scanRefusal&&!graphRefusal&&!nodeLockRefusal&&!busyRefusal&&!graphBusyRefusal)throw error;
          if(bodyRefusal)bodyRefreshes++;
          const event = await entry('node_step_refresh_authorized', {
            step:operation.nodeStepSequence,internal_operation_id:r.operation_id,
            rejected_operation_id: r.operation_id, retry: attempt + 1,
            condition, binding_sha256: binding, intent_sha256: intent,
            effect_possible: false,
            ...(consoleEpochRefusal?{reason:'launched_console_epoch_changed'}:{}),
            ...(bodyRefusal?{reason:'prepared_graph_body_replaced'}:{}),
            ...(scanRefusal?{reason:'read_scan_time_limit'}:{}),
            ...(graphRefusal?{reason:'graph_execution_context_changed'}:{}),
            ...(nodeLockRefusal?{reason:'prepared_node_lock_changed',before:structuredClone(before),after:structuredClone(after)}:{}),
            ...(busyRefusal?{reason:'owned_wizard_busy_mask'}:{}),
            ...(graphBusyRefusal?{reason:'owned_graph_busy_mask'}:{}),
          });
          if (event?.rejected_operation_id !== r.operation_id || event.retry !== attempt + 1
            || event.binding_sha256 !== binding || event.intent_sha256 !== intent) {
            throw new Error('Node recovery authorization was not durably preserved');
          }
        }
      }
    },
    get steps() { return sequence; },
    get launchConfirmed() { return launchConfirmed; },
    // Execution drivers can be recreated between JS materialization/finish.
    // Retain the pre-launch control; never recapture its replacement afterwards.
    get launchConsoleControl() { return launchConsoleControl&&structuredClone(launchConsoleControl); },
    get lastPreparedStep() { return structuredClone(lastPreparedStep); },
    stepsSince(step) {
      if (preparedStepsTrimmed && !(preparedSteps[0]?.step <= step + 1)) throw new Error('Prepared step log no longer covers this boundary');
      return structuredClone(preparedSteps.filter(item => item.step > step));
    },
  };
  return Object.freeze(channel);
}

function timeScanRefusal(receipt,actionKey) {
  return receipt?.status==='NOT_APPLIED'&&receipt.action_key===actionKey&&receipt.phase==='observing'
    &&receipt.effect_possible===false&&receipt.cleanup_complete===true&&receipt.error?.code==='UI_SCAN_LIMIT'
    &&receipt.output?.observation_required===true&&receipt.output.scan?.complete===false&&receipt.output.scan.limit_exceeded===true
    &&Array.isArray(receipt.trace)&&receipt.trace.some(e=>e.event==='ui_scan_limit'&&e.limit_kind==='time')
    &&!receipt.trace.some(e=>['ui_preconditions_verified','ui_gesture_applied'].includes(e.event));
}
