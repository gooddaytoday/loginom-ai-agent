import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSession} from '../lib/session.mjs';

test('session metadata records the private browser recovery capability', async t => {
  const stateDir = await mkdtemp(join(tmpdir(), 'session-browser-recovery-'));
  t.after(() => rm(stateDir, {recursive:true, force:true}));
  for (const browserRecovery of [true, undefined]) {
    const session = await createSession({
      stateDir, mode:'executor-replay', agent:'loginom-ai-agent', adapterRevision:'1',
      loginomUrl:'https://loginom.test/app/', browserRecovery,
    }, {
      headless:true,
      managed:{directory:join(stateDir, String(browserRecovery)), browserPath:process.execPath, browserRoot:stateDir},
    });
    assert.equal(session.metadata.browserRecovery, browserRecovery === true);
  }
});


test('only recovery-enabled executor sessions disable automatic snapshots', async t => {
  const stateDir = await mkdtemp(join(tmpdir(), 'session-snapshots-'));
  t.after(() => rm(stateDir, {recursive:true, force:true}));
  for (const mode of ['executor-replay', 'executor-preview', 'classic']) for (const browserRecovery of [true, false]) {
    const session = await createSession({stateDir, mode, browserRecovery, agent:'loginom-ai-agent', adapterRevision:'1',
      loginomUrl:'https://loginom.test/app/'}, {headless:true,
      managed:{directory:join(stateDir, mode+browserRecovery), browserPath:process.execPath, browserRoot:stateDir}});
    const config = JSON.parse(await readFile(session.browserConfig, 'utf8'));
    assert.deepEqual(config.snapshot, browserRecovery && mode !== 'classic' ? {mode:'none'} : undefined);
  }
});
