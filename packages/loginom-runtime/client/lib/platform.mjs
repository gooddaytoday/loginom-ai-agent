import { constants } from 'node:fs';
import { access, lstat, mkdir, readFile, readlink, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, win32 } from 'node:path';
import { spawnSync } from 'node:child_process';

export const isWindows = (platform = process.platform) => platform === 'win32';
export const runtimeNodePath = (root, platform = process.platform) => join(root, 'runtime', isWindows(platform) ? 'node.exe' : 'node');
export const launcherPath = (root, platform = process.platform) => join(root, 'bin', isWindows(platform) ? 'loginom-dock.cmd' : 'loginom-dock');
export const chromiumAppContainerSid = 'S-1-15-3-1024-1528657515-1944437972-2795272136-1227674495-293963776-353393192-4060142787-1908764039';

export function privatePath(info, platform = process.platform) {
  return isWindows(platform) || !(info.mode & 0o077);
}

function windowsSid() {
  const root = process.env.SystemRoot ?? process.env.SYSTEMROOT;
  if (!root || !win32.isAbsolute(root)) throw new Error('Cannot identify the Windows user for Dock permissions');
  const result = spawnSync(win32.join(root, 'System32', 'whoami.exe'), ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error('Cannot identify the Windows user for Dock permissions');
  const match = result.stdout.match(/"(S-1-[0-9-]+)"/i);
  if (!match) throw new Error('Cannot identify the Windows user for Dock permissions');
  return match[1];
}

export function protectWindowsDirectory(path, platform = process.platform) {
  if (!isWindows(platform) || process.platform !== 'win32') return;
  const root = process.env.SystemRoot ?? process.env.SYSTEMROOT;
  if (!root || !win32.isAbsolute(root)) throw new Error('Cannot protect the Windows Dock directory');
  const sid = windowsSid();
  const result = spawnSync(win32.join(root, 'System32', 'icacls.exe'), [path, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F'], {
    encoding: 'utf8', windowsHide: true,
  });
  if (result.error || result.status !== 0) throw new Error('Cannot protect the Windows Dock directory');
}

// Chromium's Windows sandbox reads selected upload files from its restricted
// AppContainer. Grant only read/execute on the one-use transfer directory;
// the lease removes this directory after verification or browser shutdown.
export function grantWindowsChromiumUploadRead(path, platform = process.platform) {
  if (!isWindows(platform) || process.platform !== 'win32') return;
  const root = process.env.SystemRoot ?? process.env.SYSTEMROOT;
  if (!root || !win32.isAbsolute(root) || !win32.isAbsolute(path)) throw new Error('Cannot authorize the Windows upload staging directory');
  const icacls = win32.join(root, 'System32', 'icacls.exe');
  // The store root contains opaque admitted files. Chromium receives traverse
  // only there; readable inheritance begins at the random transfer directory.
  const parent = win32.dirname(path);
  const traverse = spawnSync(icacls, [parent, '/grant:r', `*${chromiumAppContainerSid}:(X)`], {
    encoding: 'utf8', windowsHide: true,
  });
  const result = traverse.error || traverse.status !== 0 ? traverse : spawnSync(icacls, [path, '/grant:r', `*${chromiumAppContainerSid}:(OI)(CI)RX`], {
    encoding: 'utf8', windowsHide: true,
  });
  if (result.error || result.status !== 0) throw new Error('Cannot authorize the Windows upload staging directory');
}

export async function privateDirectory(path, platform = process.platform) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  protectWindowsDirectory(path, platform);
  const info = await lstat(path);
  if (!info.isDirectory() || !privatePath(info, platform)) throw new Error('Dock directory is not private');
}

export async function readRuntimePointer(root, name = 'current', platform = process.platform) {
  const path = join(root, name);
  try {
    return isWindows(platform) ? (await readFile(path, 'utf8')).trim() : await readlink(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function replaceRuntimePointer(root, name, target, platform = process.platform) {
  const pending = join(root, `.${name}-${randomUUID()}`);
  if (isWindows(platform)) await writeFile(pending, target + '\r\n', { mode: 0o600 });
  else await symlink(target, pending);
  try { await rename(pending, join(root, name)); }
  finally { await rm(pending, { force: true }); }
}

export async function executableExists(path, platform = process.platform) {
  await access(path, isWindows(platform) ? constants.F_OK : constants.X_OK);
}
