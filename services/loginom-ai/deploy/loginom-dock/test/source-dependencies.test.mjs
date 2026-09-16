import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { loadParser, importsOf, reviewDependencies } from '../review-source-dependencies.mjs';

const parserPath = process.env.DOCK_REVIEW_TYPESCRIPT;
assert.ok(parserPath, 'Set DOCK_REVIEW_TYPESCRIPT to the reviewed typescript.js parser');
const sha = text => createHash('sha256').update(text).digest('hex');
const parserSha256 = sha(readFileSync(parserPath));
const ts = loadParser(parserPath, parserSha256);
function fixture(t, files) {
  const repository = mkdtempSync(join(tmpdir(), 'dock-source-review-'));
  t.after(() => rmSync(repository, { recursive: true, force: true }));
  const git = args => execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git(['init', '-q']);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(repository, path)), { recursive: true });
    writeFileSync(join(repository, path), text);
  }
  git(['add', '.']); git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@invalid', 'commit', '-qm', 'Fixture']);
  const index = { e2e_commit: git(['rev-parse', 'HEAD']), source_files: { 'root.ts': sha(files['root.ts']) },
    dependencies: { 'node.add': { files: ['root.ts'], selectors: [] } } };
  return { repository, index, git, run: (override = {}) => reviewDependencies({ repository, index, ts, parserSha256, ...override }) };
}

test('static parser ignores comments/strings and reads reexports, types and load forms', () => {
  const imports = importsOf(ts, `// import 'fake';\nconst text = "require('fake')";\nimport type { A } from './a';\nexport * from './b';\nimport c = require('./c');\ntype D = import('./d').D;\nconst e = import('./e');\nrequire('./f');`, 'root.ts');
  assert.deepEqual(imports.map(x => x.specifier), ['./a', './b', './c', './d', './e', './f']);
  assert.equal(imports[0].line, 3);
});

test('pinned Git blobs give deterministic transitive closure despite dirty checkout', t => {
  const f = fixture(t, { 'root.ts': "import { b } from './lib'; export { c } from './leaf';", 'lib/index.ts': "export { c as b } from '../leaf';", 'leaf.ts': 'export const c = 1;' });
  const before = f.run();
  writeFileSync(join(f.repository, 'leaf.ts'), "import './missing';");
  assert.deepEqual(f.run(), before);
  assert.deepEqual(before.actions['node.add'].files, ['leaf.ts', 'lib/index.ts', 'root.ts']);
  assert.equal(before.source_files['leaf.ts'].sha256, sha('export const c = 1;'));
  assert.equal(before.admission_eligible, false);
  assert.equal(before.status, 'SOURCE_REVIEW_REQUIRED');
  assert.equal(before.parser.sha256, parserSha256);
});

test('cycles terminate explicitly without claiming acyclic or reviewed sources', t => {
  const f = fixture(t, { 'root.ts': "import './b';", 'b.ts': "export * from './root';" });
  const report = f.run();
  assert.deepEqual(report.cycles, [['root.ts', 'b.ts', 'root.ts']]);
  assert.equal(Object.keys(report.source_files).length, 2);
  assert.equal(report.actions['node.add'].review_required, true);
});

test('external packages and possible aliases remain unresolved review items', t => {
  const f = fixture(t, { 'root.ts': "import fs from 'node:fs'; import { x } from '@helpers/foo';" });
  assert.deepEqual(f.run().external.map(x => x.specifier), ['node:fs', '@helpers/foo']);
});

for (const [name, files, expected] of [
  ['missing', { 'root.ts': "import './missing';" }, /Missing import/],
  ['escape', { 'root.ts': "import '../outside';" }, /escapes/],
  ['absolute', { 'root.ts': "import '/outside';" }, /Unsafe import/],
  ['ambiguous', { 'root.ts': "import './leaf';", 'leaf.ts': '', 'leaf.js': '' }, /Ambiguous/],
  ['nonliteral dynamic import', { 'root.ts': 'import(name);' }, /Nonliteral/],
  ['nonliteral require', { 'root.ts': 'require(name);' }, /Nonliteral/],
  ['unsupported extension', { 'root.ts': "import './data.json';", 'data.json': '{}' }, /Unsupported source extension/],
  ['syntax error', { 'root.ts': 'import {' }, /syntax diagnostics/],
]) test(`${name} fails without returning a partial success inventory`, t => {
  const f = fixture(t, files); assert.throws(() => f.run(), expected);
});

test('declared root hashes, paths, dependency roots and traversal budgets fail closed', t => {
  const f = fixture(t, { 'root.ts': "import './b';", 'b.ts': '' });
  const index = structuredClone(f.index); index.source_files['root.ts'] = '0'.repeat(64);
  assert.throws(() => f.run({ index }), /hash mismatch/);
  const badPath = structuredClone(f.index); badPath.source_files['../root.ts'] = '0'.repeat(64);
  assert.throws(() => f.run({ index: badPath }), /Unsafe source path/);
  const badRoot = structuredClone(f.index); badRoot.dependencies['node.add'].files = ['b.ts'];
  assert.throws(() => f.run({ index: badRoot }), /Undeclared action root/);
  assert.throws(() => f.run({ maxFiles: 1 }), /budget exceeded/);
  assert.throws(() => f.run({ maxBytes: 1 }), /budget exceeded/);
});

test('Git symlinks are refused without reading their destination', t => {
  const f = fixture(t, { 'root.ts': "import './link';" });
  symlinkSync('/arbitrary/private/file', join(f.repository, 'link.ts'));
  f.git(['add', '.']); f.git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@invalid', 'commit', '-qm', 'Link']);
  f.index.e2e_commit = f.git(['rev-parse', 'HEAD']);
  assert.throws(() => f.run(), /nonregular/);
});

test('parser hash checked before parser execution', () => {
  assert.throws(() => loadParser(parserPath, '0'.repeat(64)), /parser SHA mismatch/);
});

test('review tool CLI requires exclusive output and leaves catalogs unchanged', t => {
  const f = fixture(t, { 'root.ts': 'export const x = 1;' });
  const indexPath = join(f.repository, 'source-index.json'), out = join(f.repository, 'review.json');
  const before = JSON.stringify(f.index); writeFileSync(indexPath, before);
  const tool = new URL('../review-source-dependencies.mjs', import.meta.url).pathname;
  const args = [tool, '--repository', f.repository, '--index', indexPath, '--typescript', parserPath, '--typescript-sha256', parserSha256, '--out', out];
  execFileSync(process.execPath, args);
  assert.equal(readFileSync(indexPath, 'utf8'), before);
  const report = readFileSync(out, 'utf8');
  assert.throws(() => execFileSync(process.execPath, args, { stdio: 'pipe' }), /EEXIST/);
  assert.equal(readFileSync(out, 'utf8'), report);
});


test('submodule Gitlink requires a separately reviewed dependency source', t => {
  const f = fixture(t, { 'root.ts': "import './vendor/consts';" });
  f.git(['update-index', '--add', '--cacheinfo', `160000,${f.index.e2e_commit},vendor`]);
  f.git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@invalid', 'commit', '-qm', 'Gitlink']);
  f.index.e2e_commit = f.git(['rev-parse', 'HEAD']);
  assert.throws(() => f.run(), /Submodule dependency requires separately reviewed pin: vendor@/);
});

test('explicit local submodule pins bind exact Gitlink and never dirty submodule files', t => {
  const child = fixture(t, { 'root.ts': "export const x = 'committed';" });
  const parent = fixture(t, { 'root.ts': "export { x } from './vendor/root';" });
  parent.git(['update-index', '--add', '--cacheinfo', `160000,${child.index.e2e_commit},vendor`]);
  parent.git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@invalid', 'commit', '-qm', 'Gitlink']);
  parent.index.e2e_commit = parent.git(['rev-parse', 'HEAD']);
  const submodules = { schema_version: 1, e2e_commit: parent.index.e2e_commit,
    pins: [{ path: 'vendor', commit: child.index.e2e_commit, repository: child.repository }] };
  const result = parent.run({ submodules });
  assert.deepEqual(result.actions['node.add'].files, ['root.ts', 'vendor/root.ts']);
  assert.deepEqual(result.source_files['vendor/root.ts'].source, { mount: 'vendor', commit: child.index.e2e_commit, path: 'root.ts' });
  writeFileSync(join(child.repository, 'root.ts'), "import './untracked';");
  assert.deepEqual(parent.run({ submodules }), result);
  for (const change of [
    s => { s.e2e_commit = '0'.repeat(40); },
    s => { s.pins[0].commit = '0'.repeat(40); },
    s => { s.pins[0].path = '../vendor'; },
    s => { s.pins[0].path = 'root.ts'; },
    s => { s.pins.push({ ...s.pins[0] }); },
    s => { s.pins[0].repository = 'relative'; },
    s => { s.pins[0].extra = true; },
  ]) {
    const invalid = structuredClone(submodules); change(invalid);
    assert.throws(() => parent.run({ submodules: invalid }), /[Ii]nvalid|mismatch/);
  }
});
