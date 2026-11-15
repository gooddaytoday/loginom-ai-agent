import { mkdir, readFile, readlink, lstat, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';

// The Host may verify with its bundled Node identity (Electron/Bun is not that
// Node). A manifestHash binds a runtime to the manifest its Host verified; it
// never replaces the per-start file metadata check below.
// lab1548-resource-cache: the profile cache is explicitly authorized to trust
// unchanged metadata. It is not protection against an attacker forging that metadata.
export async function verifyResources(root, { nodeVersion = process.versions.node, nodePath = process.execPath,
  manifestHash, signal, cachePath, cacheVersion = '', forceHash = false, requireCache = false } = {}) {
  signal?.throwIfAborted();
  if (!isAbsolute(root)) throw Error('LOGINOM_RESOURCES_INVALID');
  if (requireCache && !cachePath) throw Error('LOGINOM_RESOURCES_INVALID');
  const directory = await realpath(root);
  const metadata = value => Object.fromEntries(['dev','ino','size','mtimeNs','ctimeNs','birthtimeNs']
    .map(key => [key === 'mtimeNs' ? 'mtime' : key === 'ctimeNs' ? 'ctime' : key === 'birthtimeNs' ? 'birthtime' : key, String(value[key]) ]));
  const same = (a,b) => a && b && ['dev','ino','size','mtime','ctime','birthtime'].every(key => typeof a[key] === 'string' && a[key] === b[key]);
  const manifestPath = join(directory, 'resource-manifest.json');
  const installation = metadata(await stat(manifestPath, { bigint: true }));
  const bytes = await readFile(manifestPath);
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (manifestHash !== undefined && manifestHash !== digest) throw Error('LOGINOM_RESOURCE_HASH_MISMATCH');
  const manifest = JSON.parse(bytes);
  if (manifest.protocol !== 1 || manifest.nodeVersion !== nodeVersion || !Array.isArray(manifest.files)
    || !manifest.files.length || typeof manifest.node !== 'string' || typeof manifest.browser !== 'string') throw Error('LOGINOM_RESOURCES_INVALID');
  const seen = new Set();
  for (const item of manifest.files) {
    if (typeof item.path !== 'string' || isAbsolute(item.path) || item.path.split(/[\\/]/).some(x => x === '..' || x === '.')
      || !/^[a-f0-9]{64}$/.test(item.sha256) || seen.has(item.path)) throw Error('LOGINOM_RESOURCES_INVALID');
    seen.add(item.path);
  }
  if (!seen.has(manifest.node) || !seen.has(manifest.browser)) throw Error('LOGINOM_RESOURCES_INVALID');
  if (await realpath(nodePath) !== await realpath(join(directory, manifest.node))) throw Error('LOGINOM_NODE_PATH_MISMATCH');
  const localCache = cachePath && relative(directory, cachePath);
  if (cachePath && (!isAbsolute(cachePath) || (!isAbsolute(localCache) && !localCache.startsWith('..' + sep))))
    throw Error('LOGINOM_RESOURCES_INVALID');
  const stored = cachePath && !forceHash
    ? await readFile(cachePath, 'utf8').then(text => { try { return JSON.parse(text); } catch { return undefined; } }, () => undefined) : undefined;
  const cached = stored?.protocol === 1 && stored.root === directory && stored.manifestHash === digest
    && stored.version === cacheVersion && same(stored.installation, installation) && stored.files && typeof stored.files === 'object'
      ? stored.files : undefined;
  const files = Object.create(null);
  const verification = { mode: 'full', hashedFiles: 0, cachedFiles: 0 };
  let next = 0, failure, hashing = Promise.resolve();
  // Bound memory and disk pressure, including on first-run antivirus scans.
  // Drain every active stream before returning a failure to the owner.
  // Serialize Windows hashing: four concurrent reads previously coincided with
  // severe disk/antivirus pressure. Metadata checks remain bounded and parallel.
  await Promise.all(Array.from({ length: Math.min(4, manifest.files.length) }, async () => {
    while (!failure && next < manifest.files.length) {
      const item = manifest.files[next++];
      try {
        const file = await realpath(join(directory, item.path));
        const local = relative(directory, file);
        if (local === '..' || local.startsWith('..' + sep) || isAbsolute(local)) throw Error('LOGINOM_RESOURCES_INVALID');
        if (item.link !== undefined && (typeof item.link !== 'string' || !(await lstat(join(directory, item.path))).isSymbolicLink()
          || await readlink(join(directory, item.path)) !== item.link)) throw Error('LOGINOM_RESOURCES_INVALID');
        if (item.directory !== undefined && item.directory !== true) throw Error('LOGINOM_RESOURCES_INVALID');
        const before = await stat(file, { bigint: true });
        if (item.directory === true ? typeof item.link !== 'string' || !before.isDirectory() : !before.isFile())
          throw Error('LOGINOM_RESOURCES_INVALID');
        const fingerprint = metadata(before);
        const previous = cached && Object.hasOwn(cached, item.path) ? cached[item.path] : undefined;
        // Node's bigint ino is the Windows file index / POSIX inode. If the
        // platform cannot provide it or nanosecond metadata, hash instead.
        if (fingerprint.ino !== '0' && !Object.values(fingerprint).includes('undefined')
          && previous?.sha256 === item.sha256 && same(previous, fingerprint)) verification.cachedFiles++;
        else {
          const read = async () => {
            if (failure) return;
            const hash = createHash('sha256');
            if (item.directory === true) hash.update(item.link);
            else for await (const chunk of createReadStream(file, { highWaterMark: 256 * 1024, signal })) hash.update(chunk);
            if (hash.digest('hex') !== item.sha256 || !same(fingerprint, metadata(await stat(file, { bigint: true }))))
              throw Error('LOGINOM_RESOURCE_HASH_MISMATCH');
            verification.hashedFiles++;
          };
          if (process.platform === 'win32') await (hashing = hashing.then(read, read)); else await read();
        }
        files[item.path] = { ...fingerprint, sha256: item.sha256 };
      } catch (error) { failure ??= error; }
    }
  }));
  if (failure) throw failure;
  signal?.throwIfAborted();
  if (!same(installation, metadata(await stat(manifestPath, { bigint: true })))) throw Error('LOGINOM_RESOURCE_HASH_MISMATCH');
  verification.mode = verification.cachedFiles === manifest.files.length ? 'metadata'
    : verification.cachedFiles ? 'partial' : 'full';
  if (cachePath) {
    const temporary = cachePath + '.' + randomUUID() + '.tmp';
    try {
      await mkdir(dirname(cachePath), { recursive: true, mode: 0o700 });
      await writeFile(temporary, JSON.stringify({ protocol: 1, root: directory, manifestHash: digest,
        version: cacheVersion, installation, files }) + '\n', { flag: 'wx', mode: 0o600 });
      signal?.throwIfAborted();
      await rename(temporary, cachePath);
    } catch (error) {
      signal?.throwIfAborted();
      if (requireCache) throw Error('LOGINOM_RESOURCE_CACHE_WRITE_FAILED', { cause: error });
      /* Startup can still use a valid full pass without a writable cache. */
    }
    finally { await rm(temporary, { force: true }).catch(() => {}); }
  }
  return {
    manifest,
    nodePath: join(directory, manifest.node),
    browserPath: join(directory, manifest.browser),
    browserRoot: join(directory, 'browsers'),
    browserHash: manifest.files.find(file => file.path === manifest.browser).sha256,
    manifestHash: digest,
    verification,
  };
}
