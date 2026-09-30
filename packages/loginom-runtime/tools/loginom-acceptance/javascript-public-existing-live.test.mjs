import test from 'node:test';
import assert from 'node:assert/strict';
import {runJavascriptOperator} from './javascript-live.mjs';

const paths=['--config','/not-read/private.json','--profile','/not-created/profile',
  '--browser','/not-opened/chrome','--evidence','/not-created/evidence'];
const saved='/jsteach/js-g2-9150c962-ad60-4cd4-a13e-bcba89b982d8/JavaScript-9150c962-ad60-4cd4-a13e-bcba89b982d8.lgp';

test('existing entrypoints require known mode and strict separate saved-package ownership',async()=>{
  for(const options of [{existingLifecycle:'unknown',coldReader:true},{existingLifecycle:'code'},
    {existingLifecycle:'declared',coldReader:true,packageFile:true}]) {
    await assert.rejects(()=>runJavascriptOperator(paths,options),/Existing lifecycle requires/);
  }
  for(const mode of ['code','declared']) {
    for(const extra of [['--source','payload'],['--package','/other/unknown.lgp'],
      ['--package',saved,'--execution-case','code-table-execute'],
      ['--package',saved,'--x11-no-focus'],['--package',saved,'--verify-public-code-lifecycle']]) {
      await assert.rejects(()=>runJavascriptOperator([...paths,...extra],{coldReader:true,existingLifecycle:mode}));
    }
  }
});

test('schema refusal entrypoint rejects unknown case, wrong mode and mixed edit cases before config',async()=>{
 for(const options of [{coldReader:true,existingLifecycle:'code',publicSchemaRefusalCaseId:'unknown'},
  {coldReader:true,existingLifecycle:'declared',publicSchemaRefusalCaseId:'code-to-declared'},
  {coldReader:true,existingLifecycle:'code',publicSchemaRefusalCaseId:'code-to-declared',publicSourceCaseId:'fidelity-bound-code'},
  {coldReader:true,existingLifecycle:'code',publicSchemaRefusalCaseId:'code-to-declared',existingInputVariant:'changed'}])
  await assert.rejects(()=>runJavascriptOperator(paths,options),/Public schema refusal|Public source case/);
});
