import test from 'node:test';
import assert from 'node:assert/strict';
import { rm, readFile, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createSkillLoader } from '../lib/skill.mjs';
import { bundledSkillInventory } from '../lib/bundled-skill-manifest.mjs';
import { createBundledSkillFixture, refreshSkillFixtureManifest } from './support/bundled-skill-fixture.mjs';

test('local product skill preparation never reads the Skills API and returns the shared revision', async t => {
  const source = await createBundledSkillFixture(t);
  let requests = 0;
  const loader = createSkillLoader({ resources: source.resources, transport: {
    async manifest() { requests++; throw Error('Skills API must not be called'); },
    async download() { requests++; throw Error('Skills API must not be called'); },
  } });
  const [first, second] = await Promise.all([loader.prepare(), loader.prepare()]);
  assert.equal(requests, 0);
  assert.equal(first, second);
  assert.equal(first.directory, source.directory);
  assert.equal(first.main, source.main);
  assert.equal(first.detail.revision, bundledSkillInventory(source.files)[0].digest);
  assert.equal(first.detail.source, 'bundled');
  assert.equal(first.detail.files.length, source.files.length);
  assert.equal(first.detail.content_sha256, source.files.find(file => file.path.endsWith('/SKILL.md')).sha256);
  assert.equal(first.detail.content, await readFile(source.main, 'utf8'));
  assert.equal(await loader.prepare(), first);
});

test('local preparation rejects a skill file not covered by the resource manifest', async t => {
  const source = await createBundledSkillFixture(t);
  await writeFile(join(source.directory, 'unlisted.mjs'), 'unlisted');
  await assert.rejects(createSkillLoader({ resources: source.resources }).prepare(), /LOGINOM_SKILL_UNMANIFESTED_FILE/);
});

test('pinned local bundle rejects modified bytes, missing files and escaping symlinks', async t => {
  for (const change of ['content', 'missing', 'symlink']) {
    const source = await createBundledSkillFixture(t);
    const loader = createSkillLoader({ resources: source.resources });
    await loader.prepare();
    if (change === 'content') await writeFile(source.main, 'tampered');
    if (change === 'missing' || change === 'symlink') await rm(source.main);
    if (change === 'symlink') await symlink('/etc/hosts', source.main);
    await assert.rejects(loader.prepare(), change === 'content' ? /LOGINOM_SKILL_HASH_MISMATCH/
      : change === 'symlink' ? /LOGINOM_SKILL_RESOURCE_ESCAPE/ : { code: 'ENOENT' });
  }
});

test('bundle replacement cannot change the revision pinned by the chat', async t => {
  const source = await createBundledSkillFixture(t);
  const loader = createSkillLoader({ resources: source.resources });
  const first = await loader.prepare();
  await writeFile(source.main, first.detail.content + '\nNew product revision.\n');
  await refreshSkillFixtureManifest(source.resources);
  await assert.rejects(loader.prepare(), /LOGINOM_SKILL_REVISION_CHANGED/);
  assert.notEqual((await createSkillLoader({ resources: source.resources }).prepare()).detail.revision, first.detail.revision);
});

test('manifest entry order cannot change a pinned skill revision', async t => {
  const source = await createBundledSkillFixture(t);
  const loader = createSkillLoader({ resources: source.resources });
  const first = await loader.prepare();
  await writeFile(join(source.resources, 'resource-manifest.json'), JSON.stringify({ protocol: 1, files: source.files.toReversed() }));
  assert.equal(await loader.prepare(), first);
});

test('invalid resource roots fail locally and never use the legacy transport', async () => {
  for (const resources of [undefined, '', 'relative/resources', '/nonexistent/loginom-product-skills']) {
    let requests = 0;
    const loader = createSkillLoader({ resources, transport: { async manifest() { requests++; throw Error('Unexpected network'); } } });
    await assert.rejects(loader.prepare(), resources?.startsWith('/') ? { code: 'ENOENT' } : /LOGINOM_SKILL_RESOURCES_INVALID/);
    assert.equal(requests, 0);
  }
});

test('unsafe manifest paths and duplicate entries fail before file reads', async t => {
  const source = await createBundledSkillFixture(t);
  for (const path of ['skills/loginom-automation/../escape', 'skills/loginom-automation/a\\b',
    'skills/loginom-automation/a//b', 'skills/loginom-automation/./x']) {
    await writeFile(join(source.resources, 'resource-manifest.json'), JSON.stringify({ protocol: 1,
      files: [{ path, sha256: '0'.repeat(64) }, ...source.files] }));
    await assert.rejects(createSkillLoader({ resources: source.resources }).prepare(), /LOGINOM_SKILL_MANIFEST_INVALID/);
  }
  await writeFile(join(source.resources, 'resource-manifest.json'), JSON.stringify({ protocol: 1,
    files: [...source.files, source.files[0]] }));
  await assert.rejects(createSkillLoader({ resources: source.resources }).prepare(), /LOGINOM_SKILL_MANIFEST_INVALID/);
});
