import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resourceInventory } from '../../../src/resource-inventory.mjs';

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
  const files = await resourceInventory(resources);
  await writeFile(join(resources, 'resource-manifest.json'), JSON.stringify({ protocol: 1, files }));
  return files;
}
