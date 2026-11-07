// Read-only stage-0 size estimate; never registers handlers or accesses Loginom.
import {readFileSync} from 'node:fs';
import {nodeApiTools} from '../../../../../packages/loginom-runtime/client/lib/node-api.mjs';
import {createCandidateNodeSupport} from '../../../../../packages/loginom-runtime/client/lib/node-support.mjs';
import {createActionRuntime} from '../../../../../packages/loginom-runtime/client/lib/executor.mjs';
import {pinActionCatalog,BUNDLED_CATALOG_RELEASES} from '../../../../../packages/loginom-runtime/client/lib/action-catalog.mjs';
import {userNodeTool,userActionInventory} from '../../../../../packages/loginom-runtime/client/lib/user-workflow.mjs';

const root=new URL('../../../../../',import.meta.url);
const read=path=>readFileSync(new URL(path,root));
const json=path=>JSON.parse(read(path));
const bytes=value=>Buffer.byteLength(JSON.stringify(value));
const release=json('packages/product/loginom-release.json');
const pinned=await pinActionCatalog({callTool:()=>{throw Error('Remote catalog access forbidden');}},{
  manifestUri:release.actionManifestUri,manifestSha256:release.actionManifestSha256,
  allowCandidate:true,releases:BUNDLED_CATALOG_RELEASES,
});
const support=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:pinned.compatibility.loginom_build});
const runtime=createActionRuntime({pinned,...support,allowCandidate:true,
  getNodeContractPins:()=>({...pinned.pins,skillRevision:'0'.repeat(64),loginomProfile:pinned.compatibility}),
  execute:()=>{throw Error('Browser access forbidden');},
});
const proposedTool=structuredClone(nodeApiTools.find(tool=>tool.name==='dock_node_apply'));
const surfaces=[];
let skillIndex=read('packages/product/skills/loginom-automation/SKILL.md').toString();
for(const [type,directory] of [
  ['transform.ungroup_data','transform-ungroupdata'],
  ['preprocessing.elim_outlier','preprocessing-elimoutlier'],
  ['research.quality','research-quality'],
]){
  const base='docs/node-development/nodes/'+directory+'/model-contract/';
  const proposal=json(base+'modes-type-card.proposal.json');
  const current=userActionInventory(runtime.describe({node_types:[type]})).node_types[0];
  const oldRoute=skillIndex.split('\n').find(line=>line.includes('`'+type+'`'));
  skillIndex=skillIndex.replace(oldRoute,read(base+'modes-skill-route.proposal.txt').toString().trimEnd());
  surfaces.push({type,current_card_bytes:bytes(current),
    proposal_card_bytes:bytes({...current,...proposal,session_manifest:current.session_manifest}),
    proposal_file_card_bytes:bytes(proposal),
    skill_file_bytes:read(base+'modes-skill-node.proposal.md').length,
    skill_route_bytes:read(base+'modes-skill-route.proposal.txt').length,
    scope:type==='research.quality'?'lower bound; unknown settings/modes excluded':
      type==='transform.ungroup_data'?'computed only; seasonal excluded':'unconfirmed edit/quality/apply proposal',
  });
  for(const mode of proposal.candidate_modes)
    if(!proposedTool.inputSchema.properties.mode.enum.includes(mode))
      proposedTool.inputSchema.properties.mode.enum.push(mode);
  if(type!=='research.quality')Object.assign(proposedTool.inputSchema.properties.parameters.properties,proposal.parameter_schema.properties);
}
const {name,description,inputSchema}=userNodeTool(proposedTool);
console.log(JSON.stringify({surfaces,skill_index_bytes:read('packages/product/skills/loginom-automation/SKILL.md').length,
  proposal_skill_index_bytes:Buffer.byteLength(skillIndex),
  proposal_model_tool_bytes:bytes({name,description,inputSchema}),
  proposal_full_input_schema_bytes:bytes(proposedTool.inputSchema)},null,2));
