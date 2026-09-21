// The user supplies an issued workflow identity. Long UI paths remain pinned
// locally; the normal node contract and all live identity guards stay intact.
export const userActionKeys=['package.save_checkpoint','package.save_as'];
const exportCreationDefaults=Object.freeze({encoding:'UTF-8',delimiter:',',header:'names',bom:false,line_ending:'LF',decimal_separator:'.',null_marker:'',text_qualifier:'"'});
export function userActionTool(tool) {
  if(!['dock_action_run','dock_action_describe'].includes(tool.name))return tool;
  const copy=structuredClone(tool),p=copy.inputSchema.properties;
  p.action_key.enum=[...userActionKeys];
  if(p.action_keys)p.action_keys.items.enum=[...userActionKeys];
  copy.description=tool.name==='dock_action_run'
    ? 'Save the completed scenario with package.save_checkpoint. Use package.save_as only when the user explicitly requests reopening the saved package; it closes and reopens the workflow. First request missing action parameters with dock_action_describe. Create and configure supported nodes through dock_node_apply.'
    : 'List supported nodes with {}. Request node_types:[type] for that node parameter schema, or action_keys for package saving. Read-only; does not change Loginom.';
  return copy;
}
export function userActionInventory(value) {
  const copy=structuredClone(value);
  if(copy.available_actions)copy.available_actions=copy.available_actions.filter(k=>userActionKeys.includes(k));
  for(const key of ['ui_action_tool','artifact_upload_tool','artifact_verify_tool'])delete copy[key];
  for(const node of copy.node_types??[])if(node.type==='exports.text'&&node.parameter_schema){
    node.creation_defaults={required_parameters:['destination'],parameters:{...exportCreationDefaults}};
    node.parameter_schema.description='For target.kind=new, destination is required and omitted technical settings use creation_defaults. Explicit settings are preserved. For existing nodes, parameters remain a patch; omitted settings are unchanged. Overwrite defaults to reject.';
  }
  return copy;
}
export function userNodeTool(tool) {
  if (!['dock_node_apply', 'dock_node_resume'].includes(tool.name)) return tool;
  const copy = structuredClone(tool);
  if(tool.name==='dock_node_resume'){
    copy.inputSchema={type:'object',properties:{operation_id:copy.inputSchema.properties.operation_id},required:['operation_id'],additionalProperties:false};
    copy.description='Continue the SAME inspected node operation using only its original operation_id. Dock retains the immutable request and accepted phases. Unresolved effects still require verified reconciliation; never recreate the node.';
    return copy;
  }
  const workflow = copy.inputSchema.properties.workflow_ref;
  workflow.properties = { workflow_id: workflow.properties.workflow_id };
  workflow.required = ['workflow_id'];
  copy.inputSchema.required=copy.inputSchema.required.filter(k=>!['read','budgets','mappings'].includes(k));
  copy.inputSchema.properties.read.required=[];
  // The compact profile owns technical scheduling. A model-selected short
  // deadline can strand an otherwise valid wizard; full diagnostic contracts
  // still expose explicit immutable budgets.
  delete copy.inputSchema.properties.budgets;
  copy.inputSchema.properties.parameters={type:'object',properties:{},additionalProperties:true,
    description:'Type-specific settings. First call dock_action_describe with node_types:[target.type] and follow its parameter_schema.'};
  copy.description = tool.name==='dock_node_resume'
    ? 'Continue the original node operation with identical original parameters after inspecting it. Never repeat an unresolved effect with a new ID.'
    : 'Create or update ONE supported node: connect, configure, finish, execute and read its output. First get the selected type parameters with dock_action_describe({node_types:[type]}). Use the issued document_id and workflow_ref:{workflow_id}. Position, mappings and read are optional technical defaults. The application manages bounded execution deadlines; do not supply budgets. Model chooses formulas, keys and analytical parameters. Wait on the same operation_id; save the package at the end.';
  return copy;
}

export function createUserWorkflowBindings() {
  const references = new Map();
  const deliveryArtifacts=new Map(),uploads=new Map();
  const key = (document, workflow) => JSON.stringify([document, workflow]);
  const samePath = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length
    && a.every((part, i) => part.tid === b[i].tid && part.label === b[i].label);
  return {
    rememberDelivery(result,request) {
      if(!result?.upload_operation_id)return;
      if(typeof request?.artifact_id==='string')deliveryArtifacts.set(result.operation_id,request.artifact_id);
      const outcome=result.outcome,artifact=deliveryArtifacts.get(result.operation_id);
      if(artifact&&outcome?.status==='SUCCEEDED'&&outcome.cleanup_complete===true&&outcome.upload_completion_verified===true
        &&typeof outcome.destination==='string'&&outcome.destination.startsWith('/'))
        uploads.set(result.upload_operation_id,{artifact_id:artifact,destination:outcome.destination});
    },
    remember({ document_id, workflow_ref }) {
      if (typeof document_id !== 'string' || !workflow_ref?.workflow_id || !Array.isArray(workflow_ref.navigation_path)) return;
      references.set(key(document_id, workflow_ref.workflow_id), structuredClone(workflow_ref));
    },
    expandNode(request) {
      const ref = references.get(key(request.document_id, request.workflow_ref?.workflow_id));
      if (!ref) throw Error('UNKNOWN_PREPARED_WORKFLOW: use document_id and workflow_id issued together by successful dock_prepare. No node operation started.');
      const ports=request.finish!=='execute'||request.target.type==='exports.text'?[]:
        request.target.type==='transform.filter_data'?[0,1]:[0];
      let parameters=request.parameters;
      if(request.target.kind==='new'&&request.target.type==='exports.text'&&parameters&&typeof parameters==='object'&&!Array.isArray(parameters))
        parameters={...exportCreationDefaults,...parameters};
      if(request.target.kind==='new'&&request.target.type==='imports.text'&&parameters?.settings){
        const settings=parameters.settings,upload=uploads.get(parameters.source?.upload_operation_id);
        parameters={...parameters,settings:{...settings,
          source:{encoding:'UTF-8',rows_to_skip:0,first_line_as_title:true,
            ...(upload?.artifact_id===parameters.source?.artifact_id?{source_path:upload.destination}:{}),...settings.source},
          format:{delimiter:',',decimal_separator:'.',null_marker:'',text_qualifier:'"',...settings.format},
          ...(Array.isArray(settings.columns)?{columns:settings.columns.map(c=>c&&typeof c==='object'&&!Array.isArray(c)?({label:c.name,
            data_kind:c.type==='real'?'Непрерывный':'Дискретный',used:true,...c}):c)}:{}),
        }};
      }
      return { ...request,parameters, workflow_ref: structuredClone(ref),mappings:request.mappings??[],
        read:{ports,sample_rows:ports.length?5:0,require_exact_numbers:false,...request.read},
        // Native wide-column setup and exact-format readback are sequential UI
        // work. Reserve time for both; explicit caller deadlines remain binding.
        budgets:{configure_ms:300000,execute_ms:120000,total_ms:Math.max(600000,request.budgets?.configure_ms??0,request.budgets?.execute_ms??0),...request.budgets} };
    },
    normalizePreparation(args) {
      if (args.intent !== 'existing_workflow') return args;
      const supplied = args.workflow_ref;
      const ref = references.get(key(supplied?.document_id, supplied?.workflow_id));
      if (!ref) throw Error('UNKNOWN_PREPARED_WORKFLOW: existing_workflow requires a reference issued in this session.');
      const expected = { ...structuredClone(ref), document_id: supplied.document_id };
      if (supplied.tab_tid !== ref.tab_tid || supplied.prefix !== ref.prefix || !samePath(supplied.navigation_path, ref.navigation_path))
        throw Error('WORKFLOW_REFERENCE_MISMATCH: no preparation started; use the retained reference: ' + JSON.stringify(expected));
      return { ...args, workflow_ref: expected };
    },
  };
}
