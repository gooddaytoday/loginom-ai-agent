// Stage-0 estimate only; no registration, remote tools or browser execution.
import {readFileSync} from 'node:fs';
import {nodeApiTools} from '../../../../../packages/loginom-runtime/client/lib/node-api.mjs';
import {createCandidateNodeSupport} from '../../../../../packages/loginom-runtime/client/lib/node-support.mjs';
import {createActionRuntime} from '../../../../../packages/loginom-runtime/client/lib/executor.mjs';
import {pinActionCatalog,BUNDLED_CATALOG_RELEASES} from '../../../../../packages/loginom-runtime/client/lib/action-catalog.mjs';
import {userNodeTool,userActionInventory} from '../../../../../packages/loginom-runtime/client/lib/user-workflow.mjs';

const root=new URL('../../../../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root));
const bytes=v=>Buffer.byteLength(JSON.stringify(v));
const release=JSON.parse(read('packages/product/loginom-release.json'));
const pinned=await pinActionCatalog({callTool:()=>{throw Error('Remote access forbidden');}},{
  manifestUri:release.actionManifestUri,manifestSha256:release.actionManifestSha256,
  allowCandidate:true,releases:BUNDLED_CATALOG_RELEASES,
});
const runtime=createActionRuntime({pinned,
  ...createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:pinned.compatibility.loginom_build}),
  allowCandidate:true,getNodeContractPins:()=>({...pinned.pins,skillRevision:'0'.repeat(64),loginomProfile:pinned.compatibility}),
  execute:()=>{throw Error('Browser access forbidden');},
});
const path='docs/node-development/nodes/transform-ungroupdata/model-contract/';
const current=userActionInventory(runtime.describe({node_types:['transform.ungroup_data']})).node_types[0];
const proposal=JSON.parse(read(path+'seasonal-type-card.proposal.json'));
const card={...current,...proposal,session_manifest:current.session_manifest};
const skill=read('packages/product/skills/loginom-automation/SKILL.md').toString();
const route=read(path+'seasonal-skill-route.proposal.txt').toString();
const guidance=read(path+'seasonal-skill-node.proposal.md').toString();
const tool=structuredClone(nodeApiTools.find(t=>t.name==='dock_node_apply'));
tool.inputSchema.properties.mode.enum.push('seasonal');
Object.assign(tool.inputSchema.properties.parameters.properties,proposal.parameter_schema.properties);
const {name,description,inputSchema}=userNodeTool(tool);
console.log(JSON.stringify({
  current_card_without_guidance_bytes:bytes(current),
  proposed_card_without_guidance_bytes:bytes(card),
  proposed_card_with_full_guidance_bytes:bytes({...card,guidance,guidance_modes:proposal.modes}),
  proposal_file_card_bytes:bytes(proposal),
  skill_index_bytes:Buffer.byteLength(skill),
  proposed_skill_index_bytes:Buffer.byteLength(skill.replace(skill.split('\n').find(l=>l.includes('`transform.ungroup_data`')),route.trimEnd())),
  proposed_node_skill_bytes:Buffer.byteLength(guidance),proposed_route_bytes:Buffer.byteLength(route),
  proposal_model_tool_bytes:bytes({name,description,inputSchema}),
  proposal_full_input_schema_bytes:bytes(tool.inputSchema),
},null,2));
