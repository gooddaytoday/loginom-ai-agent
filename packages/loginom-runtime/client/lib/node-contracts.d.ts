/** Shared 02/03 contract. Runtime publication of node.apply belongs to 03. */
export type NodeType = 'exports.text' | 'transform.collapse_columns' | 'preprocessing.data_recovery' | 'transform.date_time' | 'imports.text' | 'transform.calculator' | 'transform.reform_columns'
  | 'research.duplicates' | 'transform.replace_columns' | 'transform.filter_data' | 'transform.group_data' | 'transform.sorting'
  | 'transform.join_data' | 'transform.union_data';
export interface WorkflowRef { workflow_id: string; tab_tid: string; prefix: string; navigation_path: {tid: string; label: string}[] }
export interface NodeRef { document_id: string; workflow_id: string; node_id: string }
export interface Position { x: number; y: number }
export type NodeTarget<T extends NodeType = NodeType> =
  | {kind: 'new'; type: T; label?: string; position: Position}
  | {kind: 'existing'; type: T; ref: NodeRef; label?: string; position?: Position};
export interface InputLink { source: NodeRef; output: number; input: number }
export interface NodeTargetRequest<T extends NodeType = NodeType> {
  document_id: string; workflow_ref: WorkflowRef; target: NodeTarget<T>; inputs: InputLink[];
}
export interface FieldRef { schema_id: string; field_id: string }
/** Refers to this operation's fully configured source, resolved locally before mapping. */
export interface ConfiguredFieldRef { kind: 'configured_field'; name: string }
export interface PortMapping {
  direction: 'input' | 'output'; port: number; autosync?: boolean;
  fields?: {source: FieldRef | ConfiguredFieldRef; name?: string; label?: string; excluded?: boolean}[];
}
/** Each handler binds and validates P through its pinned local JSON schema. */
export interface NodeApplyRequest<T extends NodeType, P> extends NodeTargetRequest<T> {
  operation_id: string; contract_revision: string; mode: string; parameters: P;
  mappings: PortMapping[]; finish: 'done' | 'execute' | 'close';
  read: {ports: number[]; sample_rows: number; require_exact_numbers: boolean; coverage?: 'sample' | (T extends 'transform.collapse_columns' ? 'full' : never)};
  budgets: {configure_ms: number; execute_ms: number; total_ms: number};
}
export interface NodeHandler<T extends NodeType, P> {
  type?: T; revision: string; modes: readonly string[]; parameter_schema?: object;
  output_wizard?: 'embedded' | 'separate';
  /** Must reject invalid/unsupported parameters before the graph phase. */
  validate(parameters: unknown, mode: string, request?: NodeApplyRequest<T, P>): P | void;
  /** Runs inside the caller's gate, journal, deadline and cancellation scope. */
  configure(context: NodeProcedureContext, parameters: P): Promise<VerifiedNodePhase>;
  /** Pure projection of accepted receipts; never executes or rereads the UI. */
  configurationReadback?(context: {node: NodeRef; operation_id: string;
    phases: Array<PhaseReceipt & {value: VerifiedNodePhase}>}): TextImportConfigurationReadback | CalculatorConfigurationReadback | GroupingConfigurationReadback | SortingConfigurationReadback | CollapseConfigurationReadback | MissingValuesConfigurationReadback | ReplacementConfigurationReadback | DuplicatesConfigurationReadback | JoinConfigurationReadback;
}
export interface VerifiedNodePhase { verified: true; cleanup_complete: true; effect_possible: boolean }
export interface NodeProcedureContext {
  operation: {id: string; [key: string]: unknown}; request: NodeApplyRequest<NodeType, unknown>;
  node: NodeRef | null; execution: NodeExecution; deadline: number;
  signal?: AbortSignal; stopSignal?: AbortSignal; receipt_id?: string;
}
export type PhaseName = 'validate' | 'source' | 'workflow' | 'target' | 'input_mapping' | 'open' | 'configure'
  | 'node_finish' | 'output_mapping' | 'finish' | 'execute' | 'read';
export interface PhaseReceipt { phase: PhaseName; receipt_id: string; status: 'pending' | 'verified' | 'not_requested'; effect_possible: boolean }
export interface NodeApplyResult {
  operation_id: string; status: 'SUCCEEDED' | 'FAILED' | 'NOT_APPLIED' | 'AMBIGUOUS'; effect_possible: boolean;
  phases: PhaseReceipt[]; node: NodeRef | null;
  execution: NodeExecution; output: NodeOutput;
  /** A local node checkpoint never proves that the package was saved. */
  package_saved: false; cleanup_complete: boolean; warnings: string[];
  configuration?: {status: 'applied' | 'discarded'; readback?: TextImportConfigurationReadback | CalculatorConfigurationReadback | GroupingConfigurationReadback | SortingConfigurationReadback | CollapseConfigurationReadback | MissingValuesConfigurationReadback | ReplacementConfigurationReadback | DuplicatesConfigurationReadback | JoinConfigurationReadback};
  checkpoint_kind?: 'local_node_checkpoint' | 'local_node_cancellation' | 'local_node_stopped' | 'local_node_failed';
  persisted_package_verified?: false; pending_phase?: PhaseName | null; error?: NodeError;
}
export interface TextImportConfigurationReadback {
  kind: 'text_import'; scope: 'observed_before_verified_finish'; node: NodeRef;
  receipt_ids: string[]; values_are: 'observed_ui_values'; package_persistence_verified: false;
  source: {source_path: string; connection: string; encoding: string; rows_to_skip: string; first_line_as_title: boolean};
  format: {delimiter: string; text_qualifier: string; null_marker: string; decimal_separator: string};
  columns: Array<{index: number; name: string; label: string; type: string; data_kind: string; used: boolean}>;
  output_mapping: {port: 0; autosync: boolean;
    fields: Array<{index: number; name: string; label: string; type: string; data_kind: string; source_name: string}>};
}
export interface CalculatorParameters {
  expressions: Array<{target: {kind: 'new'} | {kind: 'existing'; name: string};
    name?: string; label?: string; type?: 'integer' | 'real' | 'string' | 'boolean' | 'datetime';
    formula?: string; replace?: boolean}>;
  /** Complete ordered list of resulting expression names. */
  order?: string[];
}
export interface CalculatorConfigurationReadback {
  kind: 'calculator'; scope: 'observed_before_verified_finish'; node: NodeRef;
  receipt_ids: string[]; values_are: 'observed_ui_values'; package_persistence_verified: false;
  mode: 'expression'; syntax_validation: 'accepted_by_loginom_next';
  expressions: Array<{index: number; name: string; label: string; type: string; formula: string;
    replace: boolean; intermediate: boolean; cached: boolean; description: string}>;
  input_fields: Array<{name: string; label: string; type: string}>;
  input_mapping: {port: 0; autosync: boolean;
    fields: Array<{index: number; name: string; label: string; type: string; data_kind: string; source_name: string; excluded: boolean}>};
  output_mapping: {port: 0; autosync: boolean;
    fields: Array<{index: number; name: string; label: string; type: string; data_kind: string; source_name: string; excluded: boolean}>};
}
export interface GroupingParameters {
  /** Full ordered lists, or both omitted to retain an existing configuration. */
  group_by?: Array<{kind: 'input_field'; name: string}>;
  measures?: Array<{field: {kind: 'input_field'; name: string};
    function: 'sum' | 'count' | 'avg' | 'min' | 'max'; name: string; label: string}>;
}
export interface GroupingConfigurationReadback {
  kind: 'grouping'; scope: 'observed_before_verified_finish'; node: NodeRef;
  receipt_ids: string[]; values_are: 'observed_ui_values'; package_persistence_verified: false;
  mode: 'aggregate';
  group_by: Array<{name: string; label: string; type: string; order: number}>;
  measures: Array<{name: string; label: string; type: string; order: number; functions: number}>;
  options: {pedDimCache: {value: boolean; switch_pressed: boolean}; pedSortResult: {value: boolean; switch_pressed: boolean}};
  input_mapping: {port: 0; autosync: boolean;
    fields: Array<{index: number; name: string; label: string; type: string; data_kind: string; source_name: string}>};
  output_mapping: {port: 0; autosync: boolean;
    fields: Array<{index: number; name: string; label: string; type: string; data_kind: string; source_name: string; excluded: boolean}>};
}
export interface SortingParameters {
  /** Full replacement, or omitted to preserve existing keys. */
  keys?: Array<{field: {kind: 'input_field'; name: string}; direction: 'ASC' | 'DESC'; case_sensitive?: boolean}>;
  compare_with_locale?: boolean;
}
export interface SortingConfigurationReadback {
  kind: 'sorting'; scope: 'observed_before_verified_finish'; node: NodeRef;
  receipt_ids: string[]; values_are: 'observed_ui_values'; package_persistence_verified: false; mode: 'keys';
  keys: Array<{name: string; label: string; type: string; order: number; direction: 'ASC' | 'DESC'; case_sensitive: boolean}>;
  options: {chkLocaleAware: {value: boolean; switch_pressed: boolean}; chkBufferWhole: {value: boolean; switch_pressed: boolean}; cbxMaxThreadCount: {value: number; switch_pressed: boolean}};
  comparison: {mode: 'binary' | 'user_locale'; locale: string | null; locale_verified: boolean; case_insensitivity: 'latin_only' | 'locale_dependent'};
  input_mapping: GroupingConfigurationReadback['input_mapping'];
  output_mapping: GroupingConfigurationReadback['output_mapping'];
}
export type ReplacementValue = {type: 'string'; value: string | null}
  | {type: 'integer'; value: number | string | null} | {type: 'real'; value: number | null};
export type ReplacementRule = {
  field: {kind: 'input_field'; name: string};
  pairs: Array<{from: ReplacementValue; to: ReplacementValue}>;
  other: {mode: 'keep' | 'null'} | {mode: 'value'; value: ReplacementValue};
} & ({type: 'string'; case_sensitive: boolean} | {type: 'integer' | 'real'; precision: 0});
export interface ReplacementParameters {
  /** Each listed field replaces its entire table; unlisted fields are preserved. */
  rules?: ReplacementRule[];
  output_mode?: 'replace' | 'add';
}
export interface ReplacementConfigurationReadback {
  kind: 'replacement'; scope: 'observed_before_verified_finish'; node: NodeRef;
  receipt_ids: string[]; values_are: 'observed_ui_values'; package_persistence_verified: false;
  mode: 'exact'; rules: ReplacementRule[]; output_mode: 'replace' | 'add';
  input_mapping: GroupingConfigurationReadback['input_mapping'];
  output_mapping: GroupingConfigurationReadback['output_mapping'];
}
export interface NodeError {code: string; message: string; cause?: {code: string; message: string}}
export type NodeExecution = {status: 'not_requested' | 'pending' | 'completed' | 'cancelled'; execution_id: string | null; stop_verified?: boolean}
  | {status: 'failed'; execution_id: string; failure_verified: true; root_id: string; group_id: string; group_record_id: string};
export interface LegacyTableCell {
  cell_type?: never; native?: never;
  type: string; is_null: boolean; precision: string;
  /** Exact integers are decimal strings; real values retain canonical decimal text. */
  value?: string | number | boolean | null; decimal?: string; representation?: string;
  display_text?: string; timezone?: string;
}
export type NativeScalarType = 'integer' | 'real' | 'string' | 'boolean' | 'datetime';
interface NativeCellBase<T extends NativeScalarType | 'null', V, R extends string, N> {
  type: T extends 'null' ? NativeScalarType | 'variant' : T | 'variant';
  cell_type: T; is_null: T extends 'null' ? true : false; precision: 'exact_native';
  value: V; representation: R; native: N; display_text?: never;
}
export type NativeTableCell =
  | NativeCellBase<'null', null, 'native_null', {tag: 1; encoding: 'null'}>
  | (NativeCellBase<'integer', string, 'decimal_integer', {tag: 20; encoding: 'signed-int64-le'; bits: 64; bytes_le: string}> & {decimal: string})
  | (NativeCellBase<'real', string, 'binary64_decimal', {tag: 5; encoding: 'ieee754-binary64-le'; bits: 64; bytes_le: string}> & {decimal: string})
  | NativeCellBase<'string', string, 'native_string', {tag: 8; encoding: 'utf8'; utf8_hex: string}>
  | NativeCellBase<'boolean', boolean, 'native_boolean', {tag: 11; encoding: 'boolean8'; bytes_le: '00' | '01'}>
  | (NativeCellBase<'datetime', string, 'native_oadate_binary64_le', {tag: 7; encoding: 'oadate-binary64-le'; bits: 64; bytes_le: string;
      temporal_profile: 'loginom-7.4.2-native-oadate'; semantic_scope: 'native_serial_only'; civil_time_verified: false; epoch_verified: false}> & {decimal: string; timezone: 'unspecified'});
export type TableCell = LegacyTableCell | NativeTableCell;
export interface ExactTable {rows: NativeTableCell[][]; complete: true}
export interface NativeReadCoverage {cells_read: number; rows_read: number; columns_read: number; table_complete: true}
export interface NativeReadConsistency {
  kind: 'observed_local'; changed: false; exclusive_operation: true; stability_basis: 'owned_static_completed_fixture';
  atomic_snapshot: false; unobserved_aba_excluded: false;
}
export interface NativeReadBinding {
  read_id: string; document_id: string; workflow_id: string; package_id: string; node_id: string; port_guid: string;
  execution: {status: 'completed'; execution_id: string};
}
export interface NodeOutputPortBase {

  port: number; port_guid: string; fresh: boolean; execution_id: string; freshness_basis?: string;
  table?: {view_guid: string; port_guid: string; table_tid: string};
  schema: {index: number; name: string; label: string; type: string; data_kind?: string; header_tid?: string}[];
  row_count: number; sample: TableCell[][]; sample_rows: number; sample_complete: boolean;
  precision: {numbers_verified: boolean; limitations: string[]; strings: string};
  table_schema_id?: string; filter_enabled?: boolean;
}
export interface LegacyNodeOutputPort extends NodeOutputPortBase {
  exact_table?: never; read_coverage?: never; read_consistency?: never; binding?: never; cell_precision?: never;
}
export interface NativeNodeOutputPort extends NodeOutputPortBase {
  sample: NativeTableCell[][]; exact_table: ExactTable; read_coverage: NativeReadCoverage;
  read_consistency: NativeReadConsistency; binding: NativeReadBinding;
  cell_precision: {cells: 'exact_native'; temporal: 'native_serial_only'}; limitations: string[];
}
export type NodeOutputPort = LegacyNodeOutputPort | NativeNodeOutputPort;
export interface NodeOutput {
  status: 'not_refreshed' | 'partial' | 'complete'; evidence_ref: string | null;
  execution_id?: string; ports?: NodeOutputPort[]; no_output_requested?: boolean;
  verified?: boolean; cleanup_complete?: boolean; effect_possible?: boolean;
  /** Native format, read-setting and ownership evidence remains available. */
  [evidence: string]: unknown;
}
export interface NodeApplyOutcome {
  status: NodeApplyResult['status']; action_key: 'node.apply'; action_revision: string;
  operation_id: string; phase: string; effect_possible: boolean; cleanup_complete: boolean;
  output: NodeApplyResult; error: NodeError | null; trace: object[];
}
export interface NodeJobSnapshot {
  operation_id: string; attempt: number; state: 'running' | 'settled';
  cancel_requested: boolean; server_stop_requested: boolean;
  progress: {node: NodeRef | null; execution: NodeExecution; accepted_phases: PhaseName[];
    pending_phase: PhaseName | null; effect_possible: boolean; cleanup_complete: boolean} | null;
  outcome: NodeApplyOutcome | null; error: NodeError | null;
}
export const NODE_CONTRACT_REVISION: string;
export const NODE_TYPES: Readonly<Record<NodeType, {type: NodeType; title: string; palette_group: 'Импорт' | 'Трансформация' | 'Предобработка' | 'Исследование' | 'Экспорт'; tabular_inputs: number; tabular_outputs: number; additional_tabular_inputs: boolean; modes: readonly string[]}>>;
export function validateNodeReference(ref: unknown): void;
export function validateNodeTargetRequest(request: unknown): NodeTargetRequest;
export function describeNodeTypes(types: NodeType[], pins?: object, actions?: Map<string, object>, candidateHandlers?: Map<NodeType, {revision: string}>): object[];

export type JoinParameters = {keys: Array<{left: string; right: string}>;
  case_sensitive: boolean; include_joined_keys: boolean} | Record<string, never>;
export interface JoinConfigurationReadback {
  kind: 'join'; scope: 'observed_before_verified_finish'; node: NodeRef;
  receipt_ids: string[]; values_are: 'observed_ui_values'; package_persistence_verified: false;
  mode: 'inner' | 'left'; keys: Array<{left: string; right: string}>;
  case_sensitive: boolean; include_joined_keys: boolean;
  input_mappings: Array<{port: 0 | 1; autosync: boolean;
    fields: Array<{index: number; name: string; label: string; type: string; data_kind: string; source_name: string}>}>;
  output_mapping: GroupingConfigurationReadback['output_mapping'];
}

export interface DuplicatesParameters { input_fields: string[]; output_fields: string[] }
export interface DuplicatesConfigurationReadback {
  kind: 'duplicates'; scope: 'observed_before_verified_finish'; node: NodeRef;
  receipt_ids: string[]; values_are: 'observed_ui_values'; package_persistence_verified: false;
  fields: Array<{index: number; field_id: string; name: string; label: string; type: string; data_kind: string;
    usage_type: 0 | 3 | 4; input_field: {field_id: string; name: string; label: string; type: string; index: number; source_name: string; source_field_id: string}}>;
  input_mapping: {port: 0; fields: Array<{name: string; source_name: string}>};
  output_mapping: {port: 0; fields: Array<{name: string; label: string; type: string; source_name: string}>};
}

export interface MissingValuesParameters {
  fields: Array<{field:{kind:'input_field';name:string};method:'mean'} | {field:{kind:'input_field';name:string};method:'constant';value:string}>;
  max_nulls_percent:number; ordered:false;
}
export interface MissingValuesConfigurationReadback {
  kind:'missing_values';scope:'observed_before_verified_finish';node:NodeRef;
  receipt_ids:string[];values_are:'observed_ui_values';package_persistence_verified:false;
  mode:'impute';ordered:false;max_nulls_percent:number;
  fields:Array<{name:string;label:string;type:string;data_kind:string;used:boolean;method?:'mean'|'constant';value?:string}>;
  options:Record<string,{value:boolean|number|string;switch_pressed:boolean}>;
  input_mapping:SortingConfigurationReadback['input_mapping'];
  output_mapping:SortingConfigurationReadback['output_mapping'];
}

export interface CollapseParameters {
  information?: Array<{kind: 'input_field'; name: string}>;
  transposed?: Array<{kind: 'input_field'; name: string}>;
  ignore_empty?: boolean;
}
export interface CollapseConfigurationReadback {
  kind: 'collapse'; scope: 'observed_before_verified_finish'; node: NodeRef;
  receipt_ids: string[]; values_are: 'observed_ui_values'; package_persistence_verified: false; mode: 'unpivot';
  information: Array<{name: string; label: string; type: string; order: number}>;
  transposed: Array<{name: string; label: string; type: string; order: number}>;
  ignore_empty: boolean;
  input_mapping: GroupingConfigurationReadback['input_mapping'];
  output_mapping: GroupingConfigurationReadback['output_mapping'];
}
