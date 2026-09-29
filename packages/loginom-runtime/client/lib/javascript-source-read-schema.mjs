const id = {type: 'string', minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9_.:-]+$'};
const hash = {type: 'string', pattern: '^[a-f0-9]{64}$'};
const object = (properties, required = Object.keys(properties)) =>
  ({type: 'object', properties, required, additionalProperties: false});
const workflow = object({workflow_id: id, tab_tid: {type: 'string'}, prefix: {type: 'string'},
  navigation_path: {type: 'array', minItems: 1, maxItems: 32,
    items: object({tid: {type: 'string'}, label: {type: 'string'}})}});
const node = object({document_id: id, workflow_id: id, node_id: id});

export const javascriptSourceInitialSchema = object({kind: {const: 'source'}, operation_id: id,
  document_id: id, workflow_ref: workflow, node, budget_ms: {type: 'integer', minimum: 1, maximum: 1800000}},
  ['kind', 'operation_id', 'document_id', 'workflow_ref', 'node']);
export const javascriptSourceContinuationSchema = object({kind: {const: 'source'}, operation_id: id,
  cursor: {type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'},
  expected_source_sha256: hash});
export const javascriptSourceReceiptSchema = object({kind: {const: 'source'},
  owner: object({document_id: id, workflow_id: id, node_id: id, operation_id: id,
    ui_epoch: {type: 'integer', minimum: 0}}), source_sha256: hash,
  source_utf8_bytes: {type: 'integer', minimum: 0, maximum: 32768},
  source_lf_lines: {type: 'integer', minimum: 1, maximum: 1024},
  source_text: {type: 'string'}, offset_utf8_bytes: {type: 'integer', minimum: 0, maximum: 32768},
  chunk_utf8_bytes: {type: 'integer', minimum: 0, maximum: 4096},
  cursor: {type: ['string', 'null']}});
