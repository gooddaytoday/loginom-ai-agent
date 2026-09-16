import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, readdir, readFile, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSkillLoader, validateManifest, manifestRevision, skillUri, skillTransport } from '../lib/skill.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture(content = '# Loginom\nРусский текст 😀\n') {
  const bytes = new Map([['SKILL.md', Buffer.from(content)], ['references/связь.md', Buffer.from('reference')]]);
  const files = [{ path: 'references', uri: `${skillUri}/references`, is_dir: true },
    ...[...bytes].map(([path, data]) => ({ path, uri: `${skillUri}/${path}`, is_dir: false, size: data.length, sha256: hash(data) }))];
  const detail = { files, content, content_sha256: hash(bytes.get('SKILL.md')), revision: manifestRevision(files) };
  return { bytes, detail, transport: { async manifest() { return structuredClone(detail); }, async download(file) { return bytes.get(file.path); } } };
}
async function sandbox(t) {
  const directory = await mkdtemp(join(tmpdir(), 'dock-skill-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('complete package activates once, remains pinned and supports concurrent prepare', async t => {
  const directory = await sandbox(t);
  const source = fixture();
  let reads = 0;
  source.transport.manifest = async () => { reads++; return structuredClone(source.detail); };
  const loader = createSkillLoader({ directory, transport: source.transport });
  const [a, b] = await Promise.all([loader.prepare(), loader.prepare()]);
  assert.equal(a, b);
  assert.equal(reads, 2);
  assert.equal(await readFile(a.main, 'utf8'), source.detail.content);
  source.detail = fixture('new revision').detail;
  const pinned = await loader.prepare();
  assert.equal(pinned, a);
  assert.equal(reads, 2);
  assert.deepEqual(await readdir(directory), [`skill-${a.detail.revision}`]);
});

test('unsafe paths, case collisions, parent conflicts and dishonest revision fail before download', () => {
  for (const path of ['../escape', '/absolute', 'a\\b', 'a/%2e%2e', 'a\0b', 'a:b', 'a//b', 'a/./b', 'trailing.', 'e\u0301']) {
    const { detail } = fixture();
    detail.files.push({ path, uri: `${skillUri}/${path}`, is_dir: true });
    detail.revision = manifestRevision(detail.files);
    assert.throws(() => validateManifest(detail), /Unsafe/);
  }
  for (const mutate of [
    d => d.files.push({ ...d.files[1], path: 'skill.md', uri: `${skillUri}/skill.md` }),
    d => d.files.splice(0, 1),
    d => { d.files[2].path = 'References/связь.md'; d.files[2].uri = `${skillUri}/${d.files[2].path}`; },
    d => { d.files[1].uri = 'viking://resources/elsewhere/SKILL.md'; },
    d => { d.files[1].size = 64 * 1024 * 1024; },
    d => { d.content = 'changed'; },
  ]) {
    const { detail } = fixture(); mutate(detail);
    detail.revision = manifestRevision(detail.files);
    assert.throws(() => validateManifest(detail));
  }
  const { detail } = fixture(); detail.revision = '0'.repeat(64);
  assert.throws(() => validateManifest(detail), /integrity/);
});

test('bad bytes or server revision race leaves no partial cache and permits retry', async t => {
  for (const failure of ['bytes', 'revision']) {
    const directory = await sandbox(t);
    const source = fixture(); let reads = 0;
    const loader = createSkillLoader({ directory, transport: {
      async manifest() { reads++; return reads > 1 && failure === 'revision' ? fixture('changed').detail : source.detail; },
      async download(file) { return failure === 'bytes' ? Buffer.from('bad') : source.bytes.get(file.path); },
    } });
    await assert.rejects(loader.prepare(), /integrity|changed during/);
    assert.deepEqual(await readdir(directory), []);
    const retry = createSkillLoader({ directory, transport: source.transport });
    assert.equal((await retry.prepare()).detail.revision, source.detail.revision);
  }
});

test('pinned package detects local modification and symlink substitution', async t => {
  for (const change of ['content', 'symlink', 'extra']) {
    const directory = await sandbox(t);
    const source = fixture();
    const loader = createSkillLoader({ directory, transport: source.transport });
    const pinned = await loader.prepare();
    if (change === 'content') await writeFile(pinned.main, 'tampered');
    if (change === 'extra') await writeFile(join(pinned.directory, 'extra'), 'extra');
    if (change === 'symlink') {
      await rm(pinned.main);
      await symlink('/etc/hosts', pinned.main);
    }
    await assert.rejects(loader.prepare(), /cache/);
  }
});

test('transport uses only configured origin, rejects redirects and bounds streaming bytes', async () => {
  const config = { endpoint: 'https://dock.example/mcp', apiKey: 'fixture-secret' };
  let request;
  const transport = skillTransport(config, async (url, options) => {
    request = { url, options };
    return new Response('12345');
  });
  await assert.rejects(transport.download({ uri: `${skillUri}/SKILL.md`, size: 4 }), /size limit/);
  assert.equal(request.url.origin, 'https://dock.example');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.headers.Authorization, 'Bearer fixture-secret');
  const failed = skillTransport(config, async () => { throw new Error('fixture-secret'); });
  await assert.rejects(failed.manifest(), error => !error.message.includes(config.apiKey));
});

test('skill GET retries one interrupted connection but does not retry rejected credentials', async () => {
  const config = { endpoint: 'https://dock.example/mcp', apiKey: 'fixture-secret' };
  let attempts = 0;
  const interrupted = skillTransport(config, async () => {
    if (++attempts === 1) throw new Error('connection interrupted');
    return new Response('ok');
  });
  assert.equal((await interrupted.download({ uri: `${skillUri}/SKILL.md`, size: 2 })).toString(), 'ok');
  assert.equal(attempts, 2);
  attempts = 0;
  const rejected = skillTransport(config, async () => { attempts++; return new Response('', { status: 401 }); });
  await assert.rejects(rejected.manifest(), /401/);
  assert.equal(attempts, 1);
});
