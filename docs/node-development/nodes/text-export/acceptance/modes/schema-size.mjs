// Documentation-only proposal. Uses the same user-v1 projection as the budget test.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {nodeApiTools} from '../../../../../../packages/loginom-runtime/client/lib/node-api.mjs';
import {createCandidateNodeSupport} from '../../../../../../packages/loginom-runtime/client/lib/node-support.mjs';
import {createActionRuntime} from '../../../../../../packages/loginom-runtime/client/lib/executor.mjs';
import {pinActionCatalog, BUNDLED_CATALOG_RELEASES} from '../../../../../../packages/loginom-runtime/client/lib/action-catalog.mjs';
import {userNodeTool, userActionInventory} from '../../../../../../packages/loginom-runtime/client/lib/user-workflow.mjs';
import {createSkillLoader} from '../../../../../../packages/loginom-runtime/client/lib/skill.mjs';
import {createBundledSkillFixture} from '../../../../../../packages/loginom-runtime/client/test/support/bundled-skill-fixture.mjs';

const root = new URL('../../../../../../', import.meta.url);
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const cleanups = [];
try {
  const release = JSON.parse(await readFile(new URL('packages/product/loginom-release.json', root), 'utf8'));
  const pinned = await pinActionCatalog({callTool: () => assert.fail('unexpected remote read')}, {
    manifestUri: release.actionManifestUri, manifestSha256: release.actionManifestSha256,
    allowCandidate: true, releases: BUNDLED_CATALOG_RELEASES,
  });
  const fixture = await createBundledSkillFixture({after: fn => cleanups.push(fn)});
  const skill = await createSkillLoader({resources: fixture.resources}).prepare();
  const support = createCandidateNodeSupport({targetOrigin: 'https://app.loginom.ai', targetBuild: pinned.compatibility.loginom_build});
  const runtime = createActionRuntime({pinned, ...support, allowCandidate: true,
    getNodeContractPins: () => ({...pinned.pins, skillRevision: skill.detail.revision, loginomProfile: pinned.compatibility}),
    execute: () => assert.fail('sizing must never access Loginom')});
  const cards = userActionInventory(runtime.describe({node_types: ['exports.text', 'exports.excel']})).node_types;
  const baseFull = nodeApiTools.find(t => t.name === 'dock_node_apply');
  const full = structuredClone(baseFull);
  full.inputSchema.properties.mode.enum.push('fixed_width', 'xls');
  const encodings = ['Windows-1252', 'UTF-16 LE', 'UTF-16 BE'];
  full.inputSchema.properties.parameters.properties.encoding.enum.push(...encodings);
  const excel = full.inputSchema.properties.parameters.properties.excel_export.properties;
  excel.overwrite.enum.push('replace');
  excel.overwrite.description = 'reject by default; replace requires explicit whole-file replacement permission. No append or sheet replacement.';
  excel.number_format = {type: 'string', enum: ['general', 'numeric'], description: 'Native numeric cell display; preserve stored values.'};
  excel.decimal_count = {type: 'integer', minimum: 0, maximum: 30, description: 'Display decimals when number_format is numeric.'};
  excel.divide_thousands = {type: 'boolean', description: 'Grouping for numeric display.'};
  const skillPath = new URL('packages/product/skills/loginom-automation/SKILL.md', root);
  let proposedSkill = await readFile(skillPath, 'utf8');
  const sizes = [];
  for (const base of cards) {
    const text = base.type === 'exports.text';
    const node = text ? 'text-export' : 'exports-excel';
    const directory = new URL(`docs/node-development/nodes/${node}/acceptance/modes/`, root);
    const card = structuredClone(base);
    card.modes = text ? ['delimited', 'fixed_width'] : ['xlsx', 'xls'];
    card.candidate_modes = [...card.modes];
    if (text) {
      card.parameter_schema.properties.encoding.enum.push(...encodings);
      card.semantics += ' Proposed: fixed_width uses native automatic widths, text left/numbers right and spaces; no manual widths. UTF-16 LE/BE and Windows-1252 are explicit encodings. No numeric precision override or variable bindings.';
    } else {
      card.parameter_schema.properties.excel_export.properties = structuredClone(excel);
      card.semantics = 'Proposed Excel export: mode xlsx or xls, one table input, no table outputs. Use excel_export destination, sheet_name, header, overwrite (reject by default), optional number_format general/numeric, decimal_count 0..30 and divide_thousands. Numeric display never rounds stored values. Existing-node omissions preserve settings. replace requires explicit permission to replace the whole workbook, including all old sheets. Append and replacing only a sheet are unavailable. Execute returns file_artifacts, Done saves settings, Close discards. Save separately. No variables.';
      card.parameter_schema.properties.excel_export.description = 'New: destination, sheet_name, header, overwrite. Numeric options optional. Existing node: preserve omissions.';
      card.parameter_schema.properties.excel_export.properties.destination.description = 'Own .xlsx or .xls matching mode in selected exports directory.';
      full.inputSchema.properties.parameters.properties.excel_export = structuredClone(card.parameter_schema.properties.excel_export);
    }
    const normalized = JSON.parse(JSON.stringify(card, (k, v) => typeof v === 'string' && /^[a-f0-9]{64}$/i.test(v) ? '0'.repeat(64) : v));
    const route = text
      ? '| Экспорт CSV/TXT | `exports.text` / delimited, fixed_width | [читать](references/nodes/exports.text.md) |'
      : '| Экспорт XLSX/XLS | `exports.excel` / xlsx, xls | [читать](references/nodes/exports.excel.md) |';
    const oldRoute = proposedSkill.split('\n').find(line => line.startsWith('|') && line.includes('`' + base.type + '`'));
    assert.ok(oldRoute);
    proposedSkill = proposedSkill.replace(oldRoute, route);
    const reference = await readFile(new URL(`packages/product/skills/loginom-automation/references/nodes/${base.type}.md`, root), 'utf8');
    const addition = text
      ? '\nПредложение LAB-1011: fixed_width — автоматические ширины по содержимому/заголовку, текст слева, числа справа; ручных ширин нет. Новые кодировки: Windows-1252, UTF-16 LE и UTF-16 BE. Два знака после точки текстовый мастер не задаёт; не подменяй формат округлением исходных чисел.\n'
      : '\nПредложение LAB-1011: xls — Excel 2003; расширение соответствует mode. number_format:numeric, decimal_count:0..30, divide_thousands задают отображение, сохраняя исходные числа. overwrite:replace разрешён только при явном согласии заменить всю книгу. Дописывание и замена отдельного листа недоступны.\n';
    const artifacts = {'proposed-card.json': JSON.stringify(normalized, null, 2) + '\n', 'proposed-reference.md': reference + addition, 'proposed-route.txt': route + '\n'};
    for (const [name, data] of Object.entries(artifacts)) {
      if (process.argv.includes('--write')) await writeFile(new URL(name, directory), data);
      else assert.equal(await readFile(new URL(name, directory), 'utf8'), data, name + ' drift');
    }
    sizes.push({type: base.type, base_card_bytes: bytes(base), proposed_card_bytes: bytes(normalized),
      route_bytes: Buffer.byteLength(route), reference_bytes: Buffer.byteLength(artifacts['proposed-reference.md'])});
    assert.ok(bytes(normalized) <= 12000);
    assert.ok(Buffer.byteLength(route) <= 200);
    assert.ok(Buffer.byteLength(artifacts['proposed-reference.md']) <= 6000);
  }
  const model = tool => {const {name, description, inputSchema} = userNodeTool(tool); return bytes({name, description, inputSchema});};
  const summary = {base_full_input_schema_bytes: bytes(baseFull.inputSchema), proposed_full_input_schema_bytes: bytes(full.inputSchema),
    base_model_tool_bytes: model(baseFull), proposed_model_tool_bytes: model(full),
    base_skill_bytes: Buffer.byteLength(await readFile(skillPath, 'utf8')), proposed_skill_bytes: Buffer.byteLength(proposedSkill), sizes};
  assert.ok(summary.proposed_model_tool_bytes <= 20000);
  assert.ok(summary.proposed_skill_bytes <= 40000);
  console.log(JSON.stringify(summary, null, 2));
} finally {
  for (const cleanup of cleanups) await cleanup();
}
