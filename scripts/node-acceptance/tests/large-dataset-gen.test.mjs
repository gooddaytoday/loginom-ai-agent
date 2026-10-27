import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// csv.reader and Decimal independently parse the serialized output. Neither
// generator code nor its typed record construction participates in this oracle.
const check = String.raw`
import csv, decimal, hashlib, json, pathlib, sys
p, m = map(pathlib.Path, sys.argv[1:])
oracle = json.loads(m.read_text())
data = p.read_bytes()
assert len(data) == oracle['bytes']
assert hashlib.sha256(data).hexdigest() == oracle['sha256']
sums = {k: 0 for k in oracle['sums_minor_by_region']}
counts = {k: 0 for k in sums}
nulls, rows, first = 0, 0, None
with p.open(encoding='utf-8-sig' if oracle['bom'] else oracle['encoding'], newline='') as f:
 reader = csv.reader(f, delimiter=oracle['delimiter'], strict=True)
 for _ in range(oracle['rows_to_skip'] + int(oracle['first_line_as_title'])): next(reader)
 for r in reader:
  rows += 1
  assert len(r) == 3
  counts[r[0]] += 1
  if r[1] == 'NULL': nulls += 1; continue
  try: sums[r[0]] += int(decimal.Decimal(r[1].replace(',', '.')) * 100)
  except decimal.InvalidOperation:
   if first is None: first = rows
assert rows == oracle['records']
assert sums == oracle['sums_minor_by_region']
assert counts == oracle['records_by_region']
assert nulls == oracle['nulls']
assert first == (oracle['first_violation']['logical_record'] if oracle['first_violation'] else None)
if first:
 v = oracle['first_violation']; start = v['byte_offset']
 assert data[start:].split(b';', 2)[1] == b'TYPE_CHANGE'
 assert data[:start].count(b'\n') + 1 == v['physical_line']
`;

for (const encoding of ['utf-8', 'cp1251']) for (const delimiter of [';', ',']) for (const eol of ['LF', 'CRLF']) {
  test(`independent parser: ${encoding} ${delimiter} ${eol}`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'large-gen-test-'));
    try {
      const csv = join(dir, 'data.csv'), manifest = join(dir, 'manifest.json');
      const flags = ['scripts/node-acceptance/large-dataset-gen.py', '--output', csv, '--manifest', manifest,
        '--rows', '233', '--encoding', encoding, '--delimiter', delimiter, '--line-endings', eol, '--rows-to-skip', '2', '--seed', '42'];
      if (encoding === 'utf-8') flags.push('--bom');
      if (delimiter === ';') flags.push('--type-change-fraction', '.96');
      let out = spawnSync('python3', flags, {encoding: 'utf8'});
      assert.equal(out.status, 0, out.stderr);
      const original = readFileSync(csv);
      out = spawnSync('python3', ['-c', check, csv, manifest], {encoding: 'utf8'});
      assert.equal(out.status, 0, out.stderr);
      out = spawnSync('python3', flags, {encoding: 'utf8'});
      assert.equal(out.status, 0, out.stderr);
      assert.deepEqual(readFileSync(csv), original);
    } finally { rmSync(dir, {recursive: true, force: true}); }
  });
}

test('minimum byte boundary rounds up to complete record', () => {
  const dir = mkdtempSync(join(tmpdir(), 'large-gen-test-'));
  try {
    const out = spawnSync('python3', ['scripts/node-acceptance/large-dataset-gen.py', '--output', join(dir, 'data.csv'),
      '--manifest', join(dir, 'manifest.json'), '--min-bytes', '65537', '--no-header'], {encoding: 'utf8'});
    assert.equal(out.status, 0, out.stderr);
    const m = JSON.parse(readFileSync(join(dir, 'manifest.json')));
    assert.ok(m.bytes >= 65537 && m.bytes < 66561);
    assert.equal(spawnSync('python3', ['-c', check, join(dir, 'data.csv'), join(dir, 'manifest.json')], {encoding:'utf8'}).status, 0);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
