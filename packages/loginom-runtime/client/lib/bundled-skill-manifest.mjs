import { createHash } from 'node:crypto';

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
