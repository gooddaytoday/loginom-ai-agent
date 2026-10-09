import { verifyBundledSkills } from './bundled-skill-manifest.mjs';

export function createSkillLoader({ resources }) {
  let pinned;
  let pending;
  async function load() {
    const bundle = (await verifyBundledSkills(resources)).find(skill => skill.name === 'loginom-automation');
    if (!bundle) throw Error('LOGINOM_SKILL_REQUIRED_RESOURCE_MISSING');
    if (pinned) {
      if (pinned.detail.revision !== bundle.digest) throw Error('LOGINOM_SKILL_REVISION_CHANGED');
      return pinned;
    }
    pinned = { directory: bundle.directory, main: bundle.location,
      detail: { revision: bundle.digest, source: 'bundled', files: bundle.files,
        content_sha256: bundle.files.find(file => file.path === 'skills/loginom-automation/SKILL.md').sha256,
        content: bundle.content } };
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
