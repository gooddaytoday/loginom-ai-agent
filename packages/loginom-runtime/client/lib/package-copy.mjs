import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { posix, dirname } from 'node:path';

export class PackageCopyError extends Error {
  constructor(code, data = {}) {
    super(code);
    this.code = code;
    this.data = data;
  }
}

const missing = () => new PackageCopyError('copy_missing');
const uncertain = () => new PackageCopyError('state_check_required');
const notApplied = () => new PackageCopyError('not_applied');
const busy = path => new PackageCopyError('package_busy', {packagePath:path, kind:'other_loginom_session'});
const stage = path => posix.join(posix.dirname(path), '.agent-copy-' + randomUUID() + '.part');
const sidecar = path => path.slice(0,-4) + '.~lgp';
const snapshot = (...entries) => Object.fromEntries(entries);

export function packageCopyPath(path) {
  return typeof path === 'string' && path.length <= 1024 && /^\/(?:[^/\\\x00-\x1f]+\/)*[^/\\\x00-\x1f]+\.lgp$/i.test(path)
    && path.split('/').every(part => part !== '.' && part !== '..');
}

export function createPackageCopy({ file, root, storage, checkpoint, prepareSave, record }) {
  let tail = Promise.resolve();
  function enqueue(run) {
    const result = tail.then(run);
    tail = result.catch(() => {});
    return result;
  }
  async function read() {
    return readFile(file, 'utf8').then(JSON.parse, error => {
      if (error.code !== 'ENOENT') throw error;
      return { versions:{}, backups:{} };
    });
  }
  async function persist(state) {
    await mkdir(dirname(file), {recursive:true, mode:0o700});
    const temporary = file + '.' + randomUUID() + '.tmp';
    const handle = await open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(JSON.stringify(state));
      await handle.sync();
    } finally { await handle.close(); }
    await rename(temporary, file);
    if (process.platform !== 'win32') {
      const directory = await open(dirname(file), 'r');
      try { await directory.sync(); } finally { await directory.close(); }
    }
  }
  async function exact(path, expected) {
    const hash = await storage.digest(path);
    if (!hash) throw missing();
    if (expected && expected !== hash) throw notApplied();
    return hash;
  }
  async function unlocked(path) {
    if (!await storage.busy(path)) return;
    if (await storage.workspace(path)) throw new PackageCopyError('package_busy', {packagePath:path, kind:'read_only', lockMarker:'unknown'});
    throw busy(path);
  }
  async function nextPath(directory, makeName, start) {
    const names = new Set(await storage.names(directory));
    for (let n = start; n < start + names.size + 1; n++) {
      const path = posix.join(directory, makeName(n));
      if (!packageCopyPath(path)) throw new PackageCopyError('access_denied');
      if (!names.has(posix.basename(path))) return path;
    }
    throw notApplied();
  }
  const event = (pending, phase, details) => record({phase, operation_id:pending.id,
    action:pending.action, paths:pending.paths, ...details});
  async function reconcile(state) {
    const {pending, ...previous} = state;
    if (!pending) return state;
    if (!pending.before) throw uncertain();
    let observed;
    try {
      observed = snapshot(...await Promise.all(Object.keys(pending.before).map(async path => [path, await storage.digest(path)])));
    } catch { throw uncertain(); }
    const matches = expected => expected && Object.entries(expected).every(([path, hash]) => observed[path] === hash);
    // A surviving verified Save receipt binds the exact serialized target hash.
    // An unverified Save As can only be certified if both file hashes match.
    const verification = pending.nativeSave;
    const applied = matches(pending.after) && (!verification || pending.verifiedHash
      || observed[verification.path] !== pending.before[verification.path]);
    if (!applied && !matches(pending.before) && !matches(pending.backupOnly)) throw uncertain();
    const next = applied ? pending.next : previous;
    await event(pending, applied ? 'package_copy_reconciled' : 'package_copy_not_applied');
    await persist(next);
    return next;
  }
  async function transaction(state, action, {before, after, next, backupOnly, nativeSave}, run) {
    const pending = {id:'package-copy-' + randomUUID(), action, paths:Object.keys(before), before, after, next, backupOnly, nativeSave};
    await persist({...state, pending});
    try {
      await event(pending, 'package_copy_admitted');
      const output = await run(pending.id);
      if (nativeSave) {
        pending.after[nativeSave.path] = output;
        pending.next.backups[nativeSave.backupPath].replacementHash = nativeSave.restore
          ? state.backups[nativeSave.backupPath].replacementHash : output;
        pending.verifiedHash = true;
        await persist({...state, pending});
      }
      await event(pending, 'package_copy_verified');
      await persist(next);
    } catch (error) {
      if (error instanceof PackageCopyError && error.noEffect === true && !backupOnly) {
        await event(pending, 'package_copy_not_applied', {code:error.code});
        await persist(state);
        throw error;
      }
      const settled = await reconcile({...state, pending}).catch(() => { throw uncertain(); });
      if (settled === next) return;
      throw error instanceof PackageCopyError && error.code !== 'state_check_required' ? error : notApplied();
    }
  }
  async function run(action, input, signal) {
    const state = await reconcile(await read());
    signal?.throwIfAborted();
    const copy = state.copy;
    if (action === 'begin') {
      const original = input.originalPath;
      const directory = root + '/Копии агента';
      if (!packageCopyPath(original) || !original.startsWith(root + '/') || original.startsWith(directory + '/'))
        throw new PackageCopyError('access_denied');
      if (copy && !copy.discarded && !copy.replacement) {
        if (copy.original === original) {
          await exact(copy.path);
          return {originalPath:original, path:copy.path};
        }
        if (!copy.version) throw notApplied();
      }
      const hash = await exact(original);
      const stem = posix.basename(original).slice(0,-4);
      const path = await nextPath(directory, n => stem + ' — правка агента' + (n === 1 ? '' : ' ' + n) + '.lgp', 1);
      const part = stage(path);
      await storage.ensureDirectory(directory);
      await transaction(state, action, {
        before:snapshot([original, hash], [path, null], [part, null]), after:snapshot([path, hash], [part, null]),
        next:{...state, copy:{original, path}},
      }, () => storage.copy(original, path, hash, part));
      return {originalPath:original, path};
    }
    if (action === 'undo-save') {
      const path = input.path;
      const version = Object.hasOwn(state.versions, path) && state.versions[path];
      if (!version) throw missing();
      if (version.undone) return {};
      await unlocked(path);
      const hash = await exact(path, version.hash);
      const part = stage(path);
      const next = structuredClone(state);
      next.versions[path].undone = true;
      if (copy?.version === path) delete next.copy.version;
      await transaction(state, action, {
        before:snapshot([path, hash], [part, null]), after:snapshot([path, null], [part, null]), next,
      }, () => storage.remove(path, hash, part));
      return {};
    }
    if (action === 'restore-previous') {
      const backupPath = input.backupPath;
      const backup = Object.hasOwn(state.backups, backupPath) && state.backups[backupPath];
      if (!backup) throw missing();
      const path = backup.original;
      if (backup.restored) return {path};
      const next = structuredClone(state);
      next.backups[backupPath].restored = true;
      await replace({path, source:backupPath, sourceHash:backup.hash, previous:backup.replacementHash, backupPath, next, restore:true});
      return {path};
    }
    if (!copy) throw missing();
    if (action === 'discard') {
      if (copy.discarded) return {};
      await exact(copy.path);
      await storage.close(copy.path, true);
      await unlocked(copy.path);
      const files = [[copy.path, await exact(copy.path)], [sidecar(copy.path), await storage.digest(sidecar(copy.path))]]
        .filter(([,hash]) => hash !== null).map(([path, hash]) => ({path, hash, part:stage(path)}));
      await transaction(state, action, {
        before:snapshot(...files.flatMap(({path, hash, part}) => [[path, hash], [part, null]])),
        after:snapshot(...files.flatMap(({path, part}) => [[path, null], [part, null]])),
        next:{...state, copy:{...copy, discarded:true}},
      }, async () => {
        for (const {path, hash, part} of files) {
          try { await storage.remove(path, hash, part); }
          catch (error) { if (path !== copy.path) throw uncertain(); throw error; }
        }
      });
      return {};
    }
    if (action === 'save-version') {
      if (copy.discarded || copy.replacement) throw missing();
      await exact(copy.path);
      await checkpoint(copy.path, signal);
      const hash = await exact(copy.path);
      if (copy.version && state.versions[copy.version]?.hash === hash && await storage.digest(copy.version) === hash)
        return {path:copy.version, name:posix.basename(copy.version)};
      const stem = posix.basename(copy.original).slice(0,-4).replace(/ — v\d+$/u, '');
      const path = await nextPath(posix.dirname(copy.original), n => stem + ' — v' + n + '.lgp', 2);
      const part = stage(path);
      await transaction(state, action, {
        before:snapshot([copy.path, hash], [path, null], [part, null]), after:snapshot([path, hash], [part, null]),
        next:{...state, versions:{...state.versions, [path]:{hash}}, copy:{...copy, version:path}},
      }, () => storage.copy(copy.path, path, hash, part));
      return {path, name:posix.basename(path)};
    }
    if (action !== 'replace-original' || input.confirmed !== true) throw new PackageCopyError('access_denied');
    if (copy.replacement) {
      await exact(copy.original, state.backups[copy.replacement.backupPath]?.replacementHash);
      return copy.replacement;
    }
    if (copy.discarded && !copy.version) throw missing();
    const path = copy.original;
    const source = copy.discarded ? copy.version : copy.path;
    await exact(source, copy.discarded ? state.versions[source]?.hash : undefined);
    await checkpoint(source, signal);
    const sourceHash = await exact(source, copy.discarded ? state.versions[source]?.hash : undefined);
    const previous = await exact(path);
    const stem = posix.basename(path).slice(0,-4) + ' — до правки';
    const backupPath = await nextPath(posix.dirname(path), n => stem + (n === 1 ? '' : ' ' + n) + '.lgp', 1);
    const output = {path, backupPath};
    const next = {...state, backups:{...state.backups, [backupPath]:{original:path, hash:previous, replacementHash:sourceHash}},
      copy:{...copy, replacement:output}};
    await replace({path, source, sourceHash, previous, backupPath, next});
    return output;

    async function replace({path, source, sourceHash, previous, backupPath, next, restore = false}) {
      await exact(path, previous);
      await exact(source, sourceHash);
      await storage.close(path, false);
      await unlocked(path);
      const executeSave = await prepareSave(source, sourceHash, path, previous, signal);
      signal?.throwIfAborted();
      const backupPart = stage(backupPath);
      const oldSidecar = await storage.digest(sidecar(path));
      const before = snapshot([source, sourceHash], [path, previous], [sidecar(path), oldSidecar]);
      if (!restore) Object.assign(before, snapshot([backupPath, null], [backupPart, null]));
      const backupOnly = restore ? undefined : {...before, [backupPath]:previous};
      const after = snapshot([path, sourceHash], [sidecar(path), previous], [backupPath, restore ? sourceHash : previous]);
      if (!restore) after[backupPart] = null;
      await transaction(state, action, {before, after, next, backupOnly, nativeSave:{path, backupPath, restore}}, async id => {
        if (!restore) await storage.copy(path, backupPath, previous, backupPart);
        return executeSave(id);
      });
    }
  }
  return {
    async originalFor(path) {
      const {copy} = await read();
      return copy && copy.path === path && !copy.discarded ? copy.original : undefined;
    },
    guard(path) {
      return enqueue(async () => {
        const {copy} = await reconcile(await read());
        if (copy && !copy.discarded && !copy.replacement && (!copy.version || path === copy.path)) return copy.path;
        return undefined;
      });
    },
    execute(action, input, signal) {
      return enqueue(() => run(action, input, signal));
    },
  };
}
