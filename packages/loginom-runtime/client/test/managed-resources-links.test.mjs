import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, symlink, unlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

test('managed resources accept framework links and reject changed or escaped targets', {skip:process.platform === 'win32'}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'managed-resource-links-'));
  try {
    await mkdir(join(root, 'bin'));
    await mkdir(join(root, 'Framework/Versions/A'), {recursive:true});
    const node = join(root, 'bin/node');
    await copyFile(process.execPath, node);
    await writeFile(join(root, 'browser'), 'browser-fixture');
    await writeFile(join(root, 'Framework/Versions/A/binary'), 'framework-fixture');
    const files = await Promise.all(['bin/node','browser','Framework/Versions/A/binary'].map(async path => ({
      path, sha256:createHash('sha256').update(await readFile(join(root,path))).digest('hex'),
    })));
    const manifest = {protocol:1,nodeVersion:process.versions.node,node:'bin/node',browser:'browser',files};
    const script = `import assert from 'node:assert/strict';
      import { verifyResources } from ${JSON.stringify(new URL('../../src/resources.mjs', import.meta.url).href)};
      if (process.argv[2]) await assert.rejects(verifyResources(process.argv[1]), {message:process.argv[2]});
      else await verifyResources(process.argv[1]);`;
    async function check(error='') {
      await writeFile(join(root,'resource-manifest.json'),JSON.stringify(manifest));
      const result=spawnSync(node,['--input-type=module','--eval',script,root,error],{encoding:'utf8',timeout:10000});
      assert.equal(result.status,0,result.stderr);
    }
    await check();
    await symlink('A',join(root,'Framework/Versions/Current'));
    files.push({path:'Framework/Versions/Current',link:'A',directory:true,
      sha256:createHash('sha256').update('A').digest('hex')});
    await check();
    await writeFile(join(root,'Framework/Versions/A/binary'),'changed');
    await check('LOGINOM_RESOURCE_HASH_MISMATCH');
    await writeFile(join(root,'Framework/Versions/A/binary'),'framework-fixture');
    files.at(-1).link='B';
    await check('LOGINOM_RESOURCES_INVALID');
    files.at(-1).link='A';
    await unlink(join(root,'Framework/Versions/Current'));
    await symlink(tmpdir(),join(root,'Framework/Versions/Current'));
    await check('LOGINOM_RESOURCES_INVALID');
  } finally {
    await rm(root,{recursive:true,force:true});
  }
});
