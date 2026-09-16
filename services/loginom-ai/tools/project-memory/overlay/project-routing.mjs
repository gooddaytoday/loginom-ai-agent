import { lstatSync, readFileSync, realpathSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, normalize, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { deriveWorkspacePeerId } from './vendor/workspace-peer.mjs';

export const DEFAULT_ROUTING_PATH = join(homedir(), '.openviking', 'project-memory-routing.json');
export const DEFAULT_LEGACY_STATE_DIR = join(homedir(), '.openviking', 'codex-plugin-state');
export class ProjectRoutingError extends Error {}
const fail = message => { throw new ProjectRoutingError(message); };
const own = stat => typeof process.getuid !== 'function' || stat.uid === process.getuid();

function canonicalPath(path, label, { directory = true, privateDirectory = false } = {}) {
  if (typeof path !== 'string' || !isAbsolute(path) || normalize(path) !== path || path.includes('\0'))
    fail(`Project routing ${label} must be an exact canonical absolute path.`);
  let stat;
  try {
    stat = lstatSync(path);
    if (stat.isSymbolicLink() || realpathSync(path) !== path) throw new Error();
  } catch { fail(`Project routing ${label} must exist without symlinks.`); }
  if (directory && !stat.isDirectory()) fail(`Project routing ${label} must be a directory.`);
  if (!own(stat) || (stat.mode & 0o022)) fail(`Project routing ${label} must be owner-controlled.`);
  if (privateDirectory && (stat.mode & 0o777) !== 0o700)
    fail(`Project routing ${label} must have permissions 0700.`);
  return path;
}

function readProtectedJson(path, label, { optional = false, parentPrivate = false } = {}) {
  let stat;
  try { stat = lstatSync(path); }
  catch (error) {
    if (optional && error.code === 'ENOENT') return null;
    fail(`Project routing ${label} is missing or unreadable.`);
  }
  if (!stat.isFile() || stat.isSymbolicLink() || !own(stat) || (stat.mode & 0o777) !== 0o600)
    fail(`Project routing ${label} must be an owner-only regular file with permissions 0600.`);
  canonicalPath(dirname(path), `${label} directory`, { privateDirectory: parentPrivate });
  if (realpathSync(path) !== path) fail(`Project routing ${label} must not use symlinks.`);
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { fail(`Project routing ${label} is not valid JSON.`); }
}

export function computeOfficialPluginPin(pluginRoot) {
  const files = ['.codex-plugin/plugin.json', 'hooks/hooks.json'];
  const visit = relative => {
    for (const name of readdirSync(join(pluginRoot, relative)).sort()) {
      const child = join(relative, name), full = join(pluginRoot, child), stat = lstatSync(full);
      if (stat.isSymbolicLink()) fail('Official plugin pin must not include symlinks.');
      if (stat.isDirectory()) visit(child);
      else if (name.endsWith('.mjs')) files.push(child);
    }
  };
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(pluginRoot, files[0]), 'utf8'));
    if (manifest.version !== '0.8.1') fail('Only reviewed official plugin version 0.8.1 is supported.');
    visit('scripts');
    for (const name of ['session-start-commit', 'auto-recall', 'auto-capture', 'pre-compact-capture', 'session-end', 'config'])
      if (!files.includes(`scripts/${name}.mjs`)) fail('Official plugin pin is missing a required hook or configuration file.');
    const hash = createHash('sha256');
    for (const relative of files.sort()) {
      const full = join(pluginRoot, relative);
      canonicalPath(full, 'official plugin file', { directory: false });
      if (!lstatSync(full).isFile()) fail('Official plugin pin requires regular source files.');
      const bytes = readFileSync(full);
      hash.update(`${relative}\0${bytes.length}\0`); hash.update(bytes);
    }
    return { version: manifest.version, sha256: hash.digest('hex') };
  } catch (error) {
    if (error instanceof ProjectRoutingError) throw error;
    fail('Cannot verify the reviewed official plugin code pin.');
  }
}

export function validateProjectRouting(raw) {
  if (!raw || raw.version !== 1 || !Array.isArray(raw.projects) ||
      Object.keys(raw).some(key => !['version', 'projects'].includes(key)))
    fail('Project routing requires version 1 and an explicit projects list.');
  const workspaces = new Set(), stateDirs = new Set(), roots = new Set();
  const projects = raw.projects.map(entry => {
    if (!entry || typeof entry !== 'object' ||
        Object.keys(entry).some(key => !['projectRoot', 'workspaces', 'stateDir', 'pluginRoot', 'generation'].includes(key)))
      fail('Project routing has unsupported project fields.');
    const projectRoot = canonicalPath(entry.projectRoot, 'projectRoot');
    if (dirname(projectRoot) === projectRoot || roots.has(projectRoot))
      fail('Project routing project roots must be distinct non-root directories.');
    roots.add(projectRoot);
    const stateDir = canonicalPath(entry.stateDir, 'stateDir', { privateDirectory: true });
    const pluginRoot = canonicalPath(entry.pluginRoot, 'pluginRoot');
    const pluginPin = computeOfficialPluginPin(pluginRoot);
    if (stateDirs.has(stateDir)) fail('Project routing state directories must be distinct.');
    stateDirs.add(stateDir);
    if (typeof entry.generation !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(entry.generation))
      fail('Project routing requires an explicit generation.');
    if (!Array.isArray(entry.workspaces) || !entry.workspaces.length)
      fail('Project routing requires exact workspace paths.');
    const exactWorkspaces = entry.workspaces.map(path => {
      canonicalPath(path, 'workspace');
      if (path !== projectRoot && !path.startsWith(projectRoot + sep))
        fail('Project routing workspace must belong to its declared project root.');
      if (workspaces.has(path)) fail('Project routing workspace appears more than once.');
      workspaces.add(path);
      return path;
    }).sort();
    const route = { projectRoot, workspaces: exactWorkspaces, stateDir, pluginRoot,
      generation: entry.generation, canonicalPeerId: deriveWorkspacePeerId(projectRoot), pluginPin };
    return { ...route, routeHash: createHash('sha256').update(JSON.stringify(route)).digest('hex') };
  });
  return { version: 1, projects };
}

export function loadProjectRouting(path = DEFAULT_ROUTING_PATH) {
  const raw = readProtectedJson(path, 'configuration', { optional: true });
  return raw === null ? { version: 1, projects: [] } : validateProjectRouting(raw);
}

export function resolveProjectRoute(cwd, config = loadProjectRouting()) {
  const route = config.projects.find(project => project.workspaces.includes(cwd));
  if (!route) return null;
  // Recheck physical ownership and canonical paths on each data call.
  canonicalPath(cwd, 'workspace');
  canonicalPath(route.stateDir, 'stateDir', { privateDirectory: true });
  if (computeOfficialPluginPin(route.pluginRoot).sha256 !== route.pluginPin.sha256)
    fail('Official plugin revision changed after project routing was loaded.');
  return route;
}

function validateContext(context) {
  if (!context || typeof context.threadId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(context.threadId))
    fail('Project routing requires a valid host threadId.');
}

export function routingReceiptPath(route, threadId) {
  validateContext({ threadId });
  return join(route.stateDir, 'routing-receipts', `${threadId}.json`);
}

export function makeRoutingReceipt(context, route) {
  validateContext(context);
  if (!route.workspaces.includes(context.cwd)) fail('Project routing receipt workspace is not registered.');
  return { version: 1, threadId: context.threadId, cwd: context.cwd,
    workspacePeerId: deriveWorkspacePeerId(context.cwd), effectivePeerId: route.canonicalPeerId,
    routeHash: route.routeHash, stateDir: route.stateDir, pluginRoot: route.pluginRoot,
    officialPluginVersion: route.pluginPin.version, officialPluginSha256: route.pluginPin.sha256,
    generation: route.generation };
}

export function validateRoutingReceipt(receipt, context, route) {
  const expected = makeRoutingReceipt(context, route);
  if (!receipt || Object.entries(expected).some(([key, value]) => receipt[key] !== value))
    fail('Project routing receipt is missing, stale or does not match the host task.');
  return receipt;
}

export function readRouteReceipt(context, route) {
  return validateRoutingReceipt(readProtectedJson(routingReceiptPath(route, context.threadId), 'receipt', { parentPrivate: true }), context, route);
}

export function readMappedState(context, route) {
  validateContext(context);
  if (!route.workspaces.includes(context.cwd)) fail('Project routing state workspace is not registered.');
  const state = readProtectedJson(join(route.stateDir, `${context.threadId}.json`), 'hook state', { parentPrivate: true });
  if (!state || state.codexSessionId !== context.threadId ||
      state.workspacePeerId !== '' ||
      (state.ovSessionId != null && state.ovSessionId !== `cx-${context.threadId}`) ||
      !Number.isInteger(state.capturedTurnCount) || state.capturedTurnCount < 0)
    fail('Project routing official hook state disagrees with the explicit project Peer or task session.');
  return state;
}

export function activationPath(context, route) {
  validateContext(context);
  return join(route.stateDir, 'routing-activations', `${context.threadId}.json`);
}

export function assertNoLegacyState(context, route, legacyStateDir = DEFAULT_LEGACY_STATE_DIR) {
  validateContext(context);
  if (normalize(legacyStateDir) === route.stateDir)
    fail('Shared project state must not use the global state directory.');
  let names;
  try { names = readdirSync(legacyStateDir); }
  catch (error) {
    if (error.code === 'ENOENT') return;
    fail('Cannot check the original hook state directory.');
  }
  if (names.some(name => name === `${context.threadId}.json` || name === `${context.threadId}.lock` ||
      name === `${context.threadId}.ended` || name.startsWith(`${context.threadId}.ended.`)))
    fail('The original hook still owns this thread. Complete controlled state migration first.');
}

export function validateActivation(context, route, legacyStateDir = DEFAULT_LEGACY_STATE_DIR) {
  const activation = readProtectedJson(activationPath(context, route), 'activation', { parentPrivate: true });
  if (!activation || activation.version !== 1 || activation.threadId !== context.threadId || activation.cwd !== context.cwd ||
      activation.routeHash !== route.routeHash || activation.generation !== route.generation ||
      activation.sourceStateDir !== legacyStateDir || activation.originalStateRetired !== true ||
      activation.originalProjectHooksDisabled !== true || typeof activation.verifiedAt !== 'string' ||
      !Number.isFinite(Date.parse(activation.verifiedAt)) ||
      !['project-hook-config', 'project-plugin-disabled'].includes(activation.disablementMethod))
    fail('Thread activation is incomplete or stale. Reverify the project hook cutover.');
  assertNoLegacyState(context, route, legacyStateDir);
  return activation;
}
