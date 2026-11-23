// Stage-0 documentation fixture. No handler/schema/installed skill is changed.
// Run with pinned Node after client npm ci --ignore-scripts --omit=dev.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createCandidateNodeSupport} from '../../../../../packages/loginom-runtime/client/lib/node-support.mjs';
import {createActionRuntime} from '../../../../../packages/loginom-runtime/client/lib/executor.mjs';
import {pinActionCatalog,BUNDLED_CATALOG_RELEASES} from '../../../../../packages/loginom-runtime/client/lib/action-catalog.mjs';
import {userActionInventory,userNodeTool} from '../../../../../packages/loginom-runtime/client/lib/user-workflow.mjs';
import {nodeApiTools} from '../../../../../packages/loginom-runtime/client/lib/node-api.mjs';
import {createSkillLoader} from '../../../../../packages/loginom-runtime/client/lib/skill.mjs';
import {createBundledSkillFixture} from '../../../../../packages/loginom-runtime/client/test/support/bundled-skill-fixture.mjs';

const bytes=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
const type='research.auto_correlation',cleanups=[];
try {
 const release=JSON.parse(await readFile(new URL('../../../../../packages/product/loginom-release.json',import.meta.url),'utf8'));
 const pinned=await pinActionCatalog({callTool:()=>assert.fail('No remote catalog')},{
  manifestUri:release.actionManifestUri,manifestSha256:release.actionManifestSha256,
  allowCandidate:true,releases:BUNDLED_CATALOG_RELEASES});
 const source=await createBundledSkillFixture({after:cb=>cleanups.push(cb)});
 const loader=createSkillLoader({resources:source.resources}),skill=await loader.prepare();
 const support=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:pinned.compatibility.loginom_build});
 const runtime=createActionRuntime({pinned,...support,allowCandidate:true,
  getNodeContractPins:()=>({...pinned.pins,skillRevision:skill.detail.revision,loginomProfile:pinned.compatibility}),
  execute:()=>assert.fail('Sizing must not access the browser')});
 const description=userActionInventory(runtime.describe({node_types:[type]}));
 const baseline=(await loader.describeNodes(description.node_types,['time_domain']))[0];
 const original=await readFile(new URL('../../../../../packages/product/skills/loginom-automation/references/nodes/research.auto_correlation.md',import.meta.url),'utf8');
 const beforeInput='Поддержан ряд из минимум двух конечных непустых значений с положительной\nдисперсией.';
 const afterInput=beforeInput;
 const addition='\nВ Loginom 7.4.2 нет начала диапазона, шага или списка лагов: lag_count даёт\n0…min(lag_count,N)−1. Не выдавай это за выбор ненулевого диапазона. Пустой\nвход не поддержан; при ошибке покажи её и не экспортируй старый результат.\n';
 const reference=original.replace(beforeInput,afterInput).replace('<!-- /mode -->',addition+'<!-- /mode -->');
 const proposed=structuredClone(baseline);
 proposed.semantics=proposed.semantics.replace('Acceptance: at least two finite nonmissing values with positive variance.',
  'Acceptance: at least two finite nonmissing values with positive variance. No start/step/list controls exist; empty input is unsupported.');
 // Keep this proposal scoped to the observed time_domain slice, not LAB-1022 modes.
 assert.ok(baseline.guidance.includes(beforeInput));
 proposed.guidance=baseline.guidance.replace(beforeInput,afterInput);
 // Guidance is mode-selected by the production loader; append within that mode.
 proposed.guidance+=addition;
 const placeholders=JSON.parse(JSON.stringify(proposed).replace(/[a-f0-9]{64}/g,'0'.repeat(64)));
 const main=await readFile(new URL('../../../../../packages/product/skills/loginom-automation/SKILL.md',import.meta.url),'utf8');
 const routing=main.split('\n').find(line=>line.startsWith('|')&&line.includes('`research.auto_correlation`'));
 const {name,description:toolDescription,inputSchema}=userNodeTool(nodeApiTools.find(t=>t.name==='dock_node_apply'));
 const result={baseline_card_bytes:bytes(baseline),proposal_card_bytes:bytes(placeholders),
  skill_bytes:Buffer.byteLength(main),proposal_skill_bytes:Buffer.byteLength(main),routing_bytes:Buffer.byteLength(routing),
  reference_bytes:Buffer.byteLength(original),proposal_reference_bytes:Buffer.byteLength(reference),
  model_tool_bytes:bytes({name,description:toolDescription,inputSchema}),
  full_input_schema_bytes:bytes(nodeApiTools.find(t=>t.name==='dock_node_apply').inputSchema)};
 assert.ok(result.proposal_card_bytes<=12000);
 assert.ok(result.proposal_skill_bytes<=40000&&result.routing_bytes<=200&&result.proposal_reference_bytes<=6000);
 assert.ok(result.model_tool_bytes<=20000);
 if(process.argv.includes('--write')){
  await writeFile(new URL('./edges-type-card.proposal.json',import.meta.url),JSON.stringify(placeholders,null,2)+'\n');
  await writeFile(new URL('./edges-skill-node.proposal.md',import.meta.url),reference);
  await writeFile(new URL('./edges-skill-routing.proposal.md',import.meta.url),routing+'\n');
 }
 console.log(JSON.stringify(result));
} finally {
 for(const cleanup of cleanups.reverse())await cleanup();
}
