import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {javascriptPersistenceCase} from './javascript-persistence-cases.mjs';
import {verifyJavascriptPersistenceOutput} from './javascript-persistence-oracle.mjs';
import {inspectJavascriptModulePolicy} from '../../client/lib/javascript-module-policy.mjs';

const finalMarker = 'JS_G7_FINAL_V2 — Сумма & <tag> "quotes" \'single\' \\ backslash 😀';
const observed = revision => ({row_count: 6, sample_rows: 6, sample_complete: true,
  schema: [{name: 'ObservedID', label: 'ObservedID', type: 'integer'}, {name: 'PhaseMarker', label: 'PhaseMarker', type: 'string'}],
  sample: ['1', '2', '3', '4', '5', '6'].map(id => [
    {type: 'integer', is_null: false, precision: 'exact_integer', value: id},
    {type: 'string', is_null: false, value: revision === 1 ? 'JS_G2_TABLE_V1' : finalMarker},
  ]),
});

for (const mode of ['code', 'declared']) test('fixed persistence sources and policy: ' + mode, () => {
  const fixture = javascriptPersistenceCase(mode);
  assert.equal(fixture.schema_mode, mode);
  assert.equal(fixture.revisions.length, 2);
  assert.ok(Object.isFrozen(fixture) && Object.isFrozen(fixture.revisions));
  assert.notEqual(fixture.revisions[0].source_sha256, fixture.revisions[1].source_sha256);
  for (const item of fixture.revisions) {
    assert.ok(Object.isFrozen(item));
    assert.equal(createHash('sha256').update(item.source).digest('hex'), item.source_sha256);
    assert.equal(Buffer.byteLength(item.source), item.source_utf8_bytes);
    assert.equal(item.source.split('\n').length, item.source_lf_lines);
    assert.equal(inspectJavascriptModulePolicy(item.source).status, 'ADMITTED');
    assert.equal(item.source.includes('OutputTable.AssignColumns'), mode === 'code');
  }
  assert.ok(fixture.revisions[1].source.includes(JSON.stringify(finalMarker)));
  assert.equal(fixture.writer_budget_ms, 1800000);
  assert.equal(fixture.reader_budget_ms, 600000);
});

for (const revision of [1, 2]) test('persistence output independently matches revision ' + revision, () => {
  assert.equal(verifyJavascriptPersistenceOutput(observed(revision), revision).verified, true);
  assert.throws(() => verifyJavascriptPersistenceOutput(observed(revision), revision === 1 ? 2 : 1));
});

const faults = {
  stale: table => { table.sample[0][1].value = 'JS_G2_TABLE_V1'; },
  value: table => { table.sample[0][0].value = '7'; },
  type: table => { table.sample[0][0].type = 'real'; },
  schemaType: table => { table.schema[0].type = 'real'; },
  schemaName: table => { table.schema[1].name = 'Other'; },
  schemaLabel: table => { table.schema[1].label = 'Old label'; },
  order: table => { table.sample.reverse(); },
  count: table => { table.row_count = 7; },
  missing: table => { table.sample.pop(); },
  extraColumn: table => { table.sample[0].push(table.sample[0][1]); },
  null: table => { table.sample[1][1].is_null = true; },
  inexact: table => { table.sample[0][0].precision = 'formatted'; },
  incomplete: table => { table.sample_complete = false; },
  truncated: table => { table.truncated = true; },
};
for (const [name, change] of Object.entries(faults)) test('persistence oracle refuses ' + name, () => {
  const table = observed(2); change(table);
  assert.throws(() => verifyJavascriptPersistenceOutput(table, 2), /typed output differs/);
});
test('persistence rejects arbitrary mode and revision', () => {
  assert.throws(() => javascriptPersistenceCase('arbitrary'));
  assert.throws(() => verifyJavascriptPersistenceOutput(observed(2), 3));
});
