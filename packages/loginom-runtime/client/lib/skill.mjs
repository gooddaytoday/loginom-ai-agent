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
  description: 'Prepare Loginom work after activating the application-bundled loginom-automation skill: verify the local skill, pin its revision, prepare the browser workspace and return dynamic knowledge and input artifacts. For a NEW scenario use intent new_draft and omit package_path, even when the user specifies where to Save the result. Retain that path/name for final Save. open_package only opens an ALREADY SAVED existing package; it cannot create one. Repeated calls keep the same revision. Successful preparation enables the installed native adapter to archive this Loginom task in the shared Dock account after secret redaction. Diagnostics reports actual activation.',
  inputSchema: { type: 'object', properties: {
    host_context_token: { type: 'string', pattern: '^[a-f0-9]{64}$', description: 'Reserved opaque input ticket supplied by the native host. Do not invent this value.' },
    operation_id: {type:'string',pattern:'^[a-zA-Z0-9_.:-]{1,128}$'},
    intent: {type:'string',enum:['new_draft','open_package','existing_workflow'],description:'For a NEW task use new_draft without package_path; a requested future Save destination does not mean the package exists. For a saved-package continuation without a reference issued by THIS runtime, first use open_package with the exact confirmed Save path. existing_workflow requires a reference from successful dock_prepare in this runtime, never chat history or diagnostics. Resolve any pending operation through recovery before preparing again.'},
    package_path: {type:'string',minLength:1,maxLength:2048,description:'open_package ONLY: the exact path of an ALREADY SAVED package the user asks to continue, or a confirmed Save receipt. A future Save destination for a new scenario is NOT an opening path: use new_draft, omit package_path and keep that same destination for final Save. Never guess a path or replace a saved-package continuation with a new draft.'},
    workflow_ref: {type:'object',description:'existing_workflow only: the complete unchanged reference issued by successful dock_prepare in THIS runtime. Chat history, familiar GUIDs and diagnostics do not prepare this runtime; without a current reference use open_package and its confirmed Save path.',properties:{workflow_id:{type:'string'},document_id:{type:'string'},tab_tid:{type:'string'},prefix:{type:'string'},navigation_path:{type:'array',items:{type:'object',properties:{tid:{type:'string'},label:{type:'string'}},required:['tid','label'],additionalProperties:false}}},required:['workflow_id','document_id','tab_tid','prefix','navigation_path'],additionalProperties:false},
    timeout_ms: {type:'integer',minimum:1,maximum:120000},
  }, additionalProperties: false },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
};
