#!/usr/bin/env node
// Offline review aid. Never imports E2E code or writes a catalog/admission.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const safePath = path => typeof path === 'string' && path.length > 0 && path.length < 1024
  && !path.startsWith('/') && !/[\\\x00-\x1f\x7f:]/.test(path)
  && !path.split('/').some(part => !part || part === '.' || part === '..');
const fail = message => { throw new Error(message); };

export function loadParser(path, expectedSha) {
  if (!/^[a-f0-9]{64}$/.test(expectedSha ?? '') || digest(readFileSync(path)) !== expectedSha)
    fail('TypeScript parser SHA mismatch');
  const ts = createRequire(import.meta.url)(resolve(path));
  if (typeof ts.createSourceFile !== 'function' || typeof ts.version !== 'string') fail('Invalid TypeScript parser');
  return ts;
}

export function importsOf(ts, text, path) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  if (source.parseDiagnostics.length) fail(`TypeScript syntax diagnostics: ${path}`);
  const imports = [];
  const add = (node, kind) => {
    if (!node || !ts.isStringLiteralLike(node)) fail(`Nonliteral ${kind}: ${path}`);
    imports.push({ specifier: node.text, kind, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
  };
  const visit = node => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) add(node.moduleSpecifier, ts.isImportDeclaration(node) ? 'import' : 'export');
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node.moduleReference.expression, 'import_equals');
    } else if (ts.isImportTypeNode(node)) {
      add(ts.isLiteralTypeNode(node.argument) ? node.argument.literal : null, 'import_type');
    } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      if (node.arguments.length !== 1) fail(`Unsupported import call: ${path}`);
      add(node.arguments[0], 'load');
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  for (const ref of source.referencedFiles) imports.push({ specifier: ref.fileName, kind: 'reference_path', line: source.getLineAndCharacterOfPosition(ref.pos).line + 1 });
  for (const ref of [...source.typeReferenceDirectives, ...source.libReferenceDirectives])
    imports.push({ specifier: ref.fileName, kind: 'external_reference', line: source.getLineAndCharacterOfPosition(ref.pos).line + 1 });
  return imports;
}

export function reviewDependencies({ repository, index, ts, parserSha256, submodules, maxFiles = 1000, maxBytes = 32 * 1024 * 1024 }) {
  if (!/^[a-f0-9]{40}$/.test(index?.e2e_commit ?? '') || !index.source_files || !index.dependencies)
    fail('Invalid pinned source index');
  const commit = index.e2e_commit;
  const gitFor = path => args => execFileSync('git', ['-C', resolve(path), ...args], { maxBuffer: 40 * 1024 * 1024, timeout: 30000,
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' } });
  const tree = new Map(), mounted = [];
  const mount = (path, revision, prefix = '') => {
    const git = gitFor(path);
    if (git(['rev-parse', `${revision}^{commit}`]).toString().trim() !== revision) fail('Commit identity mismatch');
    for (const entry of git(['ls-tree', '-rz', '--full-tree', revision]).toString('utf8').split('\0').filter(Boolean)) {
      const match = /^(\d+) (\w+) ([a-f0-9]{40})\t(.+)$/.exec(entry);
      if (!match || !safePath(match[4])) fail('Invalid Git tree entry');
      const virtual = prefix ? `${prefix}/${match[4]}` : match[4];
      if (tree.has(virtual)) fail('Overlapping submodule source');
      tree.set(virtual, { mode: match[1], type: match[2], oid: match[3], git,
        source: { mount: prefix, commit: revision, path: match[4] } });
    }
  };
  mount(repository, commit);
  if (submodules !== undefined) {
    if (submodules?.schema_version !== 1 || submodules.e2e_commit !== commit || !Array.isArray(submodules.pins)
      || submodules.pins.length > 32 || Object.keys(submodules).sort().join(',') !== 'e2e_commit,pins,schema_version') fail('Invalid submodule manifest');
    const seen = new Set();
    for (const pin of [...submodules.pins].sort((a,b) => String(a.path).split('/').length - String(b.path).split('/').length || String(a.path).localeCompare(String(b.path)))) {
      if (!safePath(pin?.path) || !/^[a-f0-9]{40}$/.test(pin.commit ?? '') || typeof pin.repository !== 'string'
        || !pin.repository.startsWith('/') || Object.keys(pin).sort().join(',') !== 'commit,path,repository'
        || seen.has(pin.path)) fail('Invalid or duplicate submodule pin');
      seen.add(pin.path);
      const link = tree.get(pin.path);
      if (link?.type !== 'commit' || link.mode !== '160000' || link.oid !== pin.commit) fail(`Submodule Gitlink pin mismatch: ${pin.path}`);
      mount(pin.repository, pin.commit, pin.path);
      mounted.push({ path: pin.path, commit: pin.commit, parent_commit: link.source.commit });
    }
  }
  const files = new Map(), edges = [], external = [], cycles = [], active = [];
  let bytesRead = 0;
  const read = path => {
    if (!safePath(path)) fail(`Unsafe source path: ${JSON.stringify(path)}`);
    const entry = tree.get(path);
    if (!entry || entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) fail(`Missing or nonregular source: ${path}`);
    const bytes = entry.git(['cat-file', 'blob', entry.oid]);
    bytesRead += bytes.length;
    if (bytesRead > maxBytes) fail('Source byte budget exceeded');
    return { bytes, sha256: digest(bytes), git_blob: entry.oid, source: entry.source };
  };
  const resolveImport = (owner, imp) => {
    const spec = imp.specifier;
    if (/[\\\x00-\x1f\x7f]/.test(spec) || !spec || spec.startsWith('/') || /^[a-zA-Z]:/.test(spec)) fail(`Unsafe import in ${owner}`);
    if (imp.kind === 'external_reference') return null;
    if (!spec.startsWith('.') && imp.kind !== 'reference_path') return null;
    const base = posix.normalize(posix.join(posix.dirname(owner), spec));
    if (!safePath(base)) fail(`Import escapes repository: ${owner}`);
    for (const [prefix, entry] of tree) {
      if (entry.type === 'commit' && !mounted.some(pin => pin.path === prefix) && (base === prefix || base.startsWith(prefix + '/')))
        fail(`Submodule dependency requires separately reviewed pin: ${prefix}@${entry.oid}`);
    }
    const ext = posix.extname(base);
    const candidates = ext ? [base] : ['.ts', '.tsx', '.js', '.jsx', '.d.ts', '/index.ts', '/index.tsx', '/index.js'].map(suffix => base + suffix);
    const matches = candidates.filter(path => tree.has(path));
    if (matches.length !== 1) fail(`${matches.length ? 'Ambiguous' : 'Missing'} import: ${owner} -> ${spec}`);
    return matches[0];
  };
  const visit = path => {
    if (active.includes(path)) { cycles.push([...active.slice(active.indexOf(path)), path]); return; }
    if (files.has(path)) return;
    if (files.size >= maxFiles || active.length >= 256) fail('Source traversal budget exceeded');
    const file = read(path);
    if (!/\.(?:ts|tsx|js|jsx)$/.test(path)) fail(`Unsupported source extension: ${path}`);
    files.set(path, { sha256: file.sha256, git_blob: file.git_blob, bytes: file.bytes.length, source: file.source });
    active.push(path);
    for (const imp of importsOf(ts, file.bytes.toString('utf8'), path)) {
      const target = resolveImport(path, imp);
      if (target === null) { external.push({ from: path, ...imp, review_required: true }); continue; }
      edges.push({ from: path, to: target, ...imp });
      visit(target);
    }
    active.pop();
  };
  // All declared source hashes are checked, including roots not assigned to an action.
  for (const path of Object.keys(index.source_files).sort()) {
    if (!/^[a-f0-9]{64}$/.test(index.source_files[path])) fail('Invalid source hash');
    visit(path);
    if (files.get(path).sha256 !== index.source_files[path]) fail(`Pinned source hash mismatch: ${path}`);
  }
  const actions = {};
  for (const [action, dependency] of Object.entries(index.dependencies).sort()) {
    if (!Array.isArray(dependency.files) || !dependency.files.length || new Set(dependency.files).size !== dependency.files.length) fail('Invalid action roots');
    for (const root of dependency.files) if (!Object.hasOwn(index.source_files, root)) fail(`Undeclared action root: ${action}`);
    const reachable = new Set();
    const collect = path => { if (reachable.has(path)) return; reachable.add(path); for (const edge of edges) if (edge.from === path) collect(edge.to); };
    dependency.files.forEach(collect);
    actions[action] = { roots: [...dependency.files].sort(), files: [...reachable].sort(), review_required: true };
  }
  return { schema_version: 1, status: 'SOURCE_REVIEW_REQUIRED', admission_eligible: false,
    e2e_commit: commit, submodule_pins: mounted, source_index_sha256: digest(JSON.stringify(index)),
    parser: { name: 'typescript', version: ts.version, sha256: parserSha256 },
    resolution: 'relative-exact-or-unique-ts-js-index; bare imports require external-or-alias review',
    source_files: Object.fromEntries([...files].sort()), actions, edges, external, cycles,
    limitations: ['No source execution, importer, catalog rewrite, stale promotion, live verification or admission.',
      'External packages, aliases and library/type references are review items; their contents are not traversed.',
      'Resolution is deliberately stricter than TypeScript; unsupported extensions and nonliteral loads fail.'] };
}

function main() {
  const { values } = parseArgs({ options: { repository: { type: 'string' }, index: { type: 'string' },
    typescript: { type: 'string' }, 'submodules': { type: 'string' }, 'typescript-sha256': { type: 'string' }, out: { type: 'string' } } });
  if (!['repository', 'index', 'typescript', 'typescript-sha256', 'out'].every(key => values[key])) fail('Required: --repository --index --typescript --typescript-sha256 --out');
  const ts = loadParser(values.typescript, values['typescript-sha256']);
  const report = reviewDependencies({ repository: values.repository, index: JSON.parse(readFileSync(values.index, 'utf8')),
    ts, parserSha256: values['typescript-sha256'],
    submodules: values.submodules ? JSON.parse(readFileSync(values.submodules, 'utf8')) : undefined });
  writeFileSync(values.out, JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  process.stdout.write(JSON.stringify({ status: report.status, files: Object.keys(report.source_files).length,
    actions: Object.keys(report.actions).length, cycles: report.cycles.length, external: report.external.length }) + '\n');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
