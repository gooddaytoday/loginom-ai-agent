// Stage-0 data only. Run from any directory with pinned Node 24.19.0.
// --write materializes proposed cards; runtime/product skill remain unchanged.
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
  const pinned=await pinActionCatalog({callTool:()=>assert.fail('No remote catalog read')},{
    manifestUri:release.actionManifestUri,manifestSha256:release.actionManifestSha256,
    allowCandidate:true,releases:BUNDLED_CATALOG_RELEASES});
  const fixture=await createBundledSkillFixture({after:callback=>cleanups.push(callback)});
  const skill=await createSkillLoader({resources:fixture.resources}).prepare();
  const support=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:pinned.compatibility.loginom_build});
  const runtime=createActionRuntime({pinned,...support,allowCandidate:true,
    getNodeContractPins:()=>({...pinned.pins,skillRevision:skill.detail.revision,loginomProfile:pinned.compatibility}),
    execute:()=>assert.fail('No browser access for measurement')});
  const bytes=value=>Buffer.byteLength(typeof value==='string'?value:JSON.stringify(value),'utf8');
  const full=nodeApiTools.find(t=>t.name==='dock_node_apply');
  const proposedFull=structuredClone(full.inputSchema);
  const {name,description,inputSchema}=userNodeTool(full);
  const skillText=await readFile(new URL('../../../../../packages/product/skills/loginom-automation/SKILL.md',import.meta.url),'utf8');
  let proposedSkill=skillText;
  const result={model_tool_bytes:bytes({name,description,inputSchema}),full_input_schema_bytes:bytes(full.inputSchema),
    skill_before_bytes:bytes(skillText),types:[]};
  for(const [type,slug] of [['preprocessing.data_recovery','missing-values'],['research.duplicates','duplicates'],
                          ['transform.date_time','date-time'],['transform.cross_table','transform-crosstable']]) {
    const folder=new URL('../../'+slug+'/',import.meta.url);
    const card=userActionInventory(runtime.describe({node_types:[type]})).node_types[0];
    const proposed=JSON.parse(JSON.stringify(card,(_key,value)=>
      typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value)?'0'.repeat(64):value));
    const schema=type==='transform.cross_table'?card.parameter_schema:
      JSON.parse(await readFile(new URL('acceptance/modes/parameter-schema.proposal.json',folder),'utf8'));
    proposed.parameter_schema=schema;
    if(type==='transform.date_time')proposedFull.properties.parameters.properties.fields.anyOf[0]=schema.properties.fields;
    if(type==='preprocessing.data_recovery'){
      proposedFull.properties.parameters.properties.fields.anyOf[1]=schema.properties.fields;
      proposedFull.properties.parameters.properties.ordered=schema.properties.ordered;
    }
    const oldRow=skillText.split('\n').find(line=>line.startsWith('|')&&line.includes('`'+type+'`'));
    assert.ok(oldRow,type+' routing row');
    const reference=await readFile(type==='transform.cross_table'
      ?new URL('../../../../../packages/product/skills/loginom-automation/references/nodes/'+type+'.md',import.meta.url)
      :new URL('fixtures/reference.proposal.md',folder),'utf8');
    const row=type==='transform.cross_table'?oldRow:
      (await readFile(new URL('fixtures/skill-row.proposal.md',folder),'utf8')).trimEnd();
    proposedSkill=proposedSkill.replace(oldRow,row);
    result.types.push({type,card_before_bytes:bytes(card),card_after_bytes:bytes(proposed),
      routing_before_bytes:bytes(oldRow),routing_after_bytes:bytes(row),
      reference_before_bytes:bytes(await readFile(new URL('../../../../../packages/product/skills/loginom-automation/references/nodes/'+type+'.md',import.meta.url),'utf8')),
      reference_after_bytes:bytes(reference)});
    if(process.argv.includes('--write')&&type!=='transform.cross_table')
      await writeFile(new URL('acceptance/modes/node-card.proposal.json',folder),JSON.stringify(proposed,null,2)+'\n');
  }
  result.skill_after_bytes=bytes(proposedSkill);
  result.proposed_full_input_schema_bytes=bytes(proposedFull);
  result.full_input_schema_delta_bytes=bytes(proposedFull)-bytes(full.inputSchema);
  result.limits={model_tool:20000,node_card:12000,skill:40000,routing_about:200,reference:6000};
  console.log(JSON.stringify(result,null,2));
} finally {
  for(const cleanup of cleanups.reverse())await cleanup();
}
