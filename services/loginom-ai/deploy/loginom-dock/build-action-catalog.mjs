#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ACTION_CATALOG_ROOT, pinActionCatalog, validateCompatibility } from '../../../../packages/loginom-runtime/client/lib/action-catalog.mjs';

import { validateEffect } from '../../../../packages/loginom-runtime/client/lib/effect-contracts.mjs';

export function configurePackageRoots(catalog, roots) {
  if(roots===undefined)return catalog;
  const result=structuredClone(catalog),matches=result.actions.filter(action=>action.action_key==='package.save_as');
  if(matches.length!==1 || matches[0].effect?.kind!=='save' || matches[0].effect?.resource!=='package')throw new Error('Exactly one package.save_as save contract is required');
  const checkpoints=result.actions.filter(action=>action.action_key==='package.save_checkpoint');
  if(checkpoints.length>1 || checkpoints.some(action=>action.effect?.kind!=='persist'||action.effect?.resource!=='package'))
    throw new Error('Invalid package.save_checkpoint persistence contract');
  for(const action of [...matches,...checkpoints]) {
    const effect={...action.effect,allowed_roots:[...roots]};validateEffect(effect);
    if(JSON.stringify(effect.allowed_roots)!==JSON.stringify(action.effect.allowed_roots)) {
      if(typeof action.revision!=='string' || !/^[1-9]\d*$/.test(action.revision) || !Number.isSafeInteger(Number(action.revision)+1))throw new Error('Save revision cannot be incremented');
      action.revision=String(Number(action.revision)+1);action.effect=effect;
    }
  }
  return result;
}

export function configureSessionStorage(catalog) {
  const result = structuredClone(catalog);
  for (const key of ['package.save_as', 'package.save_checkpoint']) {
    const actions = result.actions.filter(a => a.action_key === key);
    if (actions.length !== 1) throw Error('Both package persistence contracts are required');
    const action = actions[0];
    if (action.effect.destination_policy === 'session_storage') continue;
    const { allowed_roots, ...effect } = action.effect;
    effect.destination_policy = 'session_storage'; validateEffect(effect);
    if (!/^[1-9]\d*$/.test(action.revision) || !Number.isSafeInteger(Number(action.revision)+1)) throw Error('Invalid persistence revision');
    action.effect = effect; action.revision = String(Number(action.revision)+1);
    action.min_executor_revision = '1.3.0';
    action.input_schema.properties.path = { type:'string', minLength:2, maxLength:1024,
      pattern:'^/[^\\\\\\x00-\\x1f\\x7f]+$' };
  }
  return result;
}

const sha256 = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value, null, 2) + '\n';
const parse = async path => JSON.parse(await readFile(path, 'utf8'));

export function minimumExecutorRevision(actions) {
  if (!Array.isArray(actions) || !actions.length) throw new Error('Action catalog must contain actions');
  let maximum;
  let maximumParts;
  for (const action of actions) {
    const revision = action?.min_executor_revision;
    if (typeof revision !== 'string' || !/^\d+\.\d+\.\d+$/.test(revision)) {
      throw new Error(`${action?.action_key ?? 'Action'}.min_executor_revision must be numeric semver`);
    }
    const parts = revision.split('.').map(Number);
    if (!parts.every(Number.isSafeInteger)) {
      throw new Error(`${action.action_key ?? 'Action'}.min_executor_revision components must be safe integers`);
    }
    const firstDifference = maximumParts ? parts.findIndex((part, index) => part !== maximumParts[index]) : -1;
    if (!maximumParts || (firstDifference >= 0 && parts[firstDifference] > maximumParts[firstDifference])) {
      maximum = revision;
      maximumParts = parts;
    }
  }
  return maximum;
}

export function updateForE2E(actions, selectors, index, sourceManifest) {
  if (!sourceManifest) return { actions, selectors, index,
    staleActions: actions.actions.filter(action => action.status === 'stale').map(action => action.action_key) };
  if (!/^[a-f0-9]{40}$/.test(sourceManifest.commit) || !Array.isArray(sourceManifest.files)) {
    throw new Error('E2E source manifest is invalid');
  }
  const sourceFiles = new Map(sourceManifest.files.map(file => [file.path, file.sha256]));
  const changed = new Set(Object.entries(index.source_files)
    .filter(([path, digest]) => sourceFiles.get(path) !== digest).map(([path]) => path));
  const staleActions = Object.entries(index.dependencies)
    .filter(([, dependency]) => dependency.files.some(path => changed.has(path))).map(([key]) => key);
  const version = sourceManifest.commit === index.e2e_commit
    ? index.catalog_version : `${index.catalog_version}+e2e.${sourceManifest.commit.slice(0, 12)}`;
  const rewriteEvidence = item => ({ ...item, commit: sourceManifest.commit,
    sha256: sourceFiles.get(item.path) ?? item.sha256 });
  actions = structuredClone(actions);
  selectors = structuredClone(selectors);
  index = structuredClone(index);
  actions.catalog_version = selectors.catalog_version = index.catalog_version = version;
  actions.e2e_commit = selectors.e2e_commit = index.e2e_commit = sourceManifest.commit;
  for (const action of actions.actions) {
    // Rebuilding unchanged input is never evidence that an earlier stale action
    // was reviewed. Only reauthoring and the separate replay admission can do so.
    if (staleActions.includes(action.action_key)) action.status = 'stale';
    action.evidence = action.evidence.map(rewriteEvidence);
  }
  for (const selector of selectors.selectors) selector.provenance = rewriteEvidence(selector.provenance);
  for (const path of Object.keys(index.source_files)) index.source_files[path] = sourceFiles.get(path) ?? index.source_files[path];
  return { actions, selectors, index,
    staleActions: actions.actions.filter(action => action.status === 'stale').map(action => action.action_key) };
}

async function main() {
  const { values } = parseArgs({ options: {
    input: { type: 'string' }, out: { type: 'string' }, 'e2e-manifest': { type: 'string' },
    candidate: { type: 'boolean', default: false },
    'package-root': {type:'string',multiple:true},
    'session-storage': {type:'boolean',default:false},
    version: { type: 'string' }, 'loginom-build': { type: 'string' }, compatibility: { type: 'string' },
  } });
  if (!values.out) throw new Error('--out is required');
  const scriptDirectory = fileURLToPath(new URL('.', import.meta.url));
  const input = resolve(values.input ?? join(scriptDirectory, '../../../../packages/loginom-runtime/executor/catalog'));
  const out = resolve(values.out);
  await mkdir(out, { recursive: true, mode: 0o700 });
  if ((await readdir(out)).length) throw new Error('Output directory must be empty');
  let actions = await parse(join(input, 'actions.json'));
  if(values['session-storage']) {
    if(values['package-root'] || !values.version || values.version.replace(/-candidate$/,'')===actions.catalog_version.replace(/-candidate$/,''))
      throw Error('--session-storage requires a new catalog version and excludes --package-root');
    actions=configureSessionStorage(actions);
  }
  if(values['package-root']) {
    if(!values.version || values.version.replace(/-candidate$/,'')===actions.catalog_version.replace(/-candidate$/,''))throw new Error('--package-root requires an explicit new --version');
    actions=configurePackageRoots(actions,values['package-root']);
  }
  let selectors = await parse(join(input, 'selectors.json'));
  let index = await parse(join(input, 'source-index.json'));
  const compatibility = await parse(resolve(values.compatibility ?? join(scriptDirectory, '../../../../packages/loginom-runtime/executor/catalog/compatibility.json')));
  if (values['loginom-build'] !== undefined) compatibility.loginom_build = values['loginom-build'];
  validateCompatibility(compatibility);
  const sourceManifest = values['e2e-manifest'] ? await parse(resolve(values['e2e-manifest'])) : null;
  const updated = updateForE2E(actions, selectors, index, sourceManifest);
  ({ actions, selectors, index } = updated);
  actions = structuredClone(actions); selectors = structuredClone(selectors); index = structuredClone(index);
  const requestedVersion = values.version ?? actions.catalog_version;
  if (!/^[0-9A-Za-z.+-]+$/.test(requestedVersion)) throw new Error('Catalog version contains unsafe characters');
  const version = requestedVersion.endsWith('-candidate') ? requestedVersion : `${requestedVersion}-candidate`;
  actions.catalog_version = selectors.catalog_version = index.catalog_version = version;
  for (const action of actions.actions) if (action.status === 'production') action.status = 'candidate';
  if (actions.catalog_version !== selectors.catalog_version || actions.catalog_version !== index.catalog_version
      || actions.e2e_commit !== selectors.e2e_commit || actions.e2e_commit !== index.e2e_commit) {
    throw new Error('Catalog source identities do not match');
  }
  const documents = {
    'actions.json': canonical(actions), 'selectors.json': canonical(selectors), 'source-index.json': canonical(index),
  };
  const date = /^(\d{4})[.-](\d{2})[.-](\d{2})/.exec(actions.catalog_version);
  if (!date) throw new Error('Catalog version must start with a date');
  const manifest = {
    schema_version: 1,
    catalog_version: actions.catalog_version,
    status: 'candidate',
    capability_abi: actions.capability_abi,
    min_executor_revision: minimumExecutorRevision(actions.actions),
    e2e_commit: actions.e2e_commit,
    compatibility,
    created_at: `${date[1]}-${date[2]}-${date[3]}T00:00:00Z`,
    files: Object.fromEntries(Object.entries(documents).map(([name, text]) => [name, sha256(text)])),
  };
  const manifestText = canonical(manifest);
  const current = {
    schema_version: 1, status: manifest.status, catalog_version: manifest.catalog_version,
    manifest_uri: `${ACTION_CATALOG_ROOT}/releases/${manifest.catalog_version}/manifest.json`,
    manifest_sha256: sha256(manifestText),
  };
  for (const [name, text] of Object.entries({ ...documents, 'manifest.json': manifestText, 'current.json': canonical(current) })) {
    await writeFile(join(out, name), text, { mode: 0o600, flag: 'wx' });
  }
  const releaseRoot = `${ACTION_CATALOG_ROOT}/releases/${manifest.catalog_version}`;
  const files = new Map([[`${releaseRoot}/manifest.json`, manifestText],
    ...Object.entries(documents).map(([name, text]) => [`${releaseRoot}/${name}`, text])]);
  const remote = { callTool: async ({ arguments: args }) => ({ content: [{ type: 'text', text: files.get(args.uris[0]) }] }) };
  await pinActionCatalog(remote, { manifestUri: `${releaseRoot}/manifest.json`,
    manifestSha256: current.manifest_sha256, allowCandidate: true });
  process.stdout.write(canonical({ catalog_version: manifest.catalog_version, status: manifest.status,
    manifest_sha256: current.manifest_sha256, stale_actions: updated.staleActions, output: out }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(String(error.message) + '\n'); process.exitCode = 1; });
}
