import { createHash } from 'node:crypto';
import { readFile, readdir, readlink, realpath, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep, win32 } from 'node:path';
import { parseDocument } from 'yaml';

// Shared by Host verification and the bundled runtime. Revision depends only
// on this skill's sorted relative paths and actual file hashes.
export function bundledSkillInventory(files) {
  const groups = new Map();
  const seen = new Set();
  for (const file of files.filter(file => file.path.startsWith('skills/'))) {
    const match = /^skills\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(.+)$/.exec(file.path);
    if (!match || seen.has(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256))
      throw Error('LOGINOM_SKILL_MANIFEST_INVALID');
    seen.add(file.path);
    const entries = groups.get(match[1]) ?? [];
    if (!groups.has(match[1])) groups.set(match[1], entries);
    entries.push(file);
  }
  return [...groups].flatMap(([name, entries]) => {
    const prefix = 'skills/' + name + '/';
    if (!entries.some(file => file.path === prefix + 'SKILL.md')) return [];
    const sorted = entries.toSorted((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
    return [{ name, files: sorted, digest: createHash('sha256')
      .update(JSON.stringify(sorted.map(file => [file.path.slice(prefix.length), file.sha256])))
      .digest('hex') }];
  });
}

// Host discovery and every bridge mode share the same installed-bundle contract.
// The manifest is a corruption check, not a signature against writers of the installation.
export async function verifyBundledSkills(resources, { mode = 'installed' } = {}) {
  if (!['installed', 'source'].includes(mode)) throw Error('LOGINOM_SKILL_RESOURCES_INVALID');
  if (typeof resources !== 'string' || !isAbsolute(resources) || !(await stat(resources)).isDirectory())
    throw Error('LOGINOM_SKILL_RESOURCES_INVALID');
  const root = await realpath(resources);
  let manifest;
  try { manifest = JSON.parse(await readFile(join(root, 'resource-manifest.json'), 'utf8')); }
  catch (error) { if (error instanceof SyntaxError) throw Error('LOGINOM_SKILL_MANIFEST_INVALID'); throw error; }
  if (!manifest || manifest.protocol !== 1 || !Array.isArray(manifest.files)
    || manifest.files.some(file => !file || typeof file.path !== 'string' || typeof file.sha256 !== 'string'))
    throw Error('LOGINOM_SKILL_MANIFEST_INVALID');
  const entries = manifest.files.filter(file => file.path.startsWith('skills/'));
  const skills = bundledSkillInventory(entries);
  const listed = new Set(entries.map(file => file.path));
  const actual = await readdir(join(root, 'skills'), { recursive: true, withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT' && entries.length === 0) return [];
    throw error;
  });
  for (const file of actual.filter(file => !file.isDirectory())) {
    if (!listed.has(relative(root, join(file.parentPath, file.name)).split(sep).join('/')))
      throw Error('LOGINOM_SKILL_UNMANIFESTED_FILE');
  }
  const contents = new Map();
  for (const file of entries) {
    if (file.path.includes('\\') || file.path.split('/').some(part => !part || part === '.' || part === '..'))
      throw Error('LOGINOM_SKILL_MANIFEST_INVALID');
    const absolute = await realpath(join(root, file.path));
    const inside = relative(join(root, 'skills', file.path.split('/')[1]), absolute);
    if (isAbsolute(inside) || inside === '..' || inside.startsWith('..' + sep))
      throw Error('LOGINOM_SKILL_RESOURCE_ESCAPE');
    const bytes = await readFile(absolute);
    if (createHash('sha256').update(bytes).digest('hex') !== file.sha256)
      throw Error('LOGINOM_SKILL_HASH_MISMATCH');
    contents.set(file.path, bytes.toString('utf8'));
  }
  for (const entry of entries.filter(file => /^skills\/[^/]+\/SKILL\.md$/.test(file.path))) {
    const prefix = dirname(entry.path) + '/';
    const files = new Map(entries.filter(file => file.path.startsWith(prefix))
      .map(file => [file.path.slice(prefix.length), contents.get(file.path)]));
    const result = validateSkillFiles(entry.path.split('/')[1], files, { source: mode === 'source' });
    if (result.errors.length) throw Error(result.errors[0].code);
  }
  return skills.map(skill => ({ ...skill, directory: join(root, 'skills', skill.name),
    location: join(root, 'skills', skill.name, 'SKILL.md'), content: contents.get('skills/' + skill.name + '/SKILL.md') }));
}

function outside(path) {
  return isAbsolute(path) || path === '..' || path.startsWith('..' + sep);
}

export async function inspectSkillFolder(directory, { external = false } = {}) {
  const files = new Map();
  const errors = [];
  try {
    const root = await realpath(directory);
    await visit(root);

    async function visit(parent) {
      for (const entry of await readdir(parent, { withFileTypes: true })) {
        if (entry.name === '.git') continue;
        const file = join(parent, entry.name);
        const path = relative(root, file).split(sep).join('/');
        if (entry.isDirectory()) {
          await visit(file);
          continue;
        }
        const absolute = entry.isSymbolicLink() ? await realpath(file) : file;
        if (outside(relative(root, absolute)) || (entry.isSymbolicLink() && win32.isAbsolute(await readlink(file)))) {
          errors.push({ code: 'LOGINOM_SKILL_RESOURCE_ESCAPE', path, message: 'Link leaves the portable skill folder.' });
          continue;
        }
        if (!entry.isFile() && !(entry.isSymbolicLink() && (await stat(absolute)).isFile())) continue;
        files.set(path, path.endsWith('.md') ? await readFile(absolute, 'utf8') : undefined);
      }
    }
  } catch {
    errors.push({ code: 'LOGINOM_SKILL_FOLDER_UNREADABLE', message: 'Could not read the skill folder or one of its resources.' });
  }
  if (errors.length) return { errors, warnings: [] };
  return validateSkillFiles(basename(resolve(directory)), files, { external });
}

function validateSkillFiles(directoryName, files, { external = false, source = false } = {}) {
  const errors = [];
  const warnings = [];
  const invalid = message => ({ code: 'LOGINOM_SKILL_FRONTMATTER_INVALID', path: 'SKILL.md', message });
  const format = message => (external ? warnings : errors).push(invalid(message));
  const content = files.get('SKILL.md');
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  const data = frontmatter && parseMetadata(frontmatter[1]);
  if (!data || typeof data.name !== 'string' || !safeName(data.name)
    || typeof data.description !== 'string' || !data.description.trim()) {
    errors.push(invalid('SKILL.md needs a valid YAML header with a safe name and a non-empty text description.'));
    return { errors, warnings };
  }
  if (directoryName !== data.name) format('The skill name must match the folder name.');
  if (data.name.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.name))
    format('Use 1–64 lowercase ASCII letters, digits and single internal hyphens in the name.');
  if (data.description.length > 1024) format('Keep the description within 1024 characters.');
  const fields = ['name', 'description', 'license', 'allowed-tools', 'metadata', 'compatibility'];
  for (const key of Object.keys(data).filter(key => !fields.includes(key))) format('Unrecognized YAML field: ' + key);
  if (data.compatibility !== undefined && (typeof data.compatibility !== 'string'
    || !data.compatibility.trim() || data.compatibility.length > 500))
    format('Compatibility must be text of 1–500 characters when provided.');
  for (const key of ['license', 'allowed-tools']) {
    if (data[key] !== undefined && typeof data[key] !== 'string') format(key + ' must be text.');
  }
  if (data.metadata !== undefined && (!data.metadata || typeof data.metadata !== 'object'
    || Array.isArray(data.metadata) || Object.values(data.metadata).some(value => typeof value !== 'string')))
    format('Metadata must be a map with text values.');
  if (content.slice(frontmatter[0].length).trimEnd().split(/\r?\n/).length > 500)
    warnings.push({ code: 'LOGINOM_SKILL_LENGTH', path: 'SKILL.md', message: 'Consider moving details into a linked reference to keep SKILL.md under 500 lines.' });

  const generated = typeof data.metadata?.['loginom-generated'] === 'string' ? data.metadata['loginom-generated'] : undefined;
  const deferred = source && generated ? resourcePath('SKILL.md', generated) : undefined;
  if (generated && !external) requireResource('SKILL.md', generated);
  for (const [path, markdown] of files) {
    if (!path.endsWith('.md') || markdown === undefined) continue;
    for (const link of markdown.matchAll(/\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\)/g)) {
      const target = link[1] ?? link[2];
      if (/^(?:https?:|viking:|mailto:|#)/i.test(target)) continue;
      requireResource(path, target);
    }
  }
  return { data, errors, warnings };

  function requireResource(path, target) {
    const key = resourcePath(path, target);
    if (!key) {
      errors.push({ code: 'LOGINOM_SKILL_RESOURCE_ESCAPE', path, message: 'Unsafe local resource path: ' + target });
      return;
    }
    if (!files.has(key) && key !== deferred) {
      (external ? warnings : errors).push({
        code: 'LOGINOM_SKILL_REQUIRED_RESOURCE_MISSING', path, message: 'Missing local resource: ' + target,
      });
    }
  }
}

function parseMetadata(header) {
  const document = parseDocument(header, { stringKeys: true });
  if (document.errors.length || document.warnings.length) return;
  try {
    const data = document.toJS({ maxAliasCount: 0 });
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch {
    return;
  }
}

function safeName(name) {
  return /^[\p{L}\p{M}\p{N}_.-]+$/u.test(name) && !name.startsWith('.') && !name.endsWith('.')
    && !/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name)
    && !Object.hasOwn(Object.prototype, name) && Buffer.byteLength(name) <= 255;
}

function resourcePath(file, target) {
  try {
    const local = decodeURIComponent(target.split(/[?#]/)[0]);
    if (!local || /[:\\\u0000]/.test(local) || win32.isAbsolute(local)) return;
    const inside = posix.join(posix.dirname(file), local);
    if (inside !== '.' && inside !== '..' && !inside.startsWith('../')) return inside;
  } catch {
    return;
  }
}
