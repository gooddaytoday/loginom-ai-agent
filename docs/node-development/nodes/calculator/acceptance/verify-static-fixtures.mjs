// Offline verification of independently pinned Calculator CSV fixtures.
// No browser, account, saved package or UI-derived expectations are used.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyStaticSourceFixture} from '../../../../../scripts/node-acceptance/static-source-proof.mjs';

const expected=JSON.parse(await readFile(new URL('./expected.json',import.meta.url),'utf8'));
const format={delimiter:';',decimal_separator:'.',null_marker:'\\N',text_qualifier:'"'};
const columns=[['Id','integer'],['Region','string'],['Quantity','integer'],['UnitPrice','real'],['Comment','string']].map(([name,type])=>({name,label:name,type}));
assert.equal(expected.static_sources.length,1);
const fixture=expected.static_sources[0];
assert.equal(fixture.file,'data/sales.csv');
assert.equal(fixture.bytes,230);
assert.equal(fixture.sha256,'f628434c20873f7dd9a8ee142c17af7c0b99f447114fcf60e983f6ed6b357eb3');
assert.deepEqual(fixture.format,format);
assert.deepEqual(fixture.columns,columns);
const bytes=await readFile(new URL('./'+fixture.file,import.meta.url));
assert.equal(bytes.toString('utf8').split('\n')[0],columns.map(c=>c.name).join(';'));
assert.equal(verifyStaticSourceFixture({bytes,allowed:expected.static_sources,format}).fixture,fixture);

// The real assigned bytes cannot validate a different parser, ambiguous pin,
// incomplete pin, or another byte sequence of the same length.
let refused=0;
for(const bad of [
 {bytes,allowed:expected.static_sources,format:{...format,delimiter:','}},
 {bytes,allowed:expected.static_sources,format:{...format,null_marker:'?'}},
 {bytes,allowed:expected.static_sources,format:{...format,decimal_separator:','}},
 {bytes,allowed:expected.static_sources,format:{...format,text_qualifier:"'"}},
 {bytes,allowed:[fixture,fixture],format},
 {bytes,allowed:[{...fixture,format:{delimiter:';'}}],format},
 {bytes:Buffer.from(bytes.map((v,i)=>i===0?v^1:v)),allowed:expected.static_sources,format},
]){assert.throws(()=>verifyStaticSourceFixture(bad),/^Error: COLD_SOURCE:/);refused++;}
console.log(JSON.stringify({scope:'offline_calculator_static_csv_pin',live_cold_read:false,fixtures:1,bytes:bytes.length,sha256:fixture.sha256,format,columns,negative_cases_refused:refused,status:'PASS'}));
