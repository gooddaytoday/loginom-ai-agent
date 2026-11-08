import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Calculator node reference fits its budget, names the option parameters and has no slash placeholders',async()=>{
 const root=new URL('../../../product/skills/loginom-automation/',import.meta.url);
 const reference=await readFile(new URL('references/nodes/transform.calculator.md',root),'utf8');
 assert.ok(Buffer.byteLength(reference)<=6000);
 assert.doesNotMatch(reference,/\$(?:[1-9][0-9]*|ARGUMENTS)\b/);
 for(const text of ['intermediate','cached','Expr.','order','cached:false'])assert.ok(reference.includes(text),text);
});
