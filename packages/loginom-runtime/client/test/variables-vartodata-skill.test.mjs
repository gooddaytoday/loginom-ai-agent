import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('variables.to_table reference teaches in-place mode switch and source edit within the node budget',async()=>{
 const root=new URL('../../../product/skills/loginom-automation/',import.meta.url);
 const reference=await readFile(new URL('references/nodes/variables.to_table.md',root),'utf8');
 assert.ok(Buffer.byteLength(reference)<=6000);
 assert.doesNotMatch(reference,/\$(?:[1-9][0-9]*|ARGUMENTS)\b/);
 assert.match(reference,/<!-- mode: columns rows -->/);assert.match(reference,/<!-- \/mode -->/);
 for(const term of ['target:{kind:"existing"','mode`','parameters:{}','mappings:[]','variable_inputs','том же узле','в самом источнике'])assert.ok(reference.includes(term),term);
 assert.doesNotMatch(reference,/Переключение режима существующего узла/);
});
