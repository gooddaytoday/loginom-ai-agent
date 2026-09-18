// Host-selected Loginom directories. These are server paths, never OS homes
// or paths inferred from the authenticated account's name.
import {guardLoginomConnection} from './connection-recovery.mjs';
const purposes = ['packages', 'inputs', 'exports'];

export function storagePath(value) {
  if (typeof value !== 'string' || value.length > 1024 || !value.startsWith('/')
      || /[\\%?#\x00-\x1f\x7f]/.test(value)
      || value.slice(1).split('/').some(part => !part || part === '.' || part === '..' || part !== part.trim())) {
    throw Error('An exact absolute Loginom storage path is required');
  }
  return value;
}

export function storageDirectories(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== purposes.length
      || purposes.some(key => !Object.hasOwn(value, key))) throw Error('Explicit Loginom storage directories are required');
  return Object.freeze(Object.fromEntries(purposes.map(key => [key, storagePath(value[key])])));
}

export function requireStorageDestination(path, directories, purpose, { directory = false } = {}) {
  path = storagePath(path);
  const root = storageDirectories(directories)[purpose];
  if (!root || !(directory && path === root) && !path.startsWith(root + '/')) {
    throw Error('Destination is outside the selected Loginom directory');
  }
  if (!directory && purpose === 'packages' && !/\.lgp$/i.test(path)) throw Error('A Loginom package filename is required');
  if (!directory && purpose === 'exports' && !/\.(csv|tsv)$/i.test(path)) throw Error('A CSV or TSV filename is required');
  return path;
}

export function storageTidSuffix(name) {
  if (typeof name !== 'string' || !name || /[\/\\\x00-\x1f\x7f]/.test(name)) throw Error('Invalid Loginom entry name');
  // The matching visible label and object kind must also be checked: the
  // native TID conversion is not injective (spaces/underscores and commas).
  return name.replace(/\s/g, '_').replaceAll(',', '');
}

export function createStorageBinding({ sessionId, origin, build, documentId, account, directories }) {
  if (!['http:', 'https:'].includes(new URL(origin).protocol)) throw Error('Observed Loginom origin is required');
  if (![sessionId, documentId, account].every(v => typeof v === 'string' && v.trim() && v.length <= 200)
      || build !== '7.4.2' || new URL(origin).origin !== origin) throw Error('Observed Loginom identity is required');
  return Object.freeze({ version: 1, session_id: sessionId, origin, loginom_build: build,
    document_id: documentId, loginom_account: account, directories: storageDirectories(directories) });
}

// Every browser operation retains the account/document observed by prepare.
// This is an identity guard; destination existence is checked by native UI.
export function withStorageIdentity(code, binding) {
  if (!binding) throw Error('Prepare Loginom before using the selected directories');
  return `async page=>{
    const expected=${JSON.stringify(binding)};
    await (${guardLoginomConnection.toString()})(page,expected);
    return (${code})(page);
  }`;
}

export function requireExportDestination(value, directories = null) {
  if (directories) return requireStorageDestination(value, directories, 'exports');
  // Unchanged scope for legacy acceptance profiles and catalog revisions.
  if (typeof value !== 'string' || !/^\/test-2\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9][A-Za-z0-9_.-]*\.(csv|tsv)$/.test(value)
      || value.length > 512 || value.includes('..')) throw Error('Export requires an explicitly assigned CSV/TSV in /test-2');
  return value;
}
