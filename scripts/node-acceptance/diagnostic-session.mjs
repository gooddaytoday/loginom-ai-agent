import { mkdir, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'

// The caller retains ownership of the original context on every refusal.
// A profile or a replacement login cannot recover its in-memory native bindings.
export async function withDiagnosticSession({ context, execute, directory, identity, makeCleanupCode }, run) {
  const { sessionId, account, packagePath, loginomUrl, loginomBuild } = identity
  const persist = async (name, value) => {
    const file = join(directory, name)
    await writeFile(file + '.tmp', JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
    await rename(file + '.tmp', file)
  }
  let prepared, bound = false, failure, value, receipt = null, confirmed = false
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    makeCleanupCode({ ...identity, documentId: 'preflight', tabTid: 'preflight' })
    await persist('session.json', { sessionId, account, packagePath, loginomBuild, prepared: null })
    value = await run({ bindPrepared: async candidate => {
      bound = false
      prepared = candidate
      if (prepared?.status !== 'READY' || prepared.package_ref?.path !== packagePath
          || typeof prepared.document_id !== 'string' || !prepared.document_id
          || typeof prepared.workflow_ref?.tab_tid !== 'string' || !prepared.workflow_ref.tab_tid)
        throw Error('DIAGNOSTIC_PACKAGE_IDENTITY_UNCONFIRMED')
      await persist('session.json', { sessionId, account, packagePath, loginomBuild, prepared })
      bound = true
      return prepared
    } })
  } catch (error) { failure = error }
  if (bound) {
    try {
      receipt = await execute(makeCleanupCode({ ...identity, sessionId, account, packagePath, loginomUrl, loginomBuild,
        documentId: prepared.document_id, tabTid: prepared.workflow_ref.tab_tid }))
      confirmed = receipt?.status === 'SUCCEEDED' && receipt.package_closed === true && receipt.logged_out === true
        && receipt.session_id === sessionId && receipt.document_id === prepared.document_id
        && receipt.account === account && receipt.package_path === packagePath
    } catch (error) { failure ??= Error('DIAGNOSTIC_CLEANUP_UNCONFIRMED', { cause: error }) }
  }
  try {
    // Evidence must be durable before browser exit; raw errors may contain credentials.
    await persist('cleanup.json', { confirmed, receipt, browser_retained: !confirmed || !!failure })
  } catch (error) { failure ??= error }
  if (!confirmed) failure ??= Error('DIAGNOSTIC_CLEANUP_UNCONFIRMED')
  if (failure) throw failure
  await context.close()
  return value
}
