import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {JAVASCRIPT_CARD_LIMITATIONS,JAVASCRIPT_KNOWLEDGE_SHA256,describeJavascriptKnowledge} from '../lib/javascript-knowledge.mjs';
import {createRuntimeSourcePin} from '../lib/runtime-pin.mjs';
import {javascriptExecutionProbes} from '../../tools/loginom-acceptance/javascript-execution-probes.mjs';

test('7.4.2 knowledge contains only exact headed probes and rejects another observed build',async()=>{
  const knowledge=describeJavascriptKnowledge('7.4.2');
  assert.equal(knowledge.knowledge_sha256,JAVASCRIPT_KNOWLEDGE_SHA256);
  assert.equal(JAVASCRIPT_CARD_LIMITATIONS.length,7);
  assert.deepEqual(knowledge.limitations,JAVASCRIPT_CARD_LIMITATIONS);
  assert.equal(knowledge.validated_for.server_os,'Linux');
  assert.equal(knowledge.validated_for.source_prompt_sha256,
    createHash('sha256').update(await readFile(new URL('../../../../docs/node-development/nodes/programming-javascript/references/js_node_loginom_system_prompt.md',import.meta.url))).digest('hex'));
  for(const example of knowledge.examples){
    const probe=javascriptExecutionProbes('RowID').find(item=>item.id===example.id);
    assert.ok(probe,example.id);
    assert.equal(example.source,probe.source,example.id);
    assert.equal(example.source_sha256,probe.source_sha256,example.id);
    assert.equal(createHash('sha256').update(example.source).digest('hex'),example.source_sha256,example.id);
  }
  assert.throws(()=>describeJavascriptKnowledge('7.4.3'),/not validated/);
  assert.throws(()=>describeJavascriptKnowledge(undefined),/not validated/);
  knowledge.examples[0].source='changed';
  assert.equal(describeJavascriptKnowledge('7.4.2').examples[0].source,javascriptExecutionProbes('RowID').find(item=>item.id==='declared-table-v1').source);
});

test('knowledge module is included in the client revision and mutation changes its pin',async()=>{
  const live=await createRuntimeSourcePin(new URL('../lib/session.mjs',import.meta.url));
  const moduleEntry=live.manifest.find(item=>item.path==='./javascript-knowledge.mjs');
  assert.ok(moduleEntry);
  assert.equal(moduleEntry.sha256,createHash('sha256').update(await readFile(new URL('../lib/javascript-knowledge.mjs',import.meta.url))).digest('hex'));
  const directory=await mkdtemp(join(tmpdir(),'javascript-knowledge-pin-'));
  try{
    await mkdir(join(directory,'lib'));
    const target=join(directory,'lib/javascript-knowledge.mjs');
    await writeFile(target,await readFile(new URL('../lib/javascript-knowledge.mjs',import.meta.url)));
    const base=pathToFileURL(join(directory,'lib/session.mjs'));
    const first=await createRuntimeSourcePin(base);
    await writeFile(target,(await readFile(target,'utf8'))+'\n');
    const second=await createRuntimeSourcePin(base);
    assert.notEqual(second.revision,first.revision);
  }finally{await rm(directory,{recursive:true,force:true});}
});
