import { readFile, readlink, lstat, realpath, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

// The Host may verify with its bundled Node identity (Electron/Bun is not that
// Node). A manifestHash is a private, in-memory proof from this Host session;
// callers without it always hash every byte. Nothing is persisted as a cache.
export async function verifyResources(root, { nodeVersion = process.versions.node, nodePath = process.execPath, manifestHash, signal } = {}) {
  signal?.throwIfAborted();
  if (!isAbsolute(root)) throw Error('LOGINOM_RESOURCES_INVALID');
  const directory = await realpath(root);
  const bytes = await readFile(join(directory, 'resource-manifest.json'));
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
  let next = 0, failure;
  // Bound memory and disk pressure, including on first-run antivirus scans.
  // Drain every active stream before returning a failure to the owner.
  if (manifestHash === undefined) await Promise.all(Array.from({ length: Math.min(4, manifest.files.length) }, async () => {
    while (!failure && next < manifest.files.length) {
      const item = manifest.files[next++];
      try {
        const file = await realpath(join(directory, item.path));
        const local = relative(directory, file);
        if (local === '..' || local.startsWith('..' + sep) || isAbsolute(local)) throw Error('LOGINOM_RESOURCES_INVALID');
        if (item.link !== undefined && (typeof item.link !== 'string' || !(await lstat(join(directory, item.path))).isSymbolicLink()
          || await readlink(join(directory, item.path)) !== item.link)) throw Error('LOGINOM_RESOURCES_INVALID');
        if (item.directory !== undefined && item.directory !== true) throw Error('LOGINOM_RESOURCES_INVALID');
        if (item.directory === true ? typeof item.link !== 'string' || !(await stat(file)).isDirectory() : !(await stat(file)).isFile())
          throw Error('LOGINOM_RESOURCES_INVALID');
        const hash = createHash('sha256');
        if (item.directory === true) hash.update(item.link);
        else for await (const chunk of createReadStream(file, { highWaterMark: 256 * 1024, signal })) hash.update(chunk);
        if (hash.digest('hex') !== item.sha256)
          throw Error('LOGINOM_RESOURCE_HASH_MISMATCH');
      } catch (error) { failure ??= error; }
    }
  }));
  if (failure) throw failure;
  signal?.throwIfAborted();
  return {
    manifest,
    nodePath: join(directory, manifest.node),
    browserPath: join(directory, manifest.browser),
    browserRoot: join(directory, 'browsers'),
    browserHash: manifest.files.find(file => file.path === manifest.browser).sha256,
    manifestHash: digest,
  };
}
