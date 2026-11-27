import { createHash, randomUUID } from 'node:crypto';
import { posix } from 'node:path';
import { PackageCopyError } from '../client/lib/package-copy.mjs';

const uncertain = () => new PackageCopyError('state_check_required');

// This private driver uses the managed browser that already owns the Loginom session.
export function packageCopyStorage(context, {url, account}) {
  const address = new URL(url);
  const page = () => context.pages()[0];
  const input = {origin:address.origin, pathname:address.pathname, account};
  async function evaluate(mode, path, extra) {
    const result = await page().evaluate(native, {...input, mode, path, ...extra});
    if (result?.error) {
      const data = result.error === 'package_busy' ? {packagePath:path, kind:'other_loginom_session'}
        : result.error === 'path_exists' ? {path:extra?.target ?? path} : {};
      const error = new PackageCopyError(result.error, data);
      error.noEffect = result.noEffect === true;
      throw error;
    }
    return result;
  }
  async function digest(path) {
    if (!await evaluate('exists', path)) return null;
    const handle = await page().evaluateHandle(native, {...input, mode:'stream', path});
    try {
      const size = await handle.evaluate(value => value?.size);
      if (!Number.isSafeInteger(size) || size <= 0) throw uncertain();
      const hash = createHash('sha256');
      for (let remaining = size; remaining > 0;) {
        const count = Math.min(128 * 1024, remaining);
        const bytes = await handle.evaluate(async (value, length) => {
          if (!value.bound()) throw Error('Loginom file reader changed');
          const buffer = new Uint8Array(length);
          await value.stream.ReadBuffer(buffer);
          if (!value.bound()) throw Error('Loginom file reader changed');
          return Array.from(buffer);
        }, count);
        hash.update(Buffer.from(bytes));
        remaining -= count;
      }
      return hash.digest('hex');
    } finally {
      try { await handle.evaluate(value => value?.stream && ReleaseObject(value.stream, true)); }
      finally { await handle.dispose(); }
    }
  }
  return {
    digest,
    names: path => evaluate('names', path),
    exists: path => evaluate('exists', path),
    busy: path => evaluate('busy', path),
    ensureDirectory: path => evaluate('directory', path),
    workspace: path => evaluate('workspace', path),
    async copy(source, target, expected) {
      const part = posix.join(posix.dirname(target), '.agent-copy-' + randomUUID() + '.part');
      try {
        await evaluate('copy', source, {target:part});
      } catch (error) {
        if (error instanceof PackageCopyError && error.code === 'access_denied' && !await evaluate('exists', part)) {
          error.noEffect = true;
          throw error;
        }
        throw uncertain();
      }
      try {
        if (await digest(part) !== expected || await digest(source) !== expected) throw uncertain();
        await evaluate('move', part, {target});
      } catch (error) {
        // Never delete by the public name. Only a proved collision or ACL refusal
        // with a removed staging file can release this admission for another try.
        const unchanged = error instanceof PackageCopyError && error.noEffect === true;
        if (!unchanged) throw uncertain();
        try {
          await evaluate('delete', part);
          if (await evaluate('exists', part)) throw uncertain();
        } catch { throw uncertain(); }
        throw error;
      }
      if (await digest(target) !== expected || await evaluate('exists', part)) throw uncertain();
    },
    async remove(path, expected) {
      if (await digest(path) !== expected) throw uncertain();
      const part = posix.join(posix.dirname(path), '.agent-copy-' + randomUUID() + '.part');
      await evaluate('move', path, {target:part, guard:true});
      try {
        // Verify the file we actually moved before deleting anything. A
        // competing save can change the public path after the first read.
        if (await digest(part) !== expected || await evaluate('busy', path) || await evaluate('exists', path)) {
          if (!await evaluate('exists', path)) await evaluate('move', part, {target:path});
          throw uncertain();
        }
        await evaluate('delete', part);
        if (await evaluate('exists', part) || await evaluate('exists', path)) throw uncertain();
      } catch { throw uncertain(); }
    },
    async close(path, discard) {
      const state = await evaluate('workspace', path);
      if (!state) return;
      if (state.running || state.modified && !discard)
        throw new PackageCopyError('package_busy', {packagePath:path, kind:'read_only', lockMarker:'unknown'});
      const handle = await page().evaluateHandle(native, {...input, mode:'close', path, discard});
      try {
        const reply = handle.evaluate(async value => value?.closed && await value.closed === true && value.bound()).catch(() => false);
        // Close may ask about the one owned draft. All other prompts remain in Loginom.
        if (state.modified) {
          const no = page().locator('[data-tid^="msgbox"][data-tid$="tlb;no"]:visible');
          const message = page().locator('[data-tid^="msgbox"][data-tid$="cnt;cnt;cmp"]:visible');
          const text = await message.innerText({timeout:5_000});
          if (!/сохранить изменения в пакете/i.test(text) || !text.includes(state.name)
            || /заблокирован|отменить активные процессы/i.test(text)
            || !await evaluate('workspace', path).then(value => value?.name === state.name && value.running === false))
            throw uncertain();
          await no.click({timeout:5_000});
        }
        if (!await reply || await evaluate('workspace', path)) throw uncertain();
      } finally { await handle.dispose(); }
    },
  };
}

async function native({origin, pathname, account, mode, path, target, discard, guard}) {
  const app = globalThis.bg?.app;
  const form = app?.Application?.FInstance?.FMainForm;
  const map = form?.FMapTree;
  const connection = map?.FServerConnection;
  const session = connection?.Session;
  const bound = () => location.origin === origin && location.pathname === pathname
    && app?.Version === '7.4.2' && globalThis.bg?.app === app && app.Application.FInstance.FMainForm === form
    && form.FReconnecting === false && form.FMapTree === map && map.FServerConnection === connection
    && connection.Connected === true && connection.UserName === account && connection.Session === session && !!session;
  if (!bound()) return {error:'state_check_required'};
  const packageNode = () => {
    const nodes = map.PackageNodes;
    if (!Number.isSafeInteger(nodes?.Count) || nodes.Count < 0 || nodes.Count > 256) throw Error('Package inventory unavailable');
    const matches = [];
    for (let i = 0; i < nodes.Count; i++) {
      const node = nodes.Items(i);
      if (typeof node?.PackageFileName === 'string'
        && '/' + node.PackageFileName.replaceAll('\\', '/').replace(/^\/+/, '') === path) matches.push(node);
    }
    if (matches.length > 1) throw Error('Package identity ambiguous');
    return matches[0];
  };
  let writing = false;
  try {
    if (mode === 'workspace' || mode === 'close') {
      const node = packageNode();
      if (!node) return null;
      const {Package:pkg} = node;
      const modified = await session.IsPackageModified(pkg);
      const running = node.HasRunningNodes();
      if (!bound() || packageNode() !== node || node.Package !== pkg || typeof modified !== 'boolean'
          || typeof running !== 'boolean' || typeof node.ReadOnly !== 'boolean') throw Error('Package identity changed');
      if (mode === 'workspace') return {modified, running, name:node.DisplayName, readOnly:node.ReadOnly};
      const dialog = [...document.querySelectorAll('[role="dialog"],.x-message-box,.bg-mask-message,.x-mask-msg')]
        .some(element => !!element.getBoundingClientRect().width && getComputedStyle(element).visibility !== 'hidden');
      if (running || modified && !discard || dialog) throw Error('Package cannot close');
      return {bound, closed:Promise.resolve(map.ClosePackage(node, false, true)).catch(() => false)};
    }
    const storage = await session.get_FileStorage();
    const call = async (method, ...args) => {
      if (!bound()) throw Error('Loginom session changed');
      const result = await storage[method](...args);
      if (!bound()) throw Error('Loginom session changed');
      return result;
    };
    const bool = async (method, ...args) => {
      const result = await call(method, ...args);
      if (typeof result !== 'boolean') throw Error('Unknown file state');
      return result;
    };
    const busy = async () => {
      const slash = path.lastIndexOf('/');
      return !!packageNode() || await bool('FileExists', path.slice(0,slash+1) + '.' + path.slice(slash+1) + '.lck')
        || await bool('FileExists', path + '.lck');
    };
    if (mode === 'exists') return bool('FileExists', path);
    if (mode === 'busy') return busy();
    if (mode === 'names') {
      if (!await bool('DirectoryExists', path)) return [];
      const list = await storage.FileInfoList;
      const items = await list.GetFileInfoItemsEx(path.endsWith('/') ? path : path + '/', ['*.lgp'], bg.TBGFileInfoAttributes.fiaNormalFilesOnly);
      try {
        const names = [];
        (await bg.selectAllAsync(items, item => [item.FileName]))(rows => bg.forEach(rows, row => names.push(row.FileName)));
        if (!bound() || names.some(name => typeof name !== 'string')) throw Error('File listing unavailable');
        return names;
      } finally { await ReleaseObject(items, true); }
    }
    if (mode === 'stream') {
      const info = await call('GetFileInfo', path);
      if (!info) throw Error('File info unavailable');
      let size;
      try { size = await info.Size; } finally { await ReleaseObject(info, true); }
      const stream = await call('OpenFile', path, bg.TBGFileOpenMode.fomRead);
      return {size, stream, bound};
    }
    if (mode === 'directory') {
      if (await bool('DirectoryExists', path)) return true;
      writing = true;
      if (await bool('CreateDirectory', path) || await bool('DirectoryExists', path)) return true;
    }
    if (mode === 'copy') {
      writing = true;
      if (await bool('CopyFile', path, target, false, false)) return true;
    }
    if (mode === 'move') {
      if (guard && await busy()) return {error:'package_busy', noEffect:true};
      if (await bool('FileExists', target)) return {error:'path_exists', noEffect:true};
      writing = true;
      if (await bool('MoveFile', path, target, false)) return true;
    }
    if (mode === 'delete') {
      writing = true;
      if (await bool('DeleteFile', path)) return true;
    }
    return {error:'state_check_required'};
  } catch (error) {
    const message = String(error?.message ?? error?._message ?? '');
    if (mode === 'move' && /^System error, \(OS Code 17\):\s*File exists$/.test(message))
      return {error:'path_exists', noEffect:true};
    if (typeof bg.EPrivilege === 'function' && error instanceof bg.EPrivilege
      || /^System error, \(OS Code (?:13|30)\):/.test(message)
      || message.endsWith(' в директории только для чтения') || message.includes('Permission denied'))
      return {error:'access_denied', noEffect:!writing || mode === 'move' || mode === 'delete' || mode === 'directory'};
    return {error:'state_check_required'};
  }
}
