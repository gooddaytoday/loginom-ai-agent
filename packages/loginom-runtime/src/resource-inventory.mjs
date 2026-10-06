import { createHash } from 'node:crypto';
import { readdir, readFile, readlink, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';

// Shared by release staging and small resource fixtures. No executable/browser is required.
export async function resourceInventory(root) {
  const canonical = await realpath(root);
  const files = [];
  async function collect(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)))) {
      if (directory === root && entry.name === 'resource-manifest.json') continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) { await collect(path); continue; }
      const target = relative(canonical, await realpath(path));
      if (target === '..' || target.startsWith('..' + sep) || isAbsolute(target))
        throw Error('LOGINOM_BUILD_RESOURCE_ESCAPE');
      const link = entry.isSymbolicLink() ? await readlink(path) : undefined;
      const directoryLink = link !== undefined && (await stat(path)).isDirectory();
      files.push({ path: relative(root, path).split(sep).join('/'),
        sha256: createHash('sha256').update(directoryLink ? link : await readFile(path)).digest('hex'),
        ...(link !== undefined ? { link } : {}), ...(directoryLink ? { directory: true } : {}) });
    }
  }
  await collect(root);
  return files;
}
