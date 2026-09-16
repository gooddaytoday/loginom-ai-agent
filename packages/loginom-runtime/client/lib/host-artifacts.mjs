import { open, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { admitStartupArtifacts } from './artifacts.mjs';
import { privatePath } from './platform.mjs';

export function codexInputIdentity(params) {
  const metadata = params?._meta?.['x-codex-turn-metadata'];
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const identity = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\x00-\x1f\x7f]/.test(value);
  if (!identity(metadata.thread_id) || !identity(metadata.turn_id)) return null;
  return { session_id: metadata.thread_id, turn_id: metadata.turn_id };
}

// The model can carry only an opaque ticket. Paths and digests originate in the
// native host's user-input hook, never in MCP arguments chosen by the model.
export function createHostArtifactAdmission(config, session) {
  const admitted = new Map();
  const pending = new Map();
  const admit = async (token, nativeIdentity) => {
    if (token === undefined) return [];
    if (!['codex','hermes'].includes(config.agent) || config.resultProfile !== 'user-v1' || !/^[a-f0-9]{64}$/.test(token)) throw Error('Invalid host artifact ticket');
    const directory = join(config.stateDir, 'host-inputs');
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || !privatePath(info)) throw Error('Invalid host input directory');
    const path = join(directory, token + '.json');
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    let request;
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > 65536 || !privatePath(stat)) throw Error('Invalid host ticket file');
      request = JSON.parse(await handle.readFile('utf8'));
    } finally { await handle.close(); }
    if (request.version === 1 && config.agent !== 'hermes') throw Error('Invalid host artifact agent');
    if (![1,2].includes(request.version) || typeof request.session_id !== 'string' || !request.session_id
      || !Number.isFinite(request.created_at) || Date.now() - request.created_at > 86400000
      || request.created_at > Date.now() + 60000) throw Error('Expired or invalid host artifact ticket');
    if (request.version === 2 && (request.agent !== config.agent || typeof request.turn_id !== 'string' || !request.turn_id))
      throw Error('Invalid host artifact identity');
    if (config.agent === 'codex' && (!nativeIdentity || request.session_id !== nativeIdentity.session_id || request.turn_id !== nativeIdentity.turn_id))
      throw Error('Host ticket belongs to another native session/turn or Codex request metadata is unavailable');
    const owner = { agent: config.agent, session_id: request.session_id };
    if (session.metadata.hostInputOwner && JSON.stringify(session.metadata.hostInputOwner) !== JSON.stringify(owner))
      throw Error('Host ticket belongs to another native session');
    session.metadata.hostInputOwner ??= owner;
    if (admitted.has(token)) return admitted.get(token);
    const claimPath = join(directory, token + '.claim');
    let claim;
    try { claim = await open(claimPath, 'wx', 0o600); }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const previous = await open(claimPath, constants.O_RDONLY | constants.O_NOFOLLOW);
      try { if (await previous.readFile('utf8') !== session.metadata.sessionId) throw Error('Host ticket belongs to another Dock session'); }
      finally { await previous.close(); }
    }
    if (claim) { try { await claim.writeFile(session.metadata.sessionId); await claim.sync(); } finally { await claim.close(); } }
    const result = await admitStartupArtifacts(session.artifactStore, request.files);
    admitted.set(token, result);
    return result;
  };
  return (token, nativeIdentity = null) => {
    const key = JSON.stringify([token, config.agent === 'codex' ? nativeIdentity : null]);
    if (pending.has(key)) return pending.get(key);
    const work = admit(token, nativeIdentity);
    pending.set(key, work);
    work.then(() => pending.delete(key), () => pending.delete(key));
    return work;
  };
}
