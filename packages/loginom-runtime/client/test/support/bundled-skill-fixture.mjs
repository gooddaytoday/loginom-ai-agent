import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';

// Real product instructions and references, in an independent resource root.
export async function createBundledSkillFixture(t) {
  const resources = await mkdtemp(join(tmpdir(), 'loginom-product-skill-'));
  t.after(() => rm(resources, { recursive: true, force: true }));
  const directory = join(resources, 'skills/loginom-automation');
  await mkdir(join(resources, 'skills'));
  await cp(new URL('../../../../product/skills/loginom-automation/', import.meta.url), directory, { recursive: true });
  const files = await refreshSkillFixtureManifest(resources);
  return { resources, directory, main: join(directory, 'SKILL.md'), files };
}

export async function refreshSkillFixtureManifest(resources) {
  const entries = await readdir(join(resources, 'skills'), { recursive: true, withFileTypes: true });
  const files = await Promise.all(entries.filter(entry => entry.isFile()).map(async entry => {
    const path = join(entry.parentPath, entry.name);
    return { path: relative(resources, path).split(sep).join('/'),
      sha256: createHash('sha256').update(await readFile(path)).digest('hex') };
  }));
  await writeFile(join(resources, 'resource-manifest.json'), JSON.stringify({ protocol: 1, files }));
  return files;
}
