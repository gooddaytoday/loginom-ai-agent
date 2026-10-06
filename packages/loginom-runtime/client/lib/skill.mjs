import { createHash } from 'node:crypto';
import { readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { bundledSkillInventory } from './bundled-skill-manifest.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export function createSkillLoader({ resources }) {
  let pinned;
  let pending;
  async function load() {
    if (typeof resources !== 'string' || !isAbsolute(resources)) throw Error('LOGINOM_SKILL_RESOURCES_INVALID');
    const root = await realpath(resources);
    const manifest = JSON.parse(await readFile(join(root, 'resource-manifest.json'), 'utf8'));
    if (manifest.protocol !== 1 || !Array.isArray(manifest.files)) throw Error('LOGINOM_SKILL_MANIFEST_INVALID');
    const bundle = bundledSkillInventory(manifest.files).find(skill => skill.name === 'loginom-automation');
    if (!bundle) throw Error('LOGINOM_SKILL_REQUIRED_RESOURCE_MISSING');
    const directory = join(root, 'skills/loginom-automation');
    const listed = new Set(bundle.files.map(file => file.path));
    const content = new Map();
    for (const file of await readdir(directory, { recursive: true, withFileTypes: true })) {
      if (!file.isDirectory() && !listed.has(relative(root, join(file.parentPath, file.name)).split(sep).join('/')))
        throw Error('LOGINOM_SKILL_UNMANIFESTED_FILE');
    }
    for (const file of bundle.files) {
      if (file.path.includes('\\') || file.path.split('/').some(part => !part || part === '.' || part === '..'))
        throw Error('LOGINOM_SKILL_MANIFEST_INVALID');
      const absolute = await realpath(join(root, file.path));
      const inside = relative(root, absolute);
      if (isAbsolute(inside) || inside === '..' || inside.startsWith('..' + sep)) throw Error('LOGINOM_SKILL_RESOURCE_ESCAPE');
      const bytes = await readFile(absolute);
      if (hash(bytes) !== file.sha256) throw Error('LOGINOM_SKILL_HASH_MISMATCH');
      if (file.path.endsWith('/SKILL.md')) content.set(file.path, bytes.toString('utf8'));
    }
    if (pinned) {
      if (pinned.detail.revision !== bundle.digest) throw Error('LOGINOM_SKILL_REVISION_CHANGED');
      return pinned;
    }
    const main = join(directory, 'SKILL.md');
    pinned = { directory, main, detail: { revision: bundle.digest, source: 'bundled', files: bundle.files,
      content_sha256: bundle.files.find(file => file.path.endsWith('/SKILL.md')).sha256,
      content: content.get('skills/loginom-automation/SKILL.md') } };
    return pinned;
  }
  return { prepare() {
    pending ??= load().finally(() => { pending = undefined; });
    return pending;
  } };
}

export const prepareTool = {
  name: 'dock_prepare',
  description: 'Prepare Loginom work after activating the application-bundled loginom-automation skill: verify the local skill, pin its revision, prepare the browser workspace and return dynamic knowledge and input artifacts. Repeated calls keep the same revision. Successful preparation enables the installed native adapter to archive this Loginom task in the shared Dock account after secret redaction. Diagnostics reports actual activation.',
  inputSchema: { type: 'object', properties: {
    host_context_token: { type: 'string', pattern: '^[a-f0-9]{64}$', description: 'Reserved opaque input ticket supplied by the native host. Do not invent this value.' },
    operation_id: {type:'string',pattern:'^[a-zA-Z0-9_.:-]{1,128}$'},
    intent: {type:'string',enum:['new_draft','open_package','existing_workflow']},
    package_path: {type:'string',minLength:1,maxLength:2048},
    workflow_ref: {type:'object',properties:{workflow_id:{type:'string'},document_id:{type:'string'},tab_tid:{type:'string'},prefix:{type:'string'},navigation_path:{type:'array',items:{type:'object',properties:{tid:{type:'string'},label:{type:'string'}},required:['tid','label'],additionalProperties:false}}},required:['workflow_id','document_id','tab_tid','prefix','navigation_path'],additionalProperties:false},
    timeout_ms: {type:'integer',minimum:1,maximum:120000},
  }, additionalProperties: false },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
};
