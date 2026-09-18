import { createHash } from 'node:crypto';

export const NODE_CONTRACT_REVISION = '1.0.0';
// Native node labels and ports extend above/left of the model-space origin.
// Zoom cannot reveal that footprint at the canvas's zero-scroll boundary.
export const NODE_POSITION_MIN = 64;
const definitions = [
  ['research.duplicates', 'Дубликаты и противоречия', 'duplicates', 1, 1, false, ['mark'], 'processors/scrutiny/duplicates.md'],
  ['preprocessing.data_recovery', 'Заполнение пропусков', 'datarecovery', 1, 1, false, ['impute'], 'processors/preprocessing/imputation.md'],
  ['exports.text', 'Текстовый файл', 'exporttextfile', 1, 0, false, ['delimited'], 'integration/export/txt-csv.md'],
  ['imports.text', 'Текстовый файл', 'importtextfile', 0, 1, false, ['delimited'], 'integration/import/txt/README.md'],
  ['transform.calculator', 'Калькулятор', 'calcdata', 1, 1, false, ['expression'], 'processors/transformation/calc/README.md'],
  ['transform.reform_columns', 'Параметры полей', 'reformcolumns', 1, 1, false, ['scalar'], 'processors/transformation/fields-features.md'],
  ['transform.filter_data', 'Фильтр строк', 'filterdata', 1, 2, false, ['conditions', 'row_number'], 'processors/transformation/row-filter/README.md'],
  ['transform.group_data', 'Группировка', 'groupdata', 1, 1, false, ['aggregate'], 'processors/transformation/grouping.md'],
  ['transform.replace_columns', 'Замена', 'replacecolumns', 1, 1, false, ['exact'], 'processors/transformation/substitution/README.md'],
  ['transform.date_time', 'Дата и время', 'datereform', 1, 1, false, ['calendar'], 'processors/transformation/trans-datatime/README.md'],
  ['transform.collapse_columns', 'Свертка столбцов', 'columnflipping', 1, 1, false, ['unpivot'], 'processors/transformation/collapse-columns.md'],
  ['transform.sorting', 'Сортировка', 'sorting', 1, 1, false, ['keys'], 'processors/transformation/sorting.md'],
  ['transform.join_data', 'Слияние', 'joindata', 2, 1, false, ['inner', 'left'], 'processors/transformation/join/README.md'],
  ['transform.union_data', 'Объединение', 'uniondata', 2, 1, true, ['append_all'], 'processors/transformation/union.md'],
];
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
export const NODE_TYPES = freeze(Object.fromEntries(definitions.map(([type, title, icon, inputs, outputs, additional, modes, help]) => [type, {
  type, title, palette_group: type === 'exports.text' ? 'Экспорт' : type === 'research.duplicates' ? 'Исследование' : type === 'preprocessing.data_recovery' ? 'Предобработка' : type === 'imports.text' ? 'Импорт' : 'Трансформация', icon_class: 'bg-vendor-icon-' + icon, contract_revision: NODE_CONTRACT_REVISION,
  tabular_inputs: inputs, tabular_outputs: outputs, additional_tabular_inputs: additional, modes,
  semantics: type === 'transform.join_data' ? 'Join two tables by keys; not positional Соединение.'
    : type === 'transform.union_data' ? 'Append rows, preserving duplicates; not UNION DISTINCT.' : type === 'research.duplicates' ? 'Mark all copies and contradictions; retain all rows. Filtering Duplicate=false removes every member of a duplicate group. Unassigned fields are preserved and ignored. No automatic deduplication or conflict resolution.' : title,
  graph_handler: 'node_target_v1', graph_handler_status: 'internal_candidate', configuration_handler: null,
  configuration_status: type==='exports.text'?'candidate_in_subplan_17':'planned_in_subplans_03_to_10',
  sources: { e2e: ['bg/helpers/workflow/node.ts', 'bg/helpers/workflow/ports.ts', 'bg/helpers/workflow/links.ts'],
    help_root: 'viking://resources/loginom-dock/sources/loginom-help', help_path: 'data/' + help },
}])));

const object = (value, keys, required = keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(k => !keys.includes(k)) || required.some(k => !Object.hasOwn(value, k))) throw new Error('Invalid node contract object');
};
const id = value => { if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(value)) throw new Error('Invalid node identity'); };
const index = value => { if (!Number.isInteger(value) || value < 0 || value > 99) throw new Error('Invalid tabular port index'); };
export function validateNodeReference(ref) {
  object(ref, ['document_id', 'workflow_id', 'node_id']); Object.values(ref).forEach(id);
}
export function validateNodeTargetRequest(request) {
  object(request, ['document_id', 'workflow_ref', 'target', 'inputs'], ['document_id', 'workflow_ref', 'target', 'inputs']);
  id(request.document_id);
  object(request.workflow_ref, ['workflow_id', 'tab_tid', 'prefix', 'navigation_path']);
  id(request.workflow_ref.workflow_id);
  if (!/^MF;TF(?:-\d+)?$/.test(request.workflow_ref.prefix)
    || !/^MF;cntMain;cntWorkspace;Workspace;t\.br;tb(?:-\d+)?$/.test(request.workflow_ref.tab_tid)
    || !Array.isArray(request.workflow_ref.navigation_path) || !request.workflow_ref.navigation_path.length || request.workflow_ref.navigation_path.length > 32
    || request.workflow_ref.navigation_path.some(c=>!c || typeof c.tid!=='string' || !c.tid || typeof c.label!=='string' || Object.keys(c).some(k=>!['tid','label'].includes(k)))) throw new Error('Full prepared workflow reference required');
  const target = request.target;
  if (target?.kind === 'new') {
    object(target, ['kind', 'type', 'label', 'position'], ['kind', 'type']);
    if (!Object.hasOwn(NODE_TYPES, target.type)) throw new Error('Node type has no local graph handler');
  } else if (target?.kind === 'existing') {
    object(target, ['kind', 'ref', 'type', 'label', 'position'], ['kind', 'ref', 'type']);
    validateNodeReference(target.ref);
    if (!Object.hasOwn(NODE_TYPES, target.type)) throw new Error('Node type has no local graph handler');
    if (target.ref.document_id !== request.document_id || target.ref.workflow_id !== request.workflow_ref.workflow_id) throw new Error('Target belongs to another workflow');
  } else throw new Error('Choose exactly one new or existing node target');
  if (target.label !== undefined && (typeof target.label !== 'string' || !target.label.trim() || target.label.length > 200
    || /[;|<>"'\\\x00-\x1f]/.test(target.label))) throw new Error('Unsupported node label');
  if (target.position !== undefined) {
    object(target.position, ['x', 'y']);
    for(const axis of ['x','y'])if(!Number.isFinite(target.position[axis]) || target.position[axis]<NODE_POSITION_MIN || target.position[axis]>10000)
      throw new Error('Invalid parameters.target.position.'+axis+': expected '+NODE_POSITION_MIN+'..10000 to keep the node label and ports inside the canvas; omit target.position for automatic placement');
  }
  if (!Array.isArray(request.inputs) || request.inputs.length > 100) throw new Error('Bounded input list required');
  const targets = new Set();
  for (const input of request.inputs) {
    object(input, ['source', 'output', 'input']); validateNodeReference(input.source); index(input.output); index(input.input);
    if (input.source.document_id !== request.document_id || input.source.workflow_id !== request.workflow_ref.workflow_id) throw new Error('Input belongs to another workflow');
    if (targets.has(input.input)) throw new Error('More than one source for a target input');
    targets.add(input.input);
    if (!NODE_TYPES[target.type].additional_tabular_inputs && input.input >= NODE_TYPES[target.type].tabular_inputs) throw new Error('Target tabular input does not exist');
    if (target.kind === 'existing' && input.source.node_id === target.ref.node_id) throw new Error('Self-link is not allowed');
  }
  return request;
}

// Cards are data only. They never install handlers or imply platform/license availability.
export function describeNodeTypes(types, pins = {}, actions = new Map(), candidateHandlers = new Map()) {
  if (!Array.isArray(types) || !types.length || types.length > 32 || new Set(types).size !== types.length
    || types.some(type => !Object.hasOwn(NODE_TYPES, type))) throw new Error('Select one to thirty-two distinct supported node types');
  return types.map(type => {
    const card = structuredClone(NODE_TYPES[type]);
    const admitted = actions.get('node.add')?.input_schema?.properties?.component_key?.enum?.includes(type) === true;
    const candidate=candidateHandlers.get(type);
    const identity = { type, contract_revision: NODE_CONTRACT_REVISION, pins, candidate_handler_revision:candidate?.revision??null };
    return { ...card, catalog_add_available: admitted, platform_availability: 'requires_live_preflight',
      full_node_apply_available: false, cache_key: createHash('sha256').update(JSON.stringify(identity)).digest('hex'),
      candidate_node_apply_available:!!candidate,
      ...(candidate?{configuration_handler:candidate.revision,configuration_status:'candidate_pending_autonomous_acceptance',candidate_apply_tool:'dock_node_apply',candidate_modes:[...candidate.modes]}:{}),
      ...(candidate?.parameter_schema?{parameter_schema:structuredClone(candidate.parameter_schema)}:{}),
      session_manifest: structuredClone(pins) };
  });
}
