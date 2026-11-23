// Offline documentation proposal. No browser, runtime registration or model run.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {nodeApiTools} from '../../../../../packages/loginom-runtime/client/lib/node-api.mjs';
import {createCandidateNodeSupport} from '../../../../../packages/loginom-runtime/client/lib/node-support.mjs';
import {createActionRuntime} from '../../../../../packages/loginom-runtime/client/lib/executor.mjs';
import {pinActionCatalog,BUNDLED_CATALOG_RELEASES} from '../../../../../packages/loginom-runtime/client/lib/action-catalog.mjs';
import {userNodeTool,userActionInventory} from '../../../../../packages/loginom-runtime/client/lib/user-workflow.mjs';
import {createSkillLoader} from '../../../../../packages/loginom-runtime/client/lib/skill.mjs';
import {createBundledSkillFixture} from '../../../../../packages/loginom-runtime/client/test/support/bundled-skill-fixture.mjs';

const cleanups=[];
try {
  const release=JSON.parse(await readFile(new URL('../../../../../packages/product/loginom-release.json',import.meta.url),'utf8'));
  const pinned=await pinActionCatalog({callTool:()=>assert.fail('Unexpected catalog request')},{
    manifestUri:release.actionManifestUri,manifestSha256:release.actionManifestSha256,
    allowCandidate:true,releases:BUNDLED_CATALOG_RELEASES});
  const fixture=await createBundledSkillFixture({after:callback=>cleanups.push(callback)});
  const skill=await createSkillLoader({resources:fixture.resources}).prepare();
  const support=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:pinned.compatibility.loginom_build});
  const runtime=createActionRuntime({pinned,...support,allowCandidate:true,
    getNodeContractPins:()=>({...pinned.pins,skillRevision:skill.detail.revision,loginomProfile:pinned.compatibility}),
    execute:()=>assert.fail('Unexpected browser access')});
  const bytes=value=>Buffer.byteLength(typeof value==='string'?value:JSON.stringify(value),'utf8');
  const full=nodeApiTools.find(tool=>tool.name==='dock_node_apply');
  const proposedTool=structuredClone(full);
  proposedTool.inputSchema.properties.mode.enum.push('wavelet');
  const currentTool=userNodeTool(full);
  const main=await readFile(new URL('../../../../../packages/product/skills/loginom-automation/SKILL.md',import.meta.url),'utf8');
  let proposedMain=main;
  const result={model_tool_bytes:bytes({name:currentTool.name,description:currentTool.description,inputSchema:currentTool.inputSchema}),
    full_input_schema_bytes:bytes(full.inputSchema),skill_before_bytes:bytes(main),types:[]};
  for(const [type,slug] of [['preprocessing.binning','preprocessing-binning'],
                          ['preprocessing.coarse_classes','preprocessing-coarseclasses'],
                          ['preprocessing.smoothing','preprocessing-smoothing']]) {
    const folder=new URL('../../'+slug+'/',import.meta.url);
    const card=userActionInventory(runtime.describe({node_types:[type]})).node_types[0];
    const proposed=JSON.parse(JSON.stringify(card,(_key,value)=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value)?'0'.repeat(64):value));
    proposed.parameter_schema=JSON.parse(await readFile(new URL('acceptance/modes/parameter-schema.proposal.json',folder),'utf8'));
    proposed.semantics=(await readFile(new URL('acceptance/modes/semantics.txt',folder),'utf8')).trim();
    if(type==='preprocessing.smoothing')proposed.candidate_modes.push('wavelet');
    if(type==='preprocessing.coarse_classes')proposed.additional_tabular_inputs=true;
    Object.assign(proposedTool.inputSchema.properties.parameters.properties,proposed.parameter_schema.properties);
    const oldRow=main.split('\n').find(line=>line.startsWith('|')&&line.includes('`'+type+'`'));
    assert.ok(oldRow,type+' routing row');
    const row=(await readFile(new URL('fixtures/skill-row.proposal.md',folder),'utf8')).trimEnd();
    proposedMain=proposedMain.replace(oldRow,row);
    const reference=await readFile(new URL('fixtures/reference.proposal.md',folder),'utf8');
    result.types.push({type,card_before_bytes:bytes(card),card_after_bytes:bytes(proposed),
      routing_after_bytes:bytes(row),reference_after_bytes:bytes(reference)});
    assert.ok(!JSON.stringify(proposed).match(/(?<![a-f0-9])[a-f0-9]{64}(?![a-f0-9])/gi)?.some(hash=>hash!=='0'.repeat(64)));
    if(process.argv.includes('--write'))await writeFile(new URL('acceptance/modes/node-card.proposal.json',folder),JSON.stringify(proposed,null,2)+'\n');
  }
  const compact=userNodeTool(proposedTool);
  result.proposed_model_tool_bytes=bytes({name:compact.name,description:compact.description,inputSchema:compact.inputSchema});
  result.proposed_full_input_schema_bytes=bytes(proposedTool.inputSchema);
  result.skill_after_bytes=bytes(proposedMain);
  console.log(JSON.stringify(result,null,2));
} finally {
  for(const cleanup of cleanups.reverse())await cleanup();
}
