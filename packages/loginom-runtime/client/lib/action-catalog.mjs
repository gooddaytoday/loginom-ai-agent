import { NODE_TYPES } from './node-contracts.mjs';
import { createHash } from 'node:crypto';
import { ACTION_KEYS, CAPABILITIES, requireCapability } from './capability-registry.mjs';

export const ACTION_CATALOG_ROOT = 'viking://resources/loginom-dock/catalogs/executor-preview';
export const CAPABILITY_ABI = 1;
export const EXECUTOR_REVISION = '1.3.0';

const SHA256 = /^[a-f0-9]{64}$/;
const OUTCOMES = new Set(['SUCCEEDED', 'NOT_APPLIED', 'FAILED', 'AMBIGUOUS']);
const FILE_NAMES = ['actions.json', 'selectors.json', 'source-index.json'];
export const ACCEPTANCE_CHECKS = ['node_add', 'link_create_standard', 'link_create_input_add',
  'package_save_as', 'reopen', 'negative', 'ambiguous', 'cleanup',
  'agent_partial_link_recovery', 'agent_ui_recovery', 'transport_receipt_recovery', 'node_configure_text_import'];

export const actionDescribeTool = {
  name: 'dock_action_describe',
  description: 'List the pinned available actions with {} or describe one exact action. Batch action_keys and node_types return selected pinned actions and graph-phase cards; planned configuration handlers are explicitly marked and are not callable node.apply. Supported local handlers include node.add, link.create, package.save_as, package.save_checkpoint and node.configure_text_import. Only actions present in this session catalog are callable. Does not change Loginom.',
  inputSchema: {
    type: 'object',
    properties: { action_key: { type: 'string', enum: [...ACTION_KEYS] },
      action_keys: { type: 'array', items: { type: 'string', enum: [...ACTION_KEYS] } },
      node_types: { type: 'array', items: { type: 'string', enum: Object.keys(NODE_TYPES) } } },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
};

export const actionRunTool = {
  name: 'dock_action_run',
  description: 'Run a pinned action (node.add, link.create, package.save_as, package.save_checkpoint or node.configure_text_import); call dock_action_describe first for its exact parameters. node.configure_text_import configures one already-open text-import wizard from a verified session upload, saves with Done and checks settings after reopening; it does not execute the node or save the package. package.save_checkpoint uses the awaited Save As flow with explicit conflict policy and preserves the open workflow; persisted content is checked separately during final reopen acceptance. Other UI tasks use dock_ui_action after observation. Invalid arguments are task feedback, not a connection failure.',
  inputSchema: {
    type: 'object',
    properties: {
      action_key: { type: 'string', enum: [...ACTION_KEYS] },
      parameters: { type: 'object' },
      operation_id: { type: 'string', minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9._:-]+$' },
    },
    required: ['action_key', 'parameters'], additionalProperties: false,
  },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
};

function fail(message) { throw new Error(`Invalid Dock action catalog: ${message}`); }
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const digest = text => createHash('sha256').update(text).digest('hex');

function exactKeys(value, allowed, where) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${where} contains unknown field ${key}`);
}

function nonEmpty(value, where) {
  if (typeof value !== 'string' || !value.trim()) fail(`${where} must be a non-empty string`);
}

function stringArray(value, where, { nonempty = true } = {}) {
  if (!Array.isArray(value) || (nonempty && value.length === 0)) fail(`${where} must be a non-empty string array`);
  for (const item of value) nonEmpty(item, where);
  if (new Set(value).size !== value.length) fail(`${where} contains duplicates`);
}

function validRevision(value, where) {
  nonEmpty(value, where);
  if (!/^\d+\.\d+\.\d+$/.test(value)) fail(`${where} must be numeric semver`);
}

function semverAtLeast(actual, minimum) {
  const a = actual.split('.').map(Number), b = minimum.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}

function validateEvidence(evidence, where, expectedCommit) {
  if (!Array.isArray(evidence) || evidence.length === 0) fail(`${where} must cite E2E evidence`);
  for (const [index, item] of evidence.entries()) {
    const itemWhere = `${where}[${index}]`;
    if (!isObject(item)) fail(`${itemWhere} must be an object`);
    exactKeys(item, new Set(['path', 'line_start', 'line_end', 'commit', 'sha256', 'role']), itemWhere);
    nonEmpty(item.path, `${itemWhere}.path`);
    nonEmpty(item.role, `${itemWhere}.role`);
    if (!Number.isInteger(item.line_start) || item.line_start < 1) fail(`${itemWhere}.line_start is invalid`);
    if (!Number.isInteger(item.line_end) || item.line_end < item.line_start) fail(`${itemWhere}.line_end is invalid`);
    if (item.commit !== expectedCommit) fail(`${itemWhere}.commit does not match the catalog E2E commit`);
    if (!SHA256.test(item.sha256)) fail(`${itemWhere}.sha256 is invalid`);
  }
}

function scanForbiddenDefinition(value, where = 'action') {
  if (Array.isArray(value)) return value.forEach((item, index) => scanForbiddenDefinition(item, `${where}[${index}]`));
  if (!isObject(value)) return;
  const forbidden = /^(javascript|js|eval|callback|css|xpath|script|code|steps|control_flow|recursion)$/i;
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.test(key)) fail(`${where} contains forbidden executable or raw-selector field ${key}`);
    scanForbiddenDefinition(child, `${where}.${key}`);
  }
}

export function validateJsonSchema(schema, where = 'schema') {
  if (!isObject(schema)) fail(`${where} must be an object schema`);
  const allowed = new Set(['type', 'properties', 'required', 'additionalProperties', 'enum', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'items', 'minItems', 'maxItems', 'description']);
  exactKeys(schema, allowed, where);
  if (!['object', 'array', 'string', 'integer', 'number', 'boolean'].includes(schema.type)) fail(`${where}.type is unsupported`);
  const keywords = { object: ['properties', 'required', 'additionalProperties'], array: ['items', 'minItems', 'maxItems'],
    string: ['minLength', 'maxLength', 'pattern'], integer: ['minimum', 'maximum'], number: ['minimum', 'maximum'], boolean: [] };
  exactKeys(schema, new Set(['type', 'enum', 'description', ...keywords[schema.type]]), where);
  if (schema.description !== undefined && typeof schema.description !== 'string') fail(`${where}.description must be a string`);
  if (schema.enum !== undefined) {
    if (!Array.isArray(schema.enum) || !schema.enum.length || ['object', 'array'].includes(schema.type)) fail(`${where}.enum is unsupported`);
    for (const item of schema.enum) {
      try { validateActionParameters({ type: schema.type }, item); } catch { fail(`${where}.enum member has the wrong type`); }
    }
    if (new Set(schema.enum).size !== schema.enum.length) fail(`${where}.enum contains duplicates`);
  }
  for (const key of ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems']) {
    if (schema[key] === undefined) continue;
    if (typeof schema[key] !== 'number' || !Number.isFinite(schema[key])
        || ((key.endsWith('Length') || key.endsWith('Items')) && (!Number.isSafeInteger(schema[key]) || schema[key] < 0))) fail(`${where}.${key} is invalid`);
  }
  if (schema.minimum > schema.maximum || schema.minLength > schema.maxLength || schema.minItems > schema.maxItems) fail(`${where} bounds are reversed`);
  if (schema.pattern !== undefined) {
    nonEmpty(schema.pattern, `${where}.pattern`);
    try { new RegExp(schema.pattern); } catch { fail(`${where}.pattern is invalid`); }
  }
  if (schema.type === 'object') {
    if (!isObject(schema.properties)) fail(`${where}.properties is required`);
    if (schema.additionalProperties !== false) fail(`${where} must reject additional properties`);
    const required = schema.required ?? [];
    stringArray(required, `${where}.required`, { nonempty: false });
    for (const key of required) if (!Object.hasOwn(schema.properties, key)) fail(`${where}.required names unknown property ${key}`);
    for (const [key, child] of Object.entries(schema.properties)) validateJsonSchema(child, `${where}.properties.${key}`);
  }
  if (schema.type === 'array') validateJsonSchema(schema.items, `${where}.items`);
}

function validateActions(catalog, manifest, allowedStatuses) {
  if (!isObject(catalog)) fail('actions.json must be an object');
  exactKeys(catalog, new Set(['schema_version', 'catalog_version', 'e2e_commit', 'capability_abi', 'actions']), 'actions.json');
  if (catalog.schema_version !== 1 || catalog.catalog_version !== manifest.catalog_version
      || catalog.e2e_commit !== manifest.e2e_commit || catalog.capability_abi !== CAPABILITY_ABI) {
    fail('actions.json identity does not match manifest');
  }
  if (!Array.isArray(catalog.actions) || catalog.actions.length === 0) fail('actions.json has no actions');
  const seen = new Set();
  for (const action of catalog.actions) {
    if (!isObject(action)) fail('action must be an object');
    exactKeys(action, new Set(['action_key', 'revision', 'status', 'capability', 'input_schema', 'output_schema',
      'selector_symbols', 'evidence', 'preconditions', 'postconditions', 'effect', 'idempotency', 'timeout_ms',
      'retry_budget', 'required_capabilities', 'min_executor_revision', 'cleanup']), `action ${action.action_key ?? '?'}`);
    nonEmpty(action.action_key, 'action.action_key');
    if (!ACTION_KEYS.includes(action.action_key)) fail(`unsupported MVP action ${action.action_key}`);
    if (seen.has(action.action_key)) fail(`duplicate action ${action.action_key}`);
    seen.add(action.action_key);
    nonEmpty(action.revision, `${action.action_key}.revision`);
    if (!allowedStatuses.has(action.status)) fail(`${action.action_key} has invalid lifecycle status ${action.status}`);
    try { requireCapability(action); } catch { fail(`${action.action_key} does not match a local capability handler and effect contract`); }
    stringArray(action.required_capabilities, `${action.action_key}.required_capabilities`);
    if (!action.required_capabilities.includes(action.capability)
        || action.required_capabilities.some(item => !CAPABILITIES.includes(item))) fail(`${action.action_key} capability set is invalid`);
    validRevision(action.min_executor_revision, `${action.action_key}.min_executor_revision`);
    if (!semverAtLeast(EXECUTOR_REVISION, action.min_executor_revision)) fail(`${action.action_key} requires a newer executor`);
    if (!Number.isInteger(action.timeout_ms) || action.timeout_ms < 1000 || action.timeout_ms > 300000) fail(`${action.action_key}.timeout_ms is invalid`);
    if (!Number.isInteger(action.retry_budget) || action.retry_budget < 0 || action.retry_budget > 10) fail(`${action.action_key}.retry_budget is invalid`);
    stringArray(action.selector_symbols, `${action.action_key}.selector_symbols`);
    for (const field of ['preconditions', 'postconditions', 'cleanup']) stringArray(action[field], `${action.action_key}.${field}`);
    if (!isObject(action.idempotency) || action.idempotency.policy !== 'reconcile_before_retry') fail(`${action.action_key}.idempotency is invalid`);
    validateJsonSchema(action.input_schema, `${action.action_key}.input_schema`);
    validateJsonSchema(action.output_schema, `${action.action_key}.output_schema`);
    validateEvidence(action.evidence, `${action.action_key}.evidence`, manifest.e2e_commit);
    scanForbiddenDefinition(action, action.action_key);
  }
  return new Map(catalog.actions.map(action => [action.action_key, action]));
}

function validateSelectors(catalog, manifest) {
  if (!isObject(catalog)) fail('selectors.json must be an object');
  exactKeys(catalog, new Set(['schema_version', 'catalog_version', 'e2e_commit', 'selectors']), 'selectors.json');
  if (catalog.schema_version !== 1 || catalog.catalog_version !== manifest.catalog_version || catalog.e2e_commit !== manifest.e2e_commit) {
    fail('selectors.json identity does not match manifest');
  }
  if (!Array.isArray(catalog.selectors) || catalog.selectors.length === 0) fail('selectors.json has no selectors');
  const selectors = new Map();
  const placeholders = text => [...text.matchAll(/\{([a-z][a-z0-9_]*)\}/g)].map(match => match[1]);
  for (const selector of catalog.selectors) {
    if (!isObject(selector)) fail('selector must be an object');
    exactKeys(selector, new Set(['symbol', 'strategy', 'match', 'value', 'scope', 'cardinality', 'visibility',
      'state', 'parameters', 'required_class', 'provenance']), `selector ${selector.symbol ?? '?'}`);
    nonEmpty(selector.symbol, 'selector.symbol');
    if (selectors.has(selector.symbol)) fail(`duplicate selector ${selector.symbol}`);
    if (selector.strategy !== 'data_tid' || !['exact', 'prefix', 'suffix'].includes(selector.match)) fail(`${selector.symbol} strategy is invalid`);
    nonEmpty(selector.value, `${selector.symbol}.value`);
    if (!['global', 'activeTab', 'activeWorkflow', 'modal'].includes(selector.scope)) fail(`${selector.symbol}.scope is invalid`);
    if (!['one', 'zeroOrOne', 'many'].includes(selector.cardinality)) fail(`${selector.symbol}.cardinality is invalid`);
    if (!['visible', 'hidden', 'any'].includes(selector.visibility)) fail(`${selector.symbol}.visibility is invalid`);
    stringArray(selector.state, `${selector.symbol}.state`, { nonempty: false });
    if (selector.state.some(state => !['enabled', 'masked'].includes(state))) fail(`${selector.symbol}.state contains an unknown probe`);
    const parameterNames = Object.keys(selector.parameters ?? {});
    if (!isObject(selector.parameters)) fail(`${selector.symbol}.parameters must be an object`);
    for (const [name, encoder] of Object.entries(selector.parameters)) {
      if (!/^[a-z][a-z0-9_]*$/.test(name) || !['loginom_tid', 'integer'].includes(encoder)) fail(`${selector.symbol}.parameters is invalid`);
    }
    const used = placeholders(selector.value);
    if (new Set(used).size !== used.length || used.some(name => !parameterNames.includes(name))
        || parameterNames.some(name => !used.includes(name))) fail(`${selector.symbol} template parameters do not match`);
    if (selector.required_class !== undefined) {
      nonEmpty(selector.required_class, `${selector.symbol}.required_class`);
      if (!/^[A-Za-z0-9_-]+$/.test(selector.required_class)) fail(`${selector.symbol}.required_class is unsafe`);
    }
    validateEvidence([selector.provenance], `${selector.symbol}.provenance`, manifest.e2e_commit);
    selectors.set(selector.symbol, selector);
  }
  return selectors;
}

function validateSourceIndex(index, manifest, actions, selectors) {
  if (!isObject(index)) fail('source-index.json must be an object');
  exactKeys(index, new Set(['schema_version', 'catalog_version', 'e2e_commit', 'source_files', 'dependencies']), 'source-index.json');
  if (index.schema_version !== 1 || index.catalog_version !== manifest.catalog_version || index.e2e_commit !== manifest.e2e_commit) {
    fail('source-index.json identity does not match manifest');
  }
  if (!isObject(index.source_files) || !isObject(index.dependencies)) fail('source-index.json dependencies are invalid');
  for (const [path, sha256] of Object.entries(index.source_files)) {
    nonEmpty(path, 'source-index.json source path');
    if (!SHA256.test(sha256)) fail(`source-index.json digest for ${path} is invalid`);
  }
  for (const [key, dependency] of Object.entries(index.dependencies)) {
    if (!actions.has(key) || !isObject(dependency)) fail(`dependency for ${key} is invalid`);
    exactKeys(dependency, new Set(['selectors', 'files']), `dependency ${key}`);
    stringArray(dependency.selectors, `dependency ${key}.selectors`);
    stringArray(dependency.files, `dependency ${key}.files`);
    if (dependency.selectors.some(symbol => !selectors.has(symbol))) fail(`dependency ${key} names an unknown selector`);
    if (dependency.files.some(path => !index.source_files[path])) fail(`dependency ${key} names an unknown source file`);
  }
  for (const key of actions.keys()) if (!index.dependencies[key]) fail(`dependency for ${key} is missing`);
  const checkEvidence = (item, where) => {
    if (index.source_files[item.path] !== item.sha256) fail(`${where} evidence digest differs from source index`);
  };
  for (const selector of selectors.values()) checkEvidence(selector.provenance, selector.symbol);
  for (const [key, action] of actions) {
    const dependency = index.dependencies[key];
    if (dependency.selectors.slice().sort().join('\0') !== action.selector_symbols.slice().sort().join('\0')) {
      fail(`dependency ${key} must contain exactly the action selector symbols`);
    }
    const evidence = [...action.evidence, ...action.selector_symbols.map(symbol => selectors.get(symbol).provenance)];
    for (const item of evidence) {
      checkEvidence(item, key);
      if (!dependency.files.includes(item.path)) fail(`dependency ${key} omits evidence source ${item.path}`);
    }
  }
}

export function validateCompatibility(value, { requireBuild = false } = {}) {
  if (!isObject(value)) fail('compatibility profile is required');
  exactKeys(value, new Set(['profile_id', 'loginom_build', 'platform', 'browser']), 'compatibility');
  nonEmpty(value.profile_id, 'compatibility.profile_id');
  if (!['macos', 'linux', 'windows'].includes(value.platform) || value.browser !== 'chromium') fail('unsupported compatibility platform/browser');
  if (value.loginom_build !== null || requireBuild) nonEmpty(value.loginom_build, 'compatibility.loginom_build');
  return value;
}

export function validateReplayAcceptance(acceptance, { manifest, manifestSha256, runtimeIdentity = null } = {}) {
  if (!isObject(acceptance)) fail('replay acceptance must be an object');
  exactKeys(acceptance, new Set(['schema_version', 'status', 'manifest_sha256', 'runtime', 'target', 'agent',
    'checks', 'evidence_uri', 'evidence_sha256', 'recorded_at']), 'acceptance');
  if (acceptance.schema_version !== 1 || acceptance.status !== 'PASSED') fail('replay acceptance has not passed');
  if (!SHA256.test(manifestSha256 ?? '') || acceptance.manifest_sha256 !== manifestSha256) fail('replay acceptance manifest digest mismatch');
  const profile = validateCompatibility(manifest.compatibility, { requireBuild: true });
  validateCompatibility(acceptance.target, { requireBuild: true });
  for (const key of Object.keys(profile)) if (acceptance.target[key] !== profile[key]) fail(`replay acceptance target ${key} mismatch`);
  const runtime = acceptance.runtime;
  if (!isObject(runtime)) fail('replay acceptance runtime is required');
  exactKeys(runtime, new Set(['clientRevision', 'playwright', 'chromiumRevision', 'executorRevision', 'capabilityAbi']), 'acceptance.runtime');
  if (!SHA256.test(runtime.clientRevision ?? '')) fail('replay acceptance client runtime digest is invalid');
  for (const key of ['playwright', 'chromiumRevision']) nonEmpty(runtime[key], `acceptance.runtime.${key}`);
  if (runtime.executorRevision !== EXECUTOR_REVISION || runtime.capabilityAbi !== CAPABILITY_ABI) fail('replay acceptance executor identity mismatch');
  if (runtimeIdentity) for (const key of ['clientRevision', 'playwright', 'chromiumRevision']) {
    if (runtimeIdentity[key] !== runtime[key]) fail(`replay acceptance does not cover this runtime ${key}`);
  }
  if (!isObject(acceptance.agent)) fail('replay acceptance agent identity is required');
  exactKeys(acceptance.agent, new Set(['name', 'provider', 'model', 'reasoning_effort']), 'acceptance.agent');
  if (acceptance.agent.name !== 'hermes' || acceptance.agent.provider !== 'openai-codex' || acceptance.agent.model !== 'gpt-5.6-sol'
      || acceptance.agent.reasoning_effort !== 'low') {
    fail('Acceptance requires Hermes with ChatGPT subscription, GPT-5.6 Sol and low reasoning');
  }
  if (!isObject(acceptance.checks)) fail('replay acceptance checks are required');
  exactKeys(acceptance.checks, new Set(ACCEPTANCE_CHECKS), 'acceptance.checks');
  for (const check of ACCEPTANCE_CHECKS) if (acceptance.checks[check] !== true) fail(`replay acceptance is missing passed check ${check}`);
  nonEmpty(acceptance.evidence_uri, 'acceptance.evidence_uri');
  if (!SHA256.test(acceptance.evidence_sha256 ?? '')) fail('replay acceptance evidence digest is invalid');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(acceptance.recorded_at ?? '')) fail('replay acceptance timestamp is invalid');
  return acceptance;
}

export function assertCatalogTarget(pinned, targetIdentity) {
  const expected = validateCompatibility(pinned.manifest.compatibility);
  validateCompatibility(targetIdentity, { requireBuild: true });
  for (const key of ['profile_id', 'platform', 'browser']) if (targetIdentity[key] !== expected[key]) fail(`Loginom target ${key} mismatch`);
  if (expected.loginom_build !== null && targetIdentity.loginom_build !== expected.loginom_build) fail('Loginom target build mismatch');
  return targetIdentity;
}

function validateManifest(manifest, root, allowedStatuses) {
  if (!isObject(manifest)) fail('manifest must be an object');
  exactKeys(manifest, new Set(['schema_version', 'catalog_version', 'status', 'capability_abi', 'min_executor_revision',
    'e2e_commit', 'created_at', 'files', 'compatibility']), 'manifest');
  if (manifest.schema_version !== 1 || !allowedStatuses.has(manifest.status)) fail('manifest lifecycle status is not allowed');
  nonEmpty(manifest.catalog_version, 'manifest.catalog_version');
  if (!/^[0-9A-Za-z.+-]+$/.test(manifest.catalog_version)) fail('manifest catalog version is unsafe');
  if (manifest.capability_abi !== CAPABILITY_ABI) fail('capability ABI is incompatible');
  validRevision(manifest.min_executor_revision, 'manifest.min_executor_revision');
  if (!semverAtLeast(EXECUTOR_REVISION, manifest.min_executor_revision)) fail('catalog requires a newer executor');
  if (!/^[a-f0-9]{40}$/.test(manifest.e2e_commit)) fail('manifest E2E commit is invalid');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(manifest.created_at)) fail('manifest created_at is not deterministic UTC');
  if (!isObject(manifest.files) || Object.keys(manifest.files).sort().join(',') !== FILE_NAMES.slice().sort().join(',')) fail('manifest file set is invalid');
  for (const name of FILE_NAMES) if (!SHA256.test(manifest.files[name])) fail(`manifest digest for ${name} is invalid`);
  validateCompatibility(manifest.compatibility);
  return `${root}/releases/${manifest.catalog_version}`;
}

async function readRemoteText(remote, uri, signal) {
  const result = await remote.callTool({ name: 'read', arguments: { uris: [uri] } }, undefined, { signal, timeout: 60000 });
  if (result?.isError) throw new Error(`Dock catalog read failed for ${uri}`);
  const blocks = (result?.content ?? []).filter(block => block.type === 'text').map(block => block.text);
  if (blocks.length !== 1 || !blocks[0].trim()) throw new Error(`Dock catalog read returned no exact text for ${uri}`);
  return blocks[0].replace(/^=== .* ===\r?\n/, '');
}

function parseJson(text, where) {
  try { return JSON.parse(text); } catch { fail(`${where} is not valid JSON`); }
}

export async function pinActionCatalog(remote, {
  root = ACTION_CATALOG_ROOT, signal, manifestUri = null, manifestSha256 = null, allowCandidate = false,
  runtimeIdentity = null, targetIdentity = null,
} = {}) {
  let current;
  if (manifestUri !== null || manifestSha256 !== null) {
    if (!allowCandidate || typeof manifestUri !== 'string' || !SHA256.test(manifestSha256 ?? '')) {
      fail('an exact candidate manifest requires replay mode and a SHA-256 pin');
    }
    const match = new RegExp(`^${root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/releases/([0-9A-Za-z.+-]+)/manifest\\.json$`).exec(manifestUri);
    if (!match) fail('candidate manifest URI is outside the executor catalog root');
    current = { schema_version: 1, status: 'candidate', catalog_version: match[1],
      manifest_uri: manifestUri, manifest_sha256: manifestSha256 };
  } else {
    const currentText = await readRemoteText(remote, `${root}/current.json`, signal);
    current = parseJson(currentText, 'current.json');
    if (!isObject(current)) fail('current.json must be an object');
    exactKeys(current, new Set(['schema_version', 'status', 'catalog_version', 'manifest_uri', 'manifest_sha256',
      'acceptance_uri', 'acceptance_sha256']), 'current.json');
    if (current.schema_version !== 1 || current.status !== 'production') fail('current.json does not select a production catalog');
    if (typeof current.catalog_version !== 'string' || !/^[0-9A-Za-z.+-]+$/.test(current.catalog_version)) fail('current.json catalog version is unsafe');
    const expectedManifestUri = `${root}/releases/${current.catalog_version}/manifest.json`;
    if (current.manifest_uri !== expectedManifestUri || !SHA256.test(current.manifest_sha256)) fail('current.json manifest reference is invalid');
    if (!runtimeIdentity) fail('production admission requires the current client runtime identity');
    if (!SHA256.test(current.acceptance_sha256 ?? '') || current.acceptance_uri !== `${root}/releases/${current.catalog_version}/acceptance/${current.acceptance_sha256}.json`) {
      fail('current.json replay acceptance reference is invalid');
    }
  }
  const manifestText = await readRemoteText(remote, current.manifest_uri, signal);
  if (digest(manifestText) !== current.manifest_sha256) fail('manifest digest mismatch');
  const manifest = parseJson(manifestText, 'manifest.json');
  // Admission changes only the pointer and adds acceptance. Tested release bytes
  // remain immutable candidates even after they are admitted to production.
  const releaseRoot = validateManifest(manifest, root, new Set(['candidate']));
  const actionStatuses = current.status === 'candidate' ? new Set(['candidate', 'stale']) : new Set(['candidate']);
  if (releaseRoot + '/manifest.json' !== current.manifest_uri || manifest.catalog_version !== current.catalog_version) fail('manifest identity does not match current.json');
  const texts = Object.fromEntries(await Promise.all(FILE_NAMES.map(async name => {
    const text = await readRemoteText(remote, `${releaseRoot}/${name}`, signal);
    if (digest(text) !== manifest.files[name]) fail(`${name} digest mismatch`);
    return [name, text];
  })));
  const actionsJson = parseJson(texts['actions.json'], 'actions.json');
  const selectorsJson = parseJson(texts['selectors.json'], 'selectors.json');
  const sourceIndex = parseJson(texts['source-index.json'], 'source-index.json');
  const actions = validateActions(actionsJson, manifest, actionStatuses);
  if (current.status === 'production' && actions.size !== ACTION_KEYS.length) fail('production admission requires all three MVP actions');
  const selectors = validateSelectors(selectorsJson, manifest);
  for (const action of actions.values()) {
    if (action.selector_symbols.some(symbol => !selectors.has(symbol))) fail(`${action.action_key} names an unknown selector`);
  }
  validateSourceIndex(sourceIndex, manifest, actions, selectors);
  let acceptance = null;
  if (current.status === 'production') {
    const acceptanceText = await readRemoteText(remote, current.acceptance_uri, signal);
    if (digest(acceptanceText) !== current.acceptance_sha256) fail('replay acceptance digest mismatch');
    acceptance = validateReplayAcceptance(parseJson(acceptanceText, 'acceptance'), {
      manifest, manifestSha256: current.manifest_sha256, runtimeIdentity,
    });
  }
  const pinned = { current, manifest, compatibility: manifest.compatibility, actionsJson, selectorsJson, sourceIndex, actions, selectors,
    acceptance, acceptanceVerified: acceptance !== null,
    pins: {
      capabilityAbi: CAPABILITY_ABI, executorRevision: EXECUTOR_REVISION,
      actionCatalogVersion: manifest.catalog_version, actionCatalogDigest: manifest.files['actions.json'],
      selectorCatalogDigest: manifest.files['selectors.json'], e2eCommit: manifest.e2e_commit,
      actionManifestDigest: current.manifest_sha256, catalogLifecycleStatus: acceptance ? 'production' : 'candidate',
      acceptanceVerified: acceptance !== null, acceptanceDigest: current.acceptance_sha256 ?? null,
      compatibilityProfile: manifest.compatibility,
    } };
  if (targetIdentity) assertCatalogTarget(pinned, targetIdentity);
  return deepFreeze(pinned);
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  if (value instanceof Map) for (const item of value.values()) deepFreeze(item, seen);
  else for (const item of Object.values(value)) deepFreeze(item, seen);
  return Object.freeze(value);
}

export function validateActionParameters(schema, value, where = 'parameters') {
  const error = message => { throw new Error(`Invalid ${where}: ${message}`); };
  if (schema.enum && !schema.enum.some(item => Object.is(item, value))) {
    const allowed=JSON.stringify(schema.enum);
    error('value is not in the allowed enum'+(schema.enum.length<=20&&allowed.length<=1000?'; allowed: '+allowed:''));
  }
  if (schema.type === 'object') {
    if (!isObject(value)) error('expected object');
    for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) error(`missing ${key}`);
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(schema.properties ?? {}, key)) {
        // Only explicitly open envelopes defer validation to the selected node
        // contract. Catalog schemas remain closed by default.
        if (schema.additionalProperties === true) continue;
        error(`unknown field ${key}`);
      }
      validateActionParameters(schema.properties[key], value[key], `${where}.${key}`);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) error('expected array');
    if (schema.minItems !== undefined && value.length < schema.minItems) error('array is too short');
    if (schema.maxItems !== undefined && value.length > schema.maxItems) error('array is too long');
    value.forEach((item, index) => validateActionParameters(schema.items, item, `${where}[${index}]`));
  } else if (schema.type === 'integer') {
    if (!Number.isInteger(value)) error('expected integer');
  } else if (schema.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) error('expected finite number');
  } else if (schema.type === 'string') {
    if (typeof value !== 'string') error('expected string');
  } else if (schema.type === 'boolean' && typeof value !== 'boolean') error('expected boolean');
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) error(`must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) error(`must be <= ${schema.maximum}`);
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) error('string is too short');
    if (schema.maxLength !== undefined && value.length > schema.maxLength) error('string is too long');
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) error('string does not match the required pattern');
  }
  return value;
}

export function assertActionOutcome(value) {
  if (!isObject(value) || !OUTCOMES.has(value.status) || !Array.isArray(value.trace)
      || typeof value.action_key !== 'string' || !value.action_key
      || typeof value.action_revision !== 'string' || !value.action_revision
      || typeof value.phase !== 'string' || !value.phase
      || typeof value.effect_possible !== 'boolean' || !isObject(value.output)
      || (value.error !== null && (!isObject(value.error) || typeof value.error.code !== 'string'
        || typeof value.error.message !== 'string'))
      || (value.status === 'SUCCEEDED' && value.error !== null)
      || value.goal_verified === true || value.output.goal_verified === true) {
    throw new Error('Dock capability returned an invalid typed outcome');
  }
  return value;
}
