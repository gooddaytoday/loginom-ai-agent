import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { withDiagnosticSession } from '../diagnostic-session.mjs'
import { makePackageCleanupCode } from '../../../packages/loginom-runtime/client/lib/package-cleanup.mjs'

const identity = { sessionId: 'own-session', account: 'lab-slot-b', packagePath: '/lab-slot-b/own.lgp',
  loginomUrl: 'http://loginom.example/app/', loginomBuild: '7.4.2', diagnosticDiscard: true }
const prepared = { status: 'READY', document_id: 'own-document', package_ref: { path: identity.packagePath }, workflow_ref: { tab_tid: 'own-tab' } }
const receipt = { status: 'SUCCEEDED', package_closed: true, logged_out: true,
  session_id: identity.sessionId, account: identity.account, package_path: identity.packagePath, document_id: prepared.document_id }

for (const scenario of ['success', 'exception', 'cleanup failure', 'wrong receipt', 'prepare failure', 'missing build']) {
  test(scenario, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'diagnostic-session-'))
    let closed = false
    let cleanupCalls = 0
    const run = () => withDiagnosticSession({ directory, identity: scenario === 'missing build' ? { ...identity, loginomBuild: undefined } : identity, makeCleanupCode: makePackageCleanupCode,
      context: { close: async () => { closed = true } },
      execute: async code => {
        cleanupCalls++
        assert.match(code, /own-document/)
        assert.match(code, /7\.4\.2/)
        if (scenario === 'cleanup failure') throw Error('secret-bearing-error')
        return scenario === 'wrong receipt' ? { ...receipt, session_id: 'other' } : receipt
      },
    }, async ({ bindPrepared }) => {
      if (scenario === 'prepare failure') throw Error('prepare-failed')
      await bindPrepared(prepared)
      const saved = JSON.parse(await readFile(join(directory, 'session.json')))
      assert.equal(saved.prepared.document_id, 'own-document')
      if (scenario === 'exception') throw Error('original-error')
      return 'done'
    })
    try {
      if (scenario === 'success') assert.equal(await run(), 'done')
      else await assert.rejects(run, scenario === 'exception' ? /original-error/ : scenario === 'prepare failure' ? /prepare-failed/ : scenario === 'missing build' ? /Exact isolated cleanup identity required/ : /CLEANUP_UNCONFIRMED/)
      assert.equal(closed, true)
      assert.equal(cleanupCalls, ['prepare failure', 'missing build'].includes(scenario) ? 0 : 1)
      const cleanup = JSON.parse(await readFile(join(directory, 'cleanup.json')))
      assert.equal(cleanup.confirmed, scenario === 'success' || scenario === 'exception')
      assert.doesNotMatch(JSON.stringify(cleanup), /secret-bearing-error/)
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
}
