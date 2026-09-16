import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createAgentLauncher } from './agent-command.mjs';
import { isDeepStrictEqual } from 'node:util';
import { launcherPath } from './platform.mjs';

export function createNativeCommand(launcher) {
  return (command, args, env, options = {}) => nativeCommand(command, args, env, { ...options, launcher });
}

export function nativeCommand(command, args, env, { capture = false, allowMissing = false, launcher = createAgentLauncher(command, { env }) } = {}) {
  const result = launcher.run(args, { encoding: 'utf8', windowsHide: true, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
  const missing = allowMissing && capture && command === 'hermes' && args[0] === 'config' && args[1] === 'get'
    && result.status === 1 && !result.stdout?.trim() && result.stderr?.trim() === 'Config key not set: ' + args[2];
  if (result.error || (result.status !== 0 && !missing)) throw new Error('Native plugin operation failed');
  return missing ? result.stderr.trim() : result.stdout?.trim() || '';
}
const plugin = 'loginom-dock@loginom-dock';
const mcpKey = 'mcp_servers.loginom-dock';
const source = 'https://github.com/kartamyshev-dev/loginom-dock.git#plugins/loginom-dock-hermes';
const json = (command, args, env, run) => JSON.parse(run(command, args, env, { capture: true }));
function hermesConfig(key, env, run) {
  const raw = run('hermes', ['config', 'get', key, '--json'], env, { capture: true, allowMissing: true });
  return raw.startsWith('Config key not set:') ? null : JSON.parse(raw);
}
function restoreHermesFlags(flags, env, run) {
  for (const name of ['enabled', 'disabled']) {
    const key = 'plugins.' + name;
    const current = hermesConfig(key, env, run);
    if (current !== null && !Array.isArray(current)) throw new Error('Unexpected Hermes plugin activation format');
    const updated = (current || []).filter(value => value !== 'loginom-dock');
    if (flags?.[name]) updated.push('loginom-dock');
    if (!isDeepStrictEqual(current || [], updated)) run('hermes', ['config', 'set', key, JSON.stringify(updated)], env);
  }
}

export async function nativeSnapshot(agent, env, run = nativeCommand) {
  if (agent === 'codex') {
    const entries = json('codex', ['plugin', 'marketplace', 'list', '--json'], env, run).marketplaces;
    const installed = json('codex', ['plugin', 'list', '--json'], env, run).installed;
    return { marketplace: entries.find(entry => entry.name === 'loginom-dock') || null,
      installed: installed.some(entry => entry.pluginId === plugin),
      otherPlugins: installed.some(entry => entry.marketplaceName === 'loginom-dock' && entry.pluginId !== plugin) };
  }
  const mcp = hermesConfig(mcpKey, env, run);
  const metadata = await readFile(join(env.HERMES_HOME, 'plugins/.install-metadata.json'), 'utf8')
    .then(JSON.parse).catch(error => { if (error.code !== 'ENOENT') throw error; return {}; });
  const flags = {};
  for (const name of ['enabled', 'disabled']) flags[name] = (hermesConfig('plugins.' + name, env, run) || []).includes('loginom-dock');
  return { mcp, package: metadata['loginom-dock'] || null, flags };
}

function codexSource(entry) {
  const saved = entry.marketplaceSource;
  if (saved?.sourceType === 'local') return [saved.source];
  if (saved?.source && saved.ref) return [saved.source, '--ref', saved.ref];
  // Unknown source formats must not be removed without a usable recovery source.
  throw new Error('Cannot recover this existing Dock marketplace source');
}
export function validateNativeInstall(agent, manifest, snapshot) {
  if (agent === 'hermes' && (manifest.sourceDirty || !/^[a-f0-9]{40}$/.test(manifest.sourceCommit))) {
    throw new Error('Native Hermes needs a clean published commit');
  }
  if (agent === 'codex' && snapshot.marketplace) codexSource(snapshot.marketplace);
  if (agent === 'hermes' && snapshot.package && (!snapshot.package.pinned || !/^[a-f0-9]{40}$/.test(snapshot.package.revision))) {
    throw new Error('Existing Hermes Dock plugin has no pinned recovery source');
  }
}

export async function registerNative({ agent, destination, root, manifest, env, before, run = nativeCommand }) {
  validateNativeInstall(agent, manifest, before);
  if (agent === 'codex') {
    if (before.marketplace && before.marketplace.root !== destination) {
      run('codex', ['plugin', 'marketplace', 'remove', 'loginom-dock'], env);
    }
    run('codex', ['plugin', 'marketplace', 'add', destination], env);
    run('codex', ['plugin', 'add', plugin], env);
  } else {
    run('hermes', ['plugins', 'install', source, '--ref', manifest.sourceCommit, '--enable', '--force'], env);
    // Hermes' native config command edits only this key and preserves other settings.
    // Unlike interactive mcp add, cancellation cannot silently return success here.
    const mcp = { command: launcherPath(root), args: ['mcp', 'hermes', manifest.adapterRevision], connect_timeout: 120, enabled: true };
    run('hermes', ['config', 'set', mcpKey, JSON.stringify(mcp)], env);
    const actual = json('hermes', ['config', 'get', mcpKey, '--json'], env, run);
    if (!isDeepStrictEqual(actual, mcp)) throw new Error('Hermes MCP registration was not saved');
  }
}

export async function restoreNative({ agent, env, before, run = nativeCommand }) {
  if (agent === 'codex') {
    const now = await nativeSnapshot(agent, env, run);
    if (!before.installed && now.installed) run('codex', ['plugin', 'remove', plugin], env);
    if (now.marketplace) run('codex', ['plugin', 'marketplace', 'remove', 'loginom-dock'], env);
    if (before.marketplace) {
      run('codex', ['plugin', 'marketplace', 'add', ...codexSource(before.marketplace)], env);
      if (before.installed) run('codex', ['plugin', 'add', plugin], env);
    }
  } else {
    if (before.package) {
      if (!before.package.pinned || !/^[a-f0-9]{40}$/.test(before.package.revision)) throw new Error('Hermes recovery source is not pinned');
      run('hermes', ['plugins', 'install', before.package.source, '--ref', before.package.revision, '--enable', '--force'], env);
    } else {
      const now = await nativeSnapshot(agent, env, run);
      if (now.package) run('hermes', ['plugins', 'remove', 'loginom-dock'], env);
    }
    run('hermes', before.mcp ? ['config', 'set', mcpKey, JSON.stringify(before.mcp)] : ['config', 'unset', mcpKey], env);
    restoreHermesFlags(before.flags, env, run);
  }
}

export async function unregisterNative({ agent, env, run = nativeCommand }) {
  const before = await nativeSnapshot(agent, env, run);
  if (agent === 'codex') {
    if (before.installed) run('codex', ['plugin', 'remove', plugin], env);
    if (before.marketplace && !before.otherPlugins) {
      run('codex', ['plugin', 'marketplace', 'remove', 'loginom-dock'], env);
    }
  } else {
    // Remove the activation flag too; Hermes plugin remove preserves it otherwise.
    if (before.package) {
      run('hermes', ['plugins', 'disable', 'loginom-dock'], env);
      run('hermes', ['plugins', 'remove', 'loginom-dock'], env);
    }
    run('hermes', ['config', 'unset', mcpKey], env);
    restoreHermesFlags({}, env, run);
  }
}
