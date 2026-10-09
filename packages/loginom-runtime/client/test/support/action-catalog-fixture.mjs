import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ACTION_CATALOG_ROOT } from '../../lib/action-catalog.mjs';

// External MCP delivery fixture: exercise the real pinning/validation code.
export async function createActionCatalogFixture(compatibility) {
  const root = new URL('../../../executor/catalog/', import.meta.url);
  const files = new Map(await Promise.all(['actions.json', 'selectors.json', 'source-index.json'].map(async name =>
    [name, await readFile(new URL(name, root), 'utf8')])));
  const actions = JSON.parse(files.get('actions.json'));
  const manifest = {
    schema_version: 1, catalog_version: actions.catalog_version, status: 'candidate', capability_abi: 1,
    min_executor_revision: '1.0.0', e2e_commit: actions.e2e_commit,
    compatibility: compatibility ?? JSON.parse(await readFile(new URL('compatibility.json', root), 'utf8')),
    created_at: '2026-09-04T00:00:00Z',
    files: Object.fromEntries([...files].map(([name, text]) => [name, createHash('sha256').update(text).digest('hex')])),
  };
  const text = JSON.stringify(manifest);
  const release = ACTION_CATALOG_ROOT + '/releases/' + actions.catalog_version;
  return { compatibility: manifest.compatibility, manifestUri: release + '/manifest.json',
    manifestSha256: createHash('sha256').update(text).digest('hex'),
    files: new Map([[release + '/manifest.json', text], ...[...files].map(([name, value]) => [release + '/' + name, value])]),
  };
}
