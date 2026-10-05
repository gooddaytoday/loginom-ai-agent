import { mkdir, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'

// The caller supplies the cleanup generator from the exact runtime being tested.
// This helper does not weaken package identity/dirty/running-node guards.
export async function withDiagnosticSession({ context, execute, directory, identity, makeCleanupCode }, run) {
  const { sessionId, account, packagePath, loginomUrl, loginomBuild } = identity
  const persist = async (name, value) => {
    const file = join(directory, name)
    await writeFile(file + '.tmp', JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
    await rename(file + '.tmp', file)
  }
  const state = { prepared: null, cleanup: null, failed: false }
  try {
    // Validate before any diagnostic action, including the mandatory build.
    await mkdir(directory, { recursive: true, mode: 0o700 })
    makeCleanupCode({ ...identity, documentId: 'preflight', tabTid: 'preflight' })
    await persist('session.json', { sessionId, account, packagePath, loginomBuild, prepared: null })
    return await run({
      bindPrepared: async (prepared) => {
        // Capture before returning control to diagnostic code that may throw.
        state.prepared = prepared
        await persist('session.json', { sessionId, account, packagePath, loginomBuild, prepared })
        if (prepared?.status !== 'READY' || prepared.package_ref?.path !== packagePath)
          throw Error('DIAGNOSTIC_PACKAGE_IDENTITY_UNCONFIRMED')
        return prepared
      },
    })
  } catch (error) {
    state.failed = true
    throw error
  } finally {
    let confirmed = false
    try {
      const prepared = state.prepared
      if (prepared?.status === 'READY' && prepared.package_ref?.path === packagePath) {
        state.cleanup = await execute(makeCleanupCode({
          ...identity, sessionId, account, packagePath, loginomUrl, loginomBuild,
          documentId: prepared.document_id, tabTid: prepared.workflow_ref.tab_tid,
        }))
        const receipt = state.cleanup
        confirmed = receipt?.status === 'SUCCEEDED' && receipt.package_closed === true && receipt.logged_out === true
          && receipt.session_id === sessionId && receipt.document_id === prepared.document_id
          && receipt.account === account && receipt.package_path === packagePath
      }
    } catch {
      // Keep raw errors out of durable reports: they can contain credentials.
    } finally {
      try {
        await persist('cleanup.json', { confirmed, receipt: state.cleanup })
      } finally {
        await context.close()
      }
    }
    if (!confirmed && !state.failed) throw Error('DIAGNOSTIC_CLEANUP_UNCONFIRMED')
  }
}
