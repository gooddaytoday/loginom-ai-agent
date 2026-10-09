import { createHash } from 'node:crypto';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
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
    const directory = join(root, dirname(entry.path));
    const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(contents.get(entry.path))?.[1];
    if (!header) throw Error('LOGINOM_SKILL_FRONTMATTER_INVALID');
    const yaml = parseDocument(header);
    if (yaml.errors.length) throw Error('LOGINOM_SKILL_FRONTMATTER_INVALID');
    const data = yaml.toJS();
    const fields = ['name', 'description', 'license', 'allowed-tools', 'metadata', 'compatibility'];
    if (!data || typeof data !== 'object' || data.name !== entry.path.split('/')[1]
      || data.name.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.name)
      || Object.keys(data).some(key => !fields.includes(key))
      || typeof data.description !== 'string' || !data.description.trim() || data.description.length > 1024
      || (data.compatibility !== undefined && (typeof data.compatibility !== 'string' || data.compatibility.length > 500))
      || ['license', 'allowed-tools'].some(key => data[key] !== undefined && typeof data[key] !== 'string')
      || (data.metadata !== undefined && (!data.metadata || typeof data.metadata !== 'object'
        || Array.isArray(data.metadata) || Object.values(data.metadata).some(value => typeof value !== 'string'))))
      throw Error('LOGINOM_SKILL_FRONTMATTER_INVALID');
    const generated = data.metadata?.['loginom-generated'];
    const allowedMissing = mode === 'source' && generated
      ? new Set([relative(root, resolve(directory, decodeURIComponent(generated.split(/[?#]/)[0]))).split(sep).join('/')])
      : new Set();
    if (generated) requireResource(root, directory, directory, generated, listed, allowedMissing);
    for (const markdown of entries.filter(file => file.path.startsWith(dirname(entry.path) + '/') && file.path.endsWith('.md'))) {
      for (const link of contents.get(markdown.path).matchAll(/\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\)/g)) {
        const target = link[1] ?? link[2];
        if (/^(?:https?:|viking:|mailto:|#)/i.test(target)) continue;
        requireResource(root, directory, dirname(join(root, markdown.path)), target, listed, allowedMissing);
      }
    }
  }
  return skills.map(skill => ({ ...skill, directory: join(root, 'skills', skill.name),
    location: join(root, 'skills', skill.name, 'SKILL.md'), content: contents.get('skills/' + skill.name + '/SKILL.md') }));
}

function requireResource(root, skill, parent, target, listed, allowedMissing) {
  const path = resolve(parent, decodeURIComponent(target.split(/[?#]/)[0]));
  const inside = relative(skill, path);
  if (!inside || isAbsolute(inside) || inside === '..' || inside.startsWith('..' + sep))
    throw Error('LOGINOM_SKILL_RESOURCE_ESCAPE');
  const key = relative(root, path).split(sep).join('/');
  if (!listed.has(key) && !allowedMissing.has(key))
    throw Error('LOGINOM_SKILL_REQUIRED_RESOURCE_MISSING');
}
