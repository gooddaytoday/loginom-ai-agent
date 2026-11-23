import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseExpectedOutputs} from '../expected-outputs.mjs';
// Cold-check parses these before re-executing the saved package (LAB-1555).
for(const kind of ['table','sql'])test('imports.database '+kind+' expectations parse for cold-check',()=>{
 const expected=JSON.parse(readFileSync(new URL('../../../docs/node-development/nodes/imports-database/acceptance/expected-'+kind+'-run.json',import.meta.url)));
 const {outputs}=parseExpectedOutputs({...expected,package_path:'/own/p.lgp'});
 assert.equal(outputs[0].output_node_type,'imports.database');
 assert.equal(outputs[0].rows.length,kind==='table'?6:3);
});
