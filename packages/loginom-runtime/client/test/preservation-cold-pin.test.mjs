import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {verifyPreservationColdPin} from '../../../../docs/node-development/nodes/field-parameters/acceptance/preservation-cold-preflight.mjs';
import {parseExpectedOutputs} from '../../../../scripts/node-acceptance/expected-outputs.mjs';
const base=new URL('../../../../docs/node-development/nodes/field-parameters/acceptance/',import.meta.url);
const template=JSON.parse(await readFile(new URL('fixtures/preservation/cold-source-template.json',base),'utf8'));
const bytes=await readFile(new URL('fixtures/preservation/rowid-ab-c.csv',base));
const valid=()=>{
 const expected=structuredClone(template),bindings={account:'offline_operator',package_path:'/offline_operator/preservation.lgp',source_path:'/offline_operator/rowid-ab-c.csv',fixture_path:'fixtures/preservation/rowid-ab-c.csv'};
 expected.package_path=bindings.package_path;expected.static_sources[0].source_path=bindings.source_path;
 return {expected,bindings,bytes};
};
test('full explicit pin is ready offline but grants no native source proof',()=>{
 const r=verifyPreservationColdPin(valid());assert.equal(r.pin_ready,true);assert.equal(r.native_source_verified,false);
});
for(const [name,mutate] of Object.entries({
 missing:v=>delete v.expected.static_sources,empty:v=>v.expected.static_sources=[],
 incomplete:v=>delete v.expected.static_sources[0].sha256,
 wrongBytes:v=>v.bytes=Buffer.concat([v.bytes,Buffer.from('x')]),
 wrongSize:v=>v.expected.static_sources[0].bytes=166,
 wrongSHA:v=>v.expected.static_sources[0].sha256='0'.repeat(64),
 missingFormat:v=>delete v.expected.static_sources[0].format.null_marker,
 wrongDelimiter:v=>v.expected.static_sources[0].format.delimiter=',',
 wrongNull:v=>v.expected.static_sources[0].format.null_marker='?',
 wrongEncoding:v=>v.expected.static_sources[0].encoding='UTF-16',
 UIProvenance:v=>v.expected.static_sources[0].provenance='observed_ui_values',
 outputProvenance:v=>v.expected.static_sources[0].provenance='output_generated',
 wrongReceipt:v=>v.expected.static_sources[0].required_receipt_provenance='model_receipt',
 wrongFixture:v=>v.bindings.fixture_path='fixtures/preservation/wide-130.csv',
 duplicate:v=>v.expected.static_sources.push(structuredClone(v.expected.static_sources[0])),
 foreignSource:v=>v.expected.static_sources[0].source_path='/foreign/rowid-ab-c.csv',
 foreignPackage:v=>v.bindings.package_path='/foreign/preservation.lgp',
 unresolved:v=>v.expected=structuredClone(template)
}))test('local preservation pin refuses '+name,()=>{const v=valid();mutate(v);assert.throws(()=>verifyPreservationColdPin(v));});

test('existing expected parser accepts template shape even without static_sources; local guard does not',()=>{
 const v=valid();assert.equal(parseExpectedOutputs(v.expected).outputs[0].rows.length,5);
 delete v.expected.static_sources;
 assert.equal(parseExpectedOutputs(v.expected).outputs[0].rows.length,5);
 assert.throws(()=>verifyPreservationColdPin(v),/static source required/);
});
