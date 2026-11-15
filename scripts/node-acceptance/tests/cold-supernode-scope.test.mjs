import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Execute the actual cold dispatch predicate without opening a browser.
const source=readFileSync(new URL('../cold-check.mjs',import.meta.url),'utf8');
const match=source.match(/if\(([^\n]+)\)graph=await observeSupernodeSaved\(/);
assert.ok(match,'saved-supernode audit dispatch is present');
const audit=vm.runInNewContext('(expected)=>('+match[1]+')');
const calculator=JSON.parse(readFileSync(new URL('../../../docs/node-development/nodes/control-supernode/acceptance/expected.json',import.meta.url),'utf8'));
test('direct supernode calculator cold scenario retains its topology audit',()=>{
 assert.equal(audit(calculator),true);
});
test('REST export cold scenario uses ordinary saved-output verification',()=>{
 const rest={...calculator,nodes:[...calculator.nodes,{type:'exports.text'}],outputs:[{...calculator.outputs[0],output_node_type:'export_input'}]};
 assert.equal(audit(rest),false);
});
