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
const conflict = path => new PackageCopyError('path_exists', {path});
const busy = path => new PackageCopyError('package_busy', {packagePath:path, kind:'other_loginom_session'});

export function packageCopyPath(path) {
  return typeof path === 'string' && path.length <= 1024 && /^\/(?:[^/\\\x00-\x1f]+\/)*[^/\\\x00-\x1f]+\.lgp$/i.test(path)
    && path.split('/').every(part => part !== '.' && part !== '..');
}

export function createPackageCopy({ file, root, storage, flush, saveFrom, record }) {
  let tail = Promise.resolve();
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
    if (expected && expected !== hash) throw uncertain();
    return hash;
  }
  async function free(path) {
    if (await storage.exists(path)) throw conflict(path);
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
    throw uncertain();
  }
  async function transaction(state, action, paths, run) {
    const id = 'package-copy-' + randomUUID();
    const pending = {id, action, paths};
    await persist({...state, pending});
    await record({phase:'package_copy_admitted', operation_id:id, action, paths});
    try {
      const output = await run(id);
      await record({phase:'package_copy_verified', operation_id:id, action, paths});
      await persist(state);
      return output;
    } catch (error) {
      // The previously persisted intent stays authoritative when any effect may have occurred.
      if (error instanceof PackageCopyError && error.code !== 'state_check_required' && error.noEffect === true) {
        await record({phase:'package_copy_not_applied', operation_id:id, action, code:error.code});
        await persist(state);
        throw error;
      }
      throw uncertain();
    }
  }
  async function run(action, input, signal) {
    const state = await read();
    if (state.pending) throw uncertain();
    signal?.throwIfAborted();
    const copy = state.copy;
    if (action === 'begin') {
      const original = input.originalPath;
      const directory = root + '/Копии агента';
      if (!packageCopyPath(original) || !original.startsWith(root + '/') || original.startsWith(directory + '/'))
        throw new PackageCopyError('access_denied');
      if (copy && !copy.discarded && !copy.version && !copy.replacement) {
        if (copy.original !== original) throw uncertain();
        await exact(copy.path);
        return {originalPath:original, path:copy.path};
      }
      const sourceHash = await exact(original);
      const stem = posix.basename(original).slice(0,-4);
      const path = await nextPath(directory, n => stem + ' — правка агента' + (n === 1 ? '' : ' ' + n) + '.lgp', 1);
      return transaction(state, action, [original, path], async () => {
        await storage.ensureDirectory(directory);
        await storage.copy(original, path, sourceHash);
        state.copy = {original, path};
        return {originalPath:original, path};
      });
    }
    if (action === 'undo-save') {
      const path = input.path;
      const version = Object.hasOwn(state.versions, path) && state.versions[path];
      if (!version) throw missing();
      if (version.undone) return {};
      await unlocked(path);
      await exact(path, version.hash);
      return transaction(state, action, [path], async () => {
        await storage.remove(path, version.hash);
        version.undone = true;
        if (copy?.version === path) delete copy.version;
        return {};
      });
    }
    if (action === 'restore-previous') {
      const backupPath = input.backupPath;
      const backup = Object.hasOwn(state.backups, backupPath) && state.backups[backupPath];
      if (!backup) throw missing();
      if (backup.restored) return {path:backup.original};
      const path = backup.original;
      await storage.close(path, false);
      await unlocked(path);
      await exact(path, backup.replacementHash);
      await exact(backupPath, backup.hash);
      return transaction(state, action, [backupPath, path], async id => {
        await saveFrom(backupPath, backup.hash, path, backup.replacementHash, id, signal);
        backup.restored = true;
        return {path};
      });
    }
    if (!copy) throw missing();
    if (action === 'discard') {
      if (copy.discarded) return {};
      if (!await storage.exists(copy.path)) throw missing();
      return transaction(state, action, [copy.path], async () => {
        await storage.close(copy.path, true);
        await unlocked(copy.path);
        const sidecar = copy.path.slice(0,-4) + '.~lgp';
        const sidecarHash = await storage.digest(sidecar);
        await storage.remove(copy.path, await exact(copy.path));
        if (sidecarHash) await storage.remove(sidecar, sidecarHash).catch(() => { throw uncertain(); });
        copy.discarded = true;
        return {};
      });
    }
    if (action === 'save-version') {
      if (copy.version) return {path:copy.version, name:posix.basename(copy.version)};
      if (copy.discarded || copy.replacement || !await storage.exists(copy.path)) throw missing();
      const stem = posix.basename(copy.original).slice(0,-4).replace(/ — v\d+$/u, '');
      const path = await nextPath(posix.dirname(copy.original), n => stem + ' — v' + n + '.lgp', 2);
      return transaction(state, action, [copy.path, path], async id => {
        await flush(copy.path, id, signal);
        const hash = await exact(copy.path);
        await storage.copy(copy.path, path, hash);
        state.versions[path] = {hash};
        copy.version = path;
        return {path, name:posix.basename(path)};
      });
    }
    if (action !== 'replace-original' || input.confirmed !== true) throw new PackageCopyError('access_denied');
    if (copy.replacement) return copy.replacement;
    if (copy.discarded && !copy.version) throw missing();
    const path = copy.original;
    const source = copy.version ?? copy.path;
    const backupPath = path.slice(0,-4) + ' — до правки.lgp';
    if (!packageCopyPath(backupPath)) throw new PackageCopyError('access_denied');
    await unlocked(path);
    await free(backupPath);
    const hash = await exact(path);
    await exact(source);
    return transaction(state, action, [source, path, backupPath], async id => {
      await flush(source, id, signal);
      const sourceHash = await exact(source);
      await storage.copy(path, backupPath, hash);
      const replacementHash = await saveFrom(source, sourceHash, path, hash, id, signal).catch(() => { throw uncertain(); });
      state.backups[backupPath] = {original:path, hash, replacementHash};
      copy.replacement = {path, backupPath};
      return copy.replacement;
    });
  }
  return {
    async originalFor(path) {
      const {copy} = await read();
      return copy && copy.path === path && !copy.discarded ? copy.original : undefined;
    },
    async guard(path) {
      const {pending, copy} = await read();
      if (pending) throw uncertain();
      if (copy && !copy.discarded && !copy.replacement && (!copy.version || path === copy.path)) return copy.path;
      return undefined;
    },
    execute(action, input, signal) {
      const result = tail.then(() => run(action, input, signal));
      tail = result.catch(() => {});
      return result;
    },
  };
}
