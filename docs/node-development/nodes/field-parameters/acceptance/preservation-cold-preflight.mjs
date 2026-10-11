// Local operator preflight only; no session, launcher or public cold-check changes.
import {verifyStaticSourceFixture} from '../../../../../scripts/node-acceptance/static-source-proof.mjs';
const need=(v,m)=>{if(!v)throw Error('PRESERVATION_COLD_PIN:'+m);};
const fixture='fixtures/preservation/rowid-ab-c.csv';
const sha='5f1b19c2d28d1548bdc287fff6e61fbaee72147753379a2aaa5e38d56dca72a3';
const format={delimiter:';',decimal_separator:'.',null_marker:'NULL',text_qualifier:'"'};
// Independent literal import contract, before Reform rename/exclusion; never output-derived.
const columns=[{"name":"RowID","label":"RowID","type":"integer"},{"name":"A","label":"Same","type":"string"},{"name":"B","label":"Same","type":"integer"},{"name":"C","label":"Unused","type":"boolean"},{"name":"Extra","label":"Unrequested","type":"string"}];
export function verifyPreservationColdPin({expected,bindings,bytes}){
 need(bindings&&typeof bindings.account==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(bindings.account),'explicit account required');
 const prefix='/'+bindings.account+'/';
 need(typeof bindings.package_path==='string'&&bindings.package_path.startsWith(prefix)
  &&/^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.lgp$/.test(bindings.package_path.slice(prefix.length))
  &&expected?.package_path===bindings.package_path,'explicit own package path');
 need(bindings.source_path===prefix+'rowid-ab-c.csv'&&bindings.fixture_path===fixture,'unambiguous own source/fixture path');
 need(Array.isArray(expected.static_sources)&&expected.static_sources.length===1,'one complete static source required');
 const p=expected.static_sources[0];
 need(p&&p.source_path===bindings.source_path&&p.fixture_path===fixture,'source path binding differs');
 need(p.provenance==='authored_fixture_bytes_contract'
  &&p.fixture_commit==='738ae7b8c622b696245bda6473e64d9e77a19eac'
  &&p.encoding==='UTF-8'&&p.required_receipt_provenance==='independent_server_file_download','independent fixture provenance required');
 need(p.bytes===167&&p.sha256===sha,'assigned bytes/SHA differ');
 need(p.format&&Object.keys(p.format).sort().join(',')===Object.keys(format).sort().join(',')
  &&Object.keys(format).every(k=>p.format[k]===format[k]),'complete canonical format required');
 need(JSON.stringify(p.columns)===JSON.stringify(columns),'complete literal import schema required');
 verifyStaticSourceFixture({bytes,allowed:[p],format});
 return {pin_ready:true,native_source_verified:false,source_path:p.source_path,package_path:bindings.package_path};
}
