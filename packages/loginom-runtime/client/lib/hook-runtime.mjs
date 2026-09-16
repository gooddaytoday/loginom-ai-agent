import { readFile, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { preparation } from './hooks.mjs';
import { hermesLineage } from './history.mjs';
import { verifyBundle } from './install.mjs';
import { privatePath, runtimeNodePath } from './platform.mjs';

// Native launchers resolve "current", but a prepared browser can still belong
// to the previous immutable release. Route its hooks before capturing anything.
export async function pinnedHook(config, input, currentRelease) {
  let metadata;
  if (/loginom[_-]dock.*(?:__|_)dock_prepare$/.test(input.tool_name || '')) {
    const receipt = preparation(input.tool_response ?? input.result);
    if (receipt) {
      const directory = join(config.stateDir, 'sessions', receipt.sessionId);
      const info = await lstat(directory);
      if (!info.isDirectory() || !privatePath(info)) throw new Error('Unsafe Dock session');
      metadata = JSON.parse(await readFile(join(directory, 'session.json'), 'utf8'));
      if (metadata.agent !== config.agent || metadata.sessionId !== receipt.sessionId
          || metadata.skillRevision !== receipt.skillRevision) throw new Error('Unverified Dock preparation');
    }
  }
  if (!metadata && typeof input.session_id === 'string') {
    const path = join(config.stateDir, 'archive', 'queue.sqlite');
    let info;
    try { info = await lstat(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (info) {
      if (!info.isFile() || !privatePath(info)) throw new Error('Unsafe Dock queue');
      let lineage = [input.session_id];
      if (config.agent === 'hermes' && typeof input.hermes_home === 'string') {
        try { lineage = hermesLineage(join(input.hermes_home, 'state.db'), input.session_id); } catch {}
      }
      const db = new DatabaseSync(path, { readOnly: true });
      try {
        for (const conversation of lineage) {
          const row = db.prepare('SELECT metadata FROM activations WHERE agent=? AND conversation=?').get(config.agent, conversation);
          if (row) { metadata = JSON.parse(row.metadata); break; }
        }
      } finally { db.close(); }
    }
  }
  if (!metadata?.runtimeRelease) return null; // Pre-release development sessions.
  if (!/^[0-9A-Za-z.+-]+-[a-f0-9]{12}$/.test(metadata.runtimeRelease)) throw new Error('Unsafe pinned runtime');
  const root = join(config.stateDir, 'releases', metadata.runtimeRelease);
  if (resolve(root) === resolve(currentRelease)) return null;
  const releasesInfo = await lstat(join(config.stateDir, 'releases'));
  if (!releasesInfo.isDirectory() || !privatePath(releasesInfo)) throw new Error('Unsafe Dock releases directory');
  const info = await lstat(root);
  if (!info.isDirectory()) throw new Error('Unsafe pinned runtime');
  // Verify every file before executing a previous release. Its own Node binary
  // is used, so the routing process need not run the same Node version.
  const manifest = await verifyBundle(root, { checkNode: false });
  if (manifest.id !== metadata.runtimeRelease || manifest.adapterRevision !== metadata.adapterRevision
      || manifest.node !== metadata.node) throw new Error('Pinned runtime metadata mismatch');
  return { root, node: runtimeNodePath(root), hook: join(root, 'client/bin/hook.mjs'), adapterRevision: metadata.adapterRevision };
}
