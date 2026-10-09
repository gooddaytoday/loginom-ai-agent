import {nodeOutputPortSchema} from './node-result-schema.mjs';
import {budgetUserPreview} from './user-preview-budget.mjs';
import {calculatorPrecisionWarnings} from './calculator-precision-warning.mjs';
const pick = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));
export const userResultSchema = {
  type: 'object', required: ['result_version', 'operation_id'], additionalProperties: false,
  properties: {
    result_version: { type: 'string', const: 'user-v1' }, operation_id: { type: ['string','null'], minLength: 1 },
    request_rejected: {type:'boolean'}, next_step: {type:'object'},
    attempt: { type: 'integer', minimum: 1 }, state: { type: 'string', enum: ['running', 'settled'] },
    status: { type: 'string', enum: ['SUCCEEDED', 'FAILED', 'AMBIGUOUS', 'NOT_APPLIED'] },
    action_key: { type: 'string' }, phase: { type: 'string' }, cancel_requested: { type: 'boolean' },
    server_stop_requested: { type: 'boolean' }, progress: { type: ['object', 'null'] },
    effect_possible: { type: 'boolean' }, cleanup_complete: { type: 'boolean' },
    node: { anyOf: [{ type: 'null' }, { type: 'object', required: ['document_id', 'workflow_id', 'node_id'], additionalProperties: false,
      properties: { document_id: { type: 'string' }, workflow_id: { type: 'string' }, node_id: { type: 'string' } } }] },
    configuration: { type: 'object' },
    execution: { type: ['object', 'null'] }, package_saved: { type: 'boolean' }, output: { type: 'object', properties:{ports:{type:'array',items:{type:'object',allOf:[{if:{anyOf:['exact_table','read_coverage','read_consistency','cell_precision','binding'].map(k=>({required:[k]}))},then:{...nodeOutputPortSchema,required:[...nodeOutputPortSchema.required,'exact_table','read_coverage','read_consistency','cell_precision','binding']}}]}}}, additionalProperties:true },
    error: { type: ['object', 'null'] }, limitations: { type: 'array', items: { type: 'string' } },
  },
};

export function compactNodeRequestFailure(outcome,request={}) {
  const pending=outcome.effect_possible===true;
  const requestedId=typeof request.operation_id==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(request.operation_id)?request.operation_id:null;
  const message=outcome.error?.message??'Request rejected';
  let path=/Invalid parameters\.([^:]+):/.exec(message)?.[1]??null;
  const unknown=/^Invalid parameters(?:\.[^:]+)?: unknown field ([A-Za-z_][A-Za-z_0-9]*)$/.exec(message)?.[1];
  if(unknown&&path)path+='.'+unknown;
  const operationId=outcome.operation_id??requestedId;
  const active=outcome.output?.active_node_job;
  if(active?.state==='running'&&typeof active.operation_id==='string')return {
    result_version:'user-v1',operation_id:active.operation_id,state:'running',
    action_key:'node.apply',phase:'request_rejected',request_rejected:true,
    effect_possible:true,cleanup_complete:false,error:{...outcome.error,parameter_path:path},
    output:{},limitations:[],
    next_step:{tool:'dock_node_wait',arguments:{operation_id:active.operation_id,timeout_ms:10000},
      rejected_operation_id:requestedId,
      instruction:'The original node operation is still running. Wait for this operation ID; the competing request did not start. Do not inspect or repeat browser mutations while it runs.'}};
  return {result_version:'user-v1',operation_id:operationId,state:'settled',
    status:pending?'AMBIGUOUS':'NOT_APPLIED',action_key:outcome.action_key,phase:'request_rejected',
    request_rejected:true,effect_possible:pending,cleanup_complete:!pending,
    error:{...outcome.error,parameter_path:path},output:{},limitations:[],
    next_step:pending?{tool:'dock_operation_inspect',arguments:{operation_id:outcome.operation_id},
      instruction:'Inspect the original operation before continuing; do not repeat a possible effect.'}:
      path?.startsWith('parameters.')&&typeof request.target?.type==='string'
        ?{tool:'dock_action_describe',arguments:{node_types:[request.target.type]},original_operation_id:requestedId,
          instruction:'Read the parameter_schema for this exact node type. Then correct the rejected parameters and submit dock_node_apply with a NEW operation_id. No browser recovery is required.'}
        :{tool:'dock_node_apply',original_operation_id:requestedId,
          instruction:'Correct the indicated request using its schema and submit it with a NEW operation_id. No browser recovery is required.'}};
}

export function compactNodeResult(result) {
  const outcome = result.outcome, node = outcome?.output, data = node?.output;
  const output = data ? pick(data, ['status', 'evidence_ref', 'execution_id', 'no_output_requested']) : {};
  if (data?.ports) output.ports = data.ports.map(port => {
    const value = pick(port, ['port', 'port_guid', 'fresh', 'execution_id', 'category_fields', 'schema', 'row_count', 'sample', 'sample_rows', 'sample_complete', 'precision', 'table', 'exact_table', 'read_coverage', 'read_consistency', 'cell_precision', 'binding', 'limitations']);
    value.schema = value.schema.map(column => pick(column, ['index', 'name', 'label', 'type', 'data_kind']));
    value.sample = value.sample.map(row => row.map(cell => {
      const compact = pick(cell, ['type', 'value', 'decimal', 'representation', 'display_text', 'precision', 'is_null', 'timezone', 'cell_type', 'native']);
      if (compact.value === compact.display_text) delete compact.display_text;
      return compact;
    }));
    value.sample_rows = value.sample.length;
    value.sample_complete = port.sample_complete && value.sample.length === port.sample.length;
    return value;
  });
  if (data?.file_artifacts) output.file_artifacts = data.file_artifacts.map(file => pick(file, ['artifact_id', 'destination', 'bytes', 'sha256', 'execution_id', 'verification_id', 'freshness_basis']));
  if (data?.format_restoration) output.format_restoration = pick(data.format_restoration, ['restored', 'table']);
  if (data?.workflow_return) output.workflow_returned = data.workflow_return.verified === true;
  const limitations=[...(node?.warnings??[])];
  if(outcome?.status==='SUCCEEDED')limitations.push(...calculatorPrecisionWarnings(node));
  // Delivery jobs carry their byte-verified destination in outcome directly.
  if (!node && outcome) Object.assign(output, outcome);
  const next=outcome?.next_step??node?.next_step??(outcome&&['FAILED','AMBIGUOUS','NOT_APPLIED'].includes(outcome.status)&&!result.upload_operation_id
    ?outcome.effect_possible===false&&outcome.cleanup_complete===true
      ?{tool:'dock_node_apply',original_operation_id:result.operation_id,instruction:'Correct the request and submit with a NEW operation_id. No node mutation or browser recovery is required.'}
      :{tool:'dock_operation_inspect',arguments:{operation_id:result.operation_id},instruction:'Inspect the original operation; do not repeat an unresolved effect.'}
    :null);
  const reply={
    result_version: 'user-v1', ...pick(result, ['operation_id', 'attempt', 'state', 'cancel_requested', 'server_stop_requested']),
    ...(result.state === 'running' ? { progress: result.progress } : {}),
    ...pick(outcome, ['status', 'action_key', 'phase', 'effect_possible', 'cleanup_complete']),
    ...pick(node, ['node', 'execution', 'package_saved', 'configuration']), output,
    error: result.error ?? outcome?.error ?? null,
    limitations,
    ...(next?{next_step:next}:{}),
  };
  budgetUserPreview(reply);
  for(const port of output.ports??[])if(Number.isSafeInteger(port.row_count)&&port.sample_rows<port.row_count)
    limitations.push('Output port '+port.port+': only '+port.sample_rows+' of '+port.row_count+' rows returned. Do not report unseen rows or a complete ranking from this preview. Compute report statistics in nodes and request the needed output.');
  for(const port of output.ports??[])if(port.sample.length){
    const zeros=port.sample.reduce((count,row)=>count+row.filter(cell=>cell.is_null===false
      &&['integer','real'].includes(cell.type)&&((cell.value??cell.decimal)===0
        ||typeof (cell.value??cell.decimal)==='string'&&/^[+-]?0+(?:\.0*)?(?:[eE][+-]?\d+)?$/.test(cell.value??cell.decimal))).length,0);
    if(zeros)limitations.push('Output port '+port.port+': '+zeros+' returned numeric cells contain explicit zero, not NULL. This alone does not establish missing observations, future periods or censoring. Such interpretations require separate source metadata; do not infer them from the shape of zeros.');
    const names=port.schema.filter((_,i)=>port.sample.every(row=>row[i]?.is_null===true)).map(c=>c.name);
    if(names.length)limitations.push('Output port '+port.port+': every returned cell is NULL in '+JSON.stringify(names.slice(0,8))
      +(names.length>8?' (and '+(names.length-8)+' more fields)':'')+'. This describes only the '+port.sample.length
      +' returned rows. Check expression input types if these NULL values are unexpected; do not infer values for unread rows.');
  }
  return reply;
}

export function compactActionResult(result) {
  // Keep continuation references and observed UI controls: removing these would
  // force another observation, or tempt clients to reuse stale references.
  const copy = structuredClone(result);
  delete copy.trace;
  if (copy.status === 'SUCCEEDED' && ['package.save_as', 'package.save_checkpoint'].includes(copy.action_key)) {
    copy.output = pick(copy.output, ['package_ref', 'reopened', 'workflow_preserved', 'save_completed', 'persisted_content_verified', 'workflow_continuations']);
    copy.output.reporting_constraints = ['Сохранение подтверждает пакет, но не правильность итогового текста. Для каждого численного вывода используй прочитанное поле результата узла. Разности, изменения в п.п. и темпы роста тоже должны быть вычислены в узлах; не вычитай округлённые проценты. Если нужного показателя нет, вычисли его или не добавляй необязательное число.', 'Ноль и отсутствие наблюдения различаются. Не объявляй нули пропусками или будущими периодами без явного признака в исходных данных либо условия задания. Интерпретацию, не подтверждённую данными, обозначай как гипотезу.'];
    if (copy.output.workflow_continuations) copy.output.workflow_continuations = copy.output.workflow_continuations.map(item => pick(item, ['document_id', 'workflow_ref']));
  }
  return { ...copy, result_version: 'user-v1' };
}

export function compactKnowledgeBundle(description) {
  return {
    version: 'user-v1', session_manifest: description.session_manifest,
    actions: description.actions.map(action => pick(action, ['action_key', 'revision', 'description', 'input_schema', 'effect'])),
    node_types: description.node_types.map(node => pick(node, ['type', 'contract_revision', 'cache_key', 'candidate_node_apply_available',
      'candidate_apply_tool', 'configuration_handler', 'semantics', 'modes', 'limitations'])),
  };
}
