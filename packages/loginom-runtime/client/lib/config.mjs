import { readFile, lstat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { normalizeConfigPath } from '../../examples/memory-plugin-shared/lib/mcp-proxy-config.mjs';
import { privatePath } from './platform.mjs';
import { ACTION_CATALOG_ROOT } from './action-catalog.mjs';
import { storageDirectories, storagePath } from './storage-policy.mjs';

const SHA256 = /^[a-f0-9]{64}$/;

export async function loadConfig({ configPath, stateDir, agent, adapterRevision, mode,
  actionManifestUri = null, actionManifestSha256 = null, replayBootstrap = false, replayLoginUser = null, replayLoginomUrl = null,
  acceptanceCleanupPackage = null }) {
  if (!configPath) throw new Error('An explicit Dock config path is required');
  if (!['codex', 'hermes'].includes(agent) || !adapterRevision?.trim()) {
    throw new Error('Explicit agent and adapter revision are required');
  }
  const path = normalizeConfigPath(configPath);
  const info = await lstat(path);
  if (!info.isFile() || !privatePath(info)) {
    throw new Error('Dock credentials must be a private regular file');
  }
  const data = JSON.parse(await readFile(path, 'utf8'));
  const sharedProfile = data.workflow_profile;
  const profile = sharedProfile ?? (agent === 'hermes' ? data.hermes_profile : null);
  if (profile && (profile.version !== 1 || profile.result_profile !== 'user-v1' || profile.mode !== 'executor-replay')) {
    throw new Error('Unsupported installed workflow profile');
  }
  const directories = sharedProfile ? storageDirectories(sharedProfile.storage_directories) : null;
  mode ??= profile?.mode ?? 'classic';
  if (mode === 'executor-replay' && profile) {
    actionManifestUri ??= profile.action_manifest_uri;
    actionManifestSha256 ??= profile.action_manifest_sha256;
    if (profile.passwordless_login === true && replayLoginUser === null && replayBootstrap === false) {
      replayBootstrap = true;
      replayLoginUser = profile.loginom_user;
    }
  }
  if (!['classic', 'executor-preview', 'executor-replay', 'research'].includes(mode)) {
    throw new Error('Dock mode must be classic, executor-preview, executor-replay or research');
  }
  if (mode === 'executor-replay') {
    const escaped = ACTION_CATALOG_ROOT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (typeof actionManifestUri !== 'string'
        || !new RegExp(`^${escaped}/releases/[0-9A-Za-z.+-]+/manifest\\.json$`).test(actionManifestUri)
        || !SHA256.test(actionManifestSha256 ?? '')) {
      throw new Error('executor-replay requires an exact Dock catalog manifest URI and SHA-256 pin');
    }
  } else if (actionManifestUri !== null || actionManifestSha256 !== null) {
    throw new Error('An explicit action manifest is only allowed in executor-replay');
  }
  if (replayBootstrap && mode !== 'executor-replay') throw new Error('Replay bootstrap is only allowed in executor-replay');
  if (replayBootstrap && (typeof replayLoginUser !== 'string' || !replayLoginUser.trim() || replayLoginUser.length>200 || /[\x00-\x1f\x7f]/.test(replayLoginUser))) throw new Error('Replay bootstrap requires an explicit Loginom account');
  if (!replayBootstrap && replayLoginUser !== null) throw new Error('Replay login account requires replay bootstrap');
  if (acceptanceCleanupPackage !== null && (mode !== 'executor-replay' || !replayBootstrap
      || typeof acceptanceCleanupPackage !== 'string' || acceptanceCleanupPackage.length > 1024
      || !/^\/(?:[^/\\\x00-\x1f]+\/)*[^/\\\x00-\x1f]+\.lgp$/.test(acceptanceCleanupPackage)
      || acceptanceCleanupPackage.split('/').some(p => p === '.' || p === '..'))) {
    throw new Error('Acceptance cleanup requires an explicit replay account and exact package path');
  }
  if (replayLoginomUrl !== null && mode !== 'executor-replay') throw new Error('Replay Loginom address is only allowed in executor-replay');
  const endpoint = new URL(data.endpoint);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password
      || endpoint.search || endpoint.hash || endpoint.pathname !== '/mcp') {
    throw new Error('Dock endpoint must be an HTTPS /mcp URL without credentials or query');
  }
  if (data.account !== 'loginom-dock' || data.user !== 'loginom-dock'
      || typeof data.api_key !== 'string' || !data.api_key.trim()) {
    throw new Error('The ordinary loginom-dock client identity and key are required');
  }
  let loginomUrl = null;
  if (replayLoginomUrl !== null || data.loginom_url) {
    const target = new URL(replayLoginomUrl ?? data.loginom_url);
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.hash
        || [...target.searchParams.keys()].some(key => /token|password|secret|auth|api.?key/i.test(key))) {
      throw new Error('The Loginom address must not contain credentials');
    }
    loginomUrl = target.href;
  }
  return Object.freeze({
    endpoint: endpoint.href, apiKey: data.api_key, loginomUrl,
    account: data.account, user: data.user, agent, adapterRevision, mode,
    actionManifestUri, actionManifestSha256, replayBootstrap, replayLoginUser, acceptanceCleanupPackage,
    resultProfile: profile?.result_profile ?? 'diagnostic',
    storageDirectories: directories,
    inputUploadDirectory: directories?.inputs ?? (profile?.input_upload_directory ? storagePath(profile.input_upload_directory) : null),
    stateDir: normalizeConfigPath(stateDir || join(homedir(), '.loginom-dock')),
  });
}
