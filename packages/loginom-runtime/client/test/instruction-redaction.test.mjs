import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createRedactor} from '../lib/redact.mjs';

// Journal ACKs compare the redacted record exactly. Credential-assignment syntax
// such as `action_key:"…"` in model instructions is redacted and breaks the ACK.
test('model instructions survive journal redaction unchanged',async()=>{
 const directory=new URL('../lib/',import.meta.url).pathname,redactor=createRedactor([]);
 const literals=(await Promise.all((await readdir(directory)).filter(name=>name.endsWith('.mjs')).map(async name=>
  [...(await readFile(join(directory,name),'utf8')).matchAll(/instruction:\s*'((?:\\.|[^'\\])*)'/g)].map(m=>({name,text:m[1]})))) ).flat();
 assert.ok(literals.length>10,'instruction literals were found');
 for(const literal of literals)assert.equal(redactor.redact({instruction:literal.text}).instruction,literal.text,literal.name+': '+literal.text.slice(0,120));
});
