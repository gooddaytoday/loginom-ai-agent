import { storageDirectories, storagePath } from './storage-policy.mjs';
import { ACTION_CATALOG_ROOT } from './action-catalog.mjs';

export function configureWorkflow(data, release, { platform = process.platform, storageRoot = null } = {}) {
  const target = release?.platforms?.[platform];
  if (release?.version !== 1 || !target || !/^[a-f0-9]{64}$/.test(target.manifest_sha256 ?? '')
      || typeof target.manifest_uri !== 'string' || !target.manifest_uri.startsWith(ACTION_CATALOG_ROOT+'/releases/')
      || !/\/releases\/[0-9A-Za-z.+-]+\/manifest\.json$/.test(target.manifest_uri)) throw Error('A published workflow catalog for this platform is required');
  const root = storageRoot === null ? null : storagePath(storageRoot);
  const directories = root ? {packages:root,inputs:root,exports:root} : data.workflow_profile?.storage_directories;
  return { ...data, workflow_profile: {
    version:1, mode:'executor-replay', result_profile:'user-v1',
    action_manifest_uri:target.manifest_uri, action_manifest_sha256:target.manifest_sha256,
    storage_directories:storageDirectories(directories),
  } };
}

// Credentials and unrelated settings can change after installation. Rollback
// swaps only the workflow profile installed by this transaction.
export function restoreWorkflow(data, expected, previous) {
  if (JSON.stringify(data.workflow_profile ?? null) !== JSON.stringify(expected ?? null)) throw Error('Workflow settings changed after installation');
  const result = {...data};
  if (previous === null || previous === undefined) delete result.workflow_profile;
  else result.workflow_profile = structuredClone(previous);
  return result;
}

export function workflowRegistration(prior, next) {
  const same = prior?.state === 'installed' && prior.release === next.release
    && prior.previousRelease && next.previousRelease?.replaceAll('\\', '/') === next.release
    && (prior.configName ?? 'config.json') === next.configName;
  if (!same) return next;
  return { ...prior, workflowChange: {
    previous: prior.workflowChange ? prior.workflowChange.previous : next.workflowChange.previous,
    installed: next.workflowChange.installed,
  } };
}
