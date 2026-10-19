import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
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
