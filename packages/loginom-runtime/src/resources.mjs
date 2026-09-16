import { readFile, realpath, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isAbsolute, join, relative, sep } from 'node:path';

export async function verifyResources(root) {
  if (!isAbsolute(root)) throw Error('LOGINOM_RESOURCES_INVALID');
  const directory = await realpath(root);
  const manifest = JSON.parse(await readFile(join(directory, 'resource-manifest.json'), 'utf8'));
  if (manifest.protocol !== 1 || manifest.nodeVersion !== process.versions.node || !Array.isArray(manifest.files)
    || !manifest.files.length || typeof manifest.node !== 'string' || typeof manifest.browser !== 'string') throw Error('LOGINOM_RESOURCES_INVALID');
  const seen = new Set();
  for (const item of manifest.files) {
    if (typeof item.path !== 'string' || isAbsolute(item.path) || item.path.split(/[\\/]/).some(x => x === '..' || x === '.')
      || !/^[a-f0-9]{64}$/.test(item.sha256) || seen.has(item.path)) throw Error('LOGINOM_RESOURCES_INVALID');
    seen.add(item.path);
    const file = await realpath(join(directory, item.path));
    const local = relative(directory, file);
    if (local === '..' || local.startsWith('..' + sep) || isAbsolute(local) || !(await stat(file)).isFile()) throw Error('LOGINOM_RESOURCES_INVALID');
    if (createHash('sha256').update(await readFile(file)).digest('hex') !== item.sha256) throw Error('LOGINOM_RESOURCE_HASH_MISMATCH');
  }
  if (!seen.has(manifest.node) || !seen.has(manifest.browser)) throw Error('LOGINOM_RESOURCES_INVALID');
  if (await realpath(process.execPath) !== await realpath(join(directory, manifest.node))) throw Error('LOGINOM_NODE_PATH_MISMATCH');
  return {
    manifest,
    nodePath: join(directory, manifest.node),
    browserPath: join(directory, manifest.browser),
    browserRoot: join(directory, 'browsers'),
    browserHash: manifest.files.find(file => file.path === manifest.browser).sha256,
    manifestHash: createHash('sha256').update(await readFile(join(directory, 'resource-manifest.json'))).digest('hex'),
  };
}
