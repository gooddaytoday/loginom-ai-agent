// Read-only stage-0 estimate. No browser, remote catalog, or registration.
import {readFileSync} from 'node:fs';
import {nodeApiTools} from '../../../../../packages/loginom-runtime/client/lib/node-api.mjs';
import {createCandidateNodeSupport} from '../../../../../packages/loginom-runtime/client/lib/node-support.mjs';
import {createActionRuntime} from '../../../../../packages/loginom-runtime/client/lib/executor.mjs';
import {pinActionCatalog,BUNDLED_CATALOG_RELEASES} from '../../../../../packages/loginom-runtime/client/lib/action-catalog.mjs';
import {userNodeTool,userActionInventory} from '../../../../../packages/loginom-runtime/client/lib/user-workflow.mjs';

const root=new URL('../../../../../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const bytes=value=>Buffer.byteLength(JSON.stringify(value));
const release=JSON.parse(read('packages/product/loginom-release.json'));
const pinned=await pinActionCatalog({callTool:()=>{throw Error('Remote access forbidden');}},{
  manifestUri:release.actionManifestUri,manifestSha256:release.actionManifestSha256,
  allowCandidate:true,releases:BUNDLED_CATALOG_RELEASES,
});
const runtime=createActionRuntime({pinned,
  ...createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:pinned.compatibility.loginom_build}),
  allowCandidate:true,
  getNodeContractPins:()=>({...pinned.pins,skillRevision:'0'.repeat(64),loginomProfile:pinned.compatibility}),
  execute:()=>{throw Error('Browser access forbidden');},
});
const tool=structuredClone(nodeApiTools.find(t=>t.name==='dock_node_apply'));
let index=read('packages/product/skills/loginom-automation/SKILL.md');
const surfaces=[];
for(const [type,directory] of [['preprocessing.elim_outlier','preprocessing-elimoutlier'],['research.quality','research-quality']]){
  const path='docs/node-development/nodes/'+directory+'/model-contract/';
  const proposal=JSON.parse(read(path+'modes-type-card.proposal.json'));
  const node=read(path+'modes-skill-node.proposal.md');
  const route=read(path+'modes-skill-route.proposal.txt');
  const pattern=/^<!-- mode: ([a-z0-9_]+(?: [a-z0-9_]+)*) -->\r?\n([\s\S]*?)^<!-- \/mode -->\r?$/gm;
  const sections=[...node.matchAll(pattern)];
  if(proposal.modes.some(mode=>!sections.some(s=>s[1].split(' ').includes(mode))))throw Error('Missing mode guidance');
  const guidance=[node.replace(pattern,'').trim(),...sections.map(s=>s[2].trim())].filter(Boolean).join('\n\n');
  const current=userActionInventory(runtime.describe({node_types:[type]})).node_types[0];
  const card={...current,...proposal,session_manifest:current.session_manifest,
    cache_key:'0'.repeat(64),guidance,guidance_modes:proposal.modes};
  surfaces.push({type,proposal_card_with_pins_and_all_guidance_bytes:bytes(card),
    proposal_file_card_bytes:bytes(proposal),skill_file_bytes:Buffer.byteLength(node),
    skill_route_bytes:Buffer.byteLength(route)});
  const old=index.split('\n').find(line=>line.includes('`'+type+'`'));
  if(!old)throw Error('Missing current route');
  index=index.replace(old,route.trimEnd());
  for(const mode of proposal.modes)if(!tool.inputSchema.properties.mode.enum.includes(mode))tool.inputSchema.properties.mode.enum.push(mode);
  Object.assign(tool.inputSchema.properties.parameters.properties,proposal.parameter_schema.properties);
}
const {name,description,inputSchema}=userNodeTool(tool);
console.log(JSON.stringify({surfaces,proposal_skill_index_bytes:Buffer.byteLength(index),
  proposal_model_tool_bytes:bytes({name,description,inputSchema}),
  proposal_full_input_schema_bytes:bytes(tool.inputSchema)},null,2));
