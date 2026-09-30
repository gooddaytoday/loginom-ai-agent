// Operator-only fixed source cases. No source or expected result is model data.
import {javascriptSourceIdentity} from '../../client/lib/javascript-source-read.mjs';
import {javascriptDiscoveryProbe,javascriptDiscoveryOracle} from './javascript-discovery-probes.mjs';
import {verifyJavascriptMismatchTable} from './javascript-mismatch-probe.mjs';
const need=(value,message)=>{if(!value)throw Error(message);};
export const javascriptPublicSourceIds=Object.freeze(['fidelity-bound-code','empty-source-declared']);
export function javascriptPublicSourceCase(id) {
  need(javascriptPublicSourceIds.includes(id),'Unknown fixed public source case');
  if(id==='empty-source-declared')return {id,schema_mode:'declared',source:'',...javascriptSourceIdentity(''),expected_output_rows:0};
  const lines=[...javascriptDiscoveryProbe('p1-business-code-base').source.split('\n'),
    '  // E fidelity: Ёж 😀; quote " and backslash \\; trailing spaces  ',
    '// URL https://example.invalid/path?a=1&b=2',
    'function sourceFidelityProbe() {',
    '\tif (true) {  ',
    '\t\tconst text = "Кириллица Ёж 😀";  ',
    '\t\treturn text;',
    '\t}',
    '}'];
  while(lines.length<1024)lines.push('// line '+lines.length);
  const padding=32768-Buffer.byteLength(lines.join('\n'),'utf8');
  need(padding>=0&&lines.length===1024,'Fixed source boundary construction differs');
  lines[1023]+=' '.repeat(padding);
  const source=lines.join('\n');
  return {id,schema_mode:'code',source,...javascriptSourceIdentity(source),expected_output_rows:6};
}
export function javascriptPublicSourceOutputOracle(id,table) {
  const spec=javascriptPublicSourceCase(id),probe=javascriptDiscoveryProbe('p1-business-'+spec.schema_mode+'-base');
  if(id==='fidelity-bound-code')return javascriptDiscoveryOracle(probe,table);
  verifyJavascriptMismatchTable(table);
  const schema_verified=JSON.stringify(table.schema.map(column=>({name:column.name,label:column.label,type:column.type})))===JSON.stringify(probe.schema);
  return {schema_verified,values_verified:table.row_count===0,gate_passed:schema_verified&&table.row_count===0,
    expectation:'fixed',scope:'E-empty-source-declared',proof_level:'typed_ui_only',native_bytes_verified:false,gates_closed:[]};
}
