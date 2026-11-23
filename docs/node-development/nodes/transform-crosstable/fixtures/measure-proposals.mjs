// Offline stage-0 measurement through the production describe/skill projection.
// --write saves proposed mode cards with zero hashes. No browser or CLI build.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {nodeApiTools} from '../../../../../packages/loginom-runtime/client/lib/node-api.mjs';
import {createCandidateNodeSupport} from '../../../../../packages/loginom-runtime/client/lib/node-support.mjs';
import {createActionRuntime} from '../../../../../packages/loginom-runtime/client/lib/executor.mjs';
import {pinActionCatalog, BUNDLED_CATALOG_RELEASES} from '../../../../../packages/loginom-runtime/client/lib/action-catalog.mjs';
import {userNodeTool, userActionInventory} from '../../../../../packages/loginom-runtime/client/lib/user-workflow.mjs';
import {createSkillLoader} from '../../../../../packages/loginom-runtime/client/lib/skill.mjs';
import {createBundledSkillFixture, refreshSkillFixtureManifest} from '../../../../../packages/loginom-runtime/client/test/support/bundled-skill-fixture.mjs';

const cleanups = [];
const bytes = value => Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value));
const zeroHashes = value => JSON.parse(JSON.stringify(value, (_key, item) =>
  typeof item === 'string' && /^[a-f0-9]{64}$/i.test(item) ? '0'.repeat(64) : item));
try {
  const release = JSON.parse(await readFile(new URL('../../../../../packages/product/loginom-release.json', import.meta.url), 'utf8'));
  const pinned = await pinActionCatalog({callTool: () => assert.fail('Offline measurement')}, {
    manifestUri: release.actionManifestUri, manifestSha256: release.actionManifestSha256,
    allowCandidate: true, releases: BUNDLED_CATALOG_RELEASES});
  const fixture = await createBundledSkillFixture({after: callback => cleanups.push(callback)});
  const loader = createSkillLoader({resources: fixture.resources});
  const skill = await loader.prepare();
  const config = {targetOrigin: 'https://app.loginom.ai', targetBuild: pinned.compatibility.loginom_build};
  const runtime = createActionRuntime({pinned, ...createCandidateNodeSupport(config), allowCandidate: true,
    getNodeContractPins: () => ({...pinned.pins, skillRevision: skill.detail.revision, loginomProfile: pinned.compatibility}),
    execute: () => assert.fail('No UI access')});
  const full = nodeApiTools.find(tool => tool.name === 'dock_node_apply');
  const {name, description, inputSchema} = userNodeTool(full);
  const beforeSkill = await readFile(fixture.main, 'utf8');
  let afterSkill = beforeSkill;
  const entries = [];
  for (const [type, slug, mode] of [['transform.cross_table', 'transform-crosstable', 'pivot'], ['research.duplicates', 'duplicates', 'mark']]) {
    const folder = new URL('../../' + slug + '/', import.meta.url);
    const base = runtime.describe({node_types: [type]}).node_types[0];
    const before = userActionInventory({node_types: await loader.describeNodes([base], [mode])}).node_types[0];
    const referencePath = join(fixture.directory, 'references/nodes', type + '.md');
    const beforeReference = await readFile(referencePath, 'utf8');
    const reference = await readFile(new URL('fixtures/reference.proposal.md', folder), 'utf8');
    const oldRow = beforeSkill.split('\n').find(row => row.startsWith('|') && row.includes('`' + type + '`'));
    assert.ok(oldRow);
    const row = (await readFile(new URL('fixtures/skill-row.proposal.md', folder), 'utf8')).trimEnd();
    afterSkill = afterSkill.replace(oldRow, row);
    entries.push({type, slug, mode, folder, base, before, referencePath, reference,
      baseline_card_bytes: bytes(userActionInventory({node_types: [base]}).node_types[0]),
      card_before_bytes: bytes(before), reference_before_bytes: bytes(beforeReference), reference_after_bytes: bytes(reference),
      routing_before_bytes: bytes(oldRow), routing_after_bytes: bytes(row)});
  }
  await writeFile(fixture.main, afterSkill);
  for (const entry of entries) await writeFile(entry.referencePath, entry.reference);
  await refreshSkillFixtureManifest(fixture.resources);
  const proposedLoader = createSkillLoader({resources: fixture.resources});
  const types = [];
  for (const entry of entries) {
    const base = structuredClone(entry.base);
    if (entry.type === 'transform.cross_table') base.semantics = 'Pivot scalar and Variant facts by row keys and column categories. fixed preserves categories; sliding follows source updates. Reread the same node; never reconfigure to refresh. Required output sources cannot be excluded.';
    const card = zeroHashes(userActionInventory({node_types: await proposedLoader.describeNodes([base], [entry.mode])}).node_types[0]);
    assert.equal(JSON.stringify(card.parameter_schema), JSON.stringify(entry.before.parameter_schema));
    if (process.argv.includes('--write')) await writeFile(new URL('acceptance/modes/node-card.proposal.json', entry.folder), JSON.stringify(card, null, 2) + '\n');
    types.push(Object.fromEntries(Object.entries({...entry, card_after_bytes: bytes(card)}).filter(([key]) =>
      ['type', 'mode', 'baseline_card_bytes', 'card_before_bytes', 'card_after_bytes', 'reference_before_bytes', 'reference_after_bytes', 'routing_before_bytes', 'routing_after_bytes'].includes(key))));
  }
  console.log(JSON.stringify({model_tool_bytes: bytes({name, description, inputSchema}),
    full_input_schema_bytes: bytes(full.inputSchema), skill_before_bytes: bytes(beforeSkill), skill_after_bytes: bytes(afterSkill), types,
    limits: {model_tool: 20000, node_card: 12000, skill: 40000, routing_about: 200, reference: 6000}}, null, 2));
} finally {
  for (const cleanup of cleanups.reverse()) await cleanup();
}
