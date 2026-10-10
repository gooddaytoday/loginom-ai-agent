import { readFile, writeFile } from 'node:fs/promises';
import { matchesExpectedOutput } from '../../../../../scripts/node-acceptance/expected-outputs.mjs';
const [actualPath, expectedPath, reportPath] = process.argv.slice(2);
const actual = JSON.parse(await readFile(actualPath,'utf8'));
const expected = JSON.parse(await readFile(expectedPath,'utf8'));
if(actual.status !== 'PASS' || actual.path !== expected.package_path || actual.settingsReapplied !== false
 || actual.cleanup?.package_closed !== true || actual.cleanup?.logged_out !== true) throw Error('COLD_IDENTITY_OR_CLEANUP');
if(actual.outputs.length !== expected.outputs.length) throw Error('OUTPUT_COUNT');
const checks = expected.outputs.map((want,index) => {
 const binding = actual.correspondence.filter(c=>c.expected_index===index);
 if(binding.length!==1) throw Error('AMBIGUOUS_OUTPUT');
 const outputs=actual.outputs.filter(a=>a.node.node_id===binding[0].node.node_id);
 if(outputs.length!==1) throw Error('MISSING_BOUND_OUTPUT');
 const output=outputs[0],data=output.output.ports[0];
 if(output.execution.status!=='completed'||output.execution.verified!==true||output.execution.owner_verified!==true) throw Error('FRESH_EXECUTION');
 if(!matchesExpectedOutput(data,want)) throw Error('SCHEMA_OR_MULTISET');
 if(want.output_node_type==='transform.sorting'&&!want.rows.every((row,i)=>matchesExpectedOutput({...data,row_count:1,sample:[data.sample[i]],sample_complete:true},{...want,rows:[row]}))) throw Error('WRONG_SORT_ORDER:'+want.output_node_label);
 return {label:want.output_node_label,node_id:output.node.node_id,multiset:true,ordered:want.output_node_type==='transform.sorting'};
});
const report={status:'PASS',phase:'independent_order_and_multiset',package_path:actual.path,checks,cleanup:actual.cleanup};
await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
