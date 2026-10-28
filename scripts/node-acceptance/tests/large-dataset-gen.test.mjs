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

// Independent stdlib XML/ZIP reader: no imports from the generator.
const checkXlsx = String.raw`
import zipfile, xml.etree.ElementTree as ET, decimal, json, pathlib, sys, hashlib
p, m = map(pathlib.Path, sys.argv[1:])
oracle = json.loads(m.read_text())
assert p.stat().st_size == oracle['bytes']
assert hashlib.sha256(p.read_bytes()).hexdigest() == oracle['sha256']
ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
sums = {k: 0 for k in oracle['sums_minor_by_region']}
counts = {k: 0 for k in sums}
nulls, rows, first = 0, 0, None
with zipfile.ZipFile(p) as z:
 strings = [''.join(si.itertext()) for si in ET.fromstring(z.read('xl/sharedStrings.xml'))]
 wb = ET.fromstring(z.read('xl/workbook.xml'))
 assert wb.find('s:workbookPr', ns).get('date1904') == str(int(oracle['date_system'] == '1904'))
 assert wb.find('s:sheets/s:sheet', ns).get('name') == oracle['sheet_name']
 with z.open('xl/worksheets/sheet1.xml') as f:
  for event, r in ET.iterparse(f, events=['end']):
   if r.tag != '{'+ns['s']+'}row': continue
   if int(r.get('r')) <= oracle['header_rows']: r.clear(); continue
   rows += 1
   cells = {}
   for c in r:
    v = c.find('s:v', ns)
    value = ''.join(c.find('s:is', ns).itertext()) if c.get('t') == 'inlineStr' else (v.text if v is not None else None)
    if c.get('t') == 's': value = strings[int(value)]
    cells[c.get('r').rstrip('0123456789')] = (c, value)
   region = cells['A'][1]; counts[region] += 1
   if len(oracle['columns']) >= 2:
    if 'B' not in cells: nulls += 1
    else:
     try: sums[region] += int(decimal.Decimal(cells['B'][1]) * 100)
     except decimal.InvalidOperation:
      if first is None: first = rows
   if len(oracle['columns']) >= 3:
    assert cells['C'][0].get('s') == '2'
    assert int(cells['C'][1]) == 45000 + rows % 365 - (1462 if oracle['date_system'] == '1904' else 0)
   r.clear()
assert rows == oracle['records']
assert sums == oracle['sums_minor_by_region']
assert counts == oracle['records_by_region']
assert nulls == oracle['nulls']
assert first == (oracle['first_violation']['logical_record'] if oracle['first_violation'] else None)
`;
for (const columns of [1, 2, 4, 8]) for (const epoch of ['1900', '1904']) {
  test(`independent XLSX parser: ${columns} columns, ${epoch}`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'large-gen-xlsx-test-'));
    try {
      const xlsx = join(dir, 'data.xlsx'), manifest = join(dir, 'manifest.json');
      const flags = ['scripts/node-acceptance/large-dataset-gen.py', '--format', 'xlsx', '--output', xlsx,
        '--manifest', manifest, '--rows', '233', '--columns', String(columns), '--date-system', epoch,
        '--seed', '42', '--type-change-fraction', '.96'];
      let out = spawnSync('python3', flags, {encoding:'utf8'});
      assert.equal(out.status, 0, out.stderr);
      out = spawnSync('python3', ['-c', checkXlsx, xlsx, manifest], {encoding:'utf8'});
      assert.equal(out.status, 0, out.stderr);
      const original = readFileSync(xlsx);
      out = spawnSync('python3', flags, {encoding:'utf8'});
      assert.equal(out.status, 0, out.stderr);
      assert.deepEqual(readFileSync(xlsx), original);
    } finally { rmSync(dir, {recursive:true, force:true}); }
  });
}
