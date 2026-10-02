import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cpSync,mkdirSync,mkdtempSync,rmSync,symlinkSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

test('isolated cold operator imports and help need no checkout business oracle',()=>{
  const root=mkdtempSync(join(tmpdir(),'javascript-cold-import-'));
  try{
    const qa=join(root,'runtime/tools/loginom-acceptance');
    mkdirSync(join(root,'runtime/tools'),{recursive:true});
    cpSync(fileURLToPath(new URL('./',import.meta.url)),qa,{recursive:true,
      filter:path=>!path.includes('__pycache__')});
    for(const name of ['client','src','executor','examples'])
      symlinkSync(fileURLToPath(new URL('../../'+name,import.meta.url)),join(root,'runtime',name),'dir');
    assert.equal(existsSync(join(root,'docs')),false);
    const loaded=spawnSync(process.execPath,['--input-type=module','-e',
      "const m=await import(process.argv[1]); if(typeof m.runJavascriptOperator!=='function')process.exit(1);",
      pathToFileURL(join(qa,'javascript-live.mjs')).href],{encoding:'utf8',timeout:20000,cwd:root});
    assert.equal(loaded.status,0,loaded.stderr);
    const help=spawnSync(process.execPath,[join(qa,'javascript-persistence-read-live.mjs'),'--help'],
      {encoding:'utf8',timeout:20000,cwd:root});
    assert.equal(help.status,0,help.stderr);
    assert.match(help.stdout,/javascript-persistence-read-live/);
    const missing=spawnSync(process.execPath,['--input-type=module','-e',
      "const m=await import(process.argv[1]); m.javascriptBusinessProbes();",
      pathToFileURL(join(qa,'javascript-business-probes.mjs')).href],{encoding:'utf8',timeout:20000,cwd:root});
    assert.equal(missing.status,1);
    assert.match(missing.stderr,/ENOENT/);
    assert.match(missing.stderr,/manifest\.json/);
  }finally{rmSync(root,{recursive:true,force:true});}
});
