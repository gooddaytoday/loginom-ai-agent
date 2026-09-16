import { readFile, lstat, readdir, cp, writeFile, rename, readlink, rm } from 'node:fs/promises';
import { join, resolve, dirname, relative } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { isWindows, launcherPath, privateDirectory, readRuntimePointer, replaceRuntimePointer } from './platform.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const safePath = value => typeof value === 'string' && !value.startsWith('/') && value.split('/').every(part => part && part !== '.' && part !== '..') && !/[\\:\x00-\x1f]/.test(value);
const runtimeTarget = (value, platform) => {
  const normalized = isWindows(platform) && typeof value === 'string' ? value.replaceAll('\\', '/') : value;
  return safePath(normalized) && /^releases\/[0-9A-Za-z.+-]+$/.test(normalized) ? normalized : null;
};
const runtimePath = (root, target) => join(root, ...target.split('/'));
export async function verifyBundle(bundle, { checkNode = true, platform = process.platform, arch = process.arch } = {}) {
  const raw = await readFile(join(bundle, 'release.json'));
  const manifest = JSON.parse(raw);
  if (manifest.platform !== `${platform}-${arch}` || (checkNode && manifest.node !== process.versions.node)) throw new Error('Unsupported Dock runtime platform or Node version');
  if (!/^[0-9A-Za-z.+-]+$/.test(manifest.version) || !Array.isArray(manifest.files)) throw new Error('Invalid Dock release');
  const listed = new Set(['release.json']);
  for (const file of manifest.files) {
    if (!safePath(file.path) || listed.has(file.path)) throw new Error('Unsafe Dock release path');
    listed.add(file.path);
    const path = join(bundle, file.path);
    const info = await lstat(path);
    if (info.isSymbolicLink()) {
      const target = await readlink(path);
      const resolved = relative(bundle, resolve(dirname(path), target));
      if (!safePath(resolved) || hash(target) !== file.sha256) throw new Error('Unsafe Dock release symlink');
    } else if (!info.isFile() || hash(await readFile(path)) !== file.sha256) throw new Error('Dock release checksum mismatch');
  }
  async function walk(directory, prefix = '') {
    for (const file of await readdir(directory, { withFileTypes: true })) {
      const name = prefix + file.name;
      if (file.isDirectory()) await walk(join(directory, file.name), name + '/');
      else if (!listed.has(name)) throw new Error('Unexpected Dock release file');
    }
  }
  await walk(bundle);
  return { ...manifest, id: manifest.version + '-' + hash(raw).slice(0, 12) };
}

export async function installBundle(bundle, root, { platform = process.platform, arch = process.arch } = {}) {
  const manifest = await verifyBundle(bundle, { platform, arch });
  await privateDirectory(root, platform);
  await privateDirectory(join(root, 'releases'), platform);
  const destination = join(root, 'releases', manifest.id);
  let existing = false;
  try { await lstat(destination); existing = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing) {
    if ((await verifyBundle(destination, { platform, arch })).id !== manifest.id) throw new Error('Installed release has changed');
  } else {
    const pending = destination + '-' + randomUUID();
    try {
      await cp(bundle, pending, { recursive: true, verbatimSymlinks: true });
      await verifyBundle(pending, { platform, arch });
      await rename(pending, destination);
    } finally { await rm(pending, { recursive: true, force: true }); }
  }
  const target = relative(root, destination);
  const previous = await readRuntimePointer(root, 'current', platform);
  if (previous && previous !== target) await replaceRuntimePointer(root, 'previous', previous, platform);
  await replaceRuntimePointer(root, 'current', target, platform);
  await privateDirectory(join(root, 'bin'), platform);
  const launcher = isWindows(platform)
    ? '@echo off\r\nsetlocal\r\nset "dock_root=%~dp0.."\r\nset "dock_release="\r\nset /p "dock_release="<"%dock_root%\\current"\r\nif not defined dock_release exit /b 1\r\nset "dock_release=%dock_release:/=\\%"\r\nset "LOGINOM_DOCK_HOME=%dock_root%"\r\n"%dock_root%\\%dock_release%\\runtime\\node.exe" "%dock_root%\\%dock_release%\\client\\bin\\dispatch.mjs" %*\r\n'
    : '#!/bin/sh\nset -eu\ndock_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)\nexport LOGINOM_DOCK_HOME="$dock_root"\ndock_release=$(CDPATH= cd -- "$dock_root/current" && pwd -P)\nexec "$dock_release/runtime/node" "$dock_release/client/bin/dispatch.mjs" "$@"\n';
  const temporary = join(root, 'bin', '.loginom-dock-' + randomUUID());
  await writeFile(temporary, launcher, { mode: 0o700 });
  await rename(temporary, launcherPath(root, platform));
  return { manifest, destination, previous };
}

export async function rollbackBundle(root, { platform = process.platform, arch = process.arch } = {}) {
  const previous = await readRuntimePointer(root, 'previous', platform);
  const target = runtimeTarget(previous, platform);
  if (!target) throw new Error('Invalid Dock rollback target');
  await verifyBundle(runtimePath(root, target), { platform, arch });
  const current = await readRuntimePointer(root, 'current', platform);
  await replaceRuntimePointer(root, 'current', previous, platform);
  await replaceRuntimePointer(root, 'previous', current, platform);
  return previous;
}

export async function restoreRuntime(root, target, { platform = process.platform, arch = process.arch } = {}) {
  if (target === null) { await rm(join(root, 'current'), { force: true }); return; }
  const normalized = runtimeTarget(target, platform);
  if (!normalized) throw new Error('Invalid Dock recovery target');
  await verifyBundle(runtimePath(root, normalized), { checkNode: false, platform, arch });
  await replaceRuntimePointer(root, 'current', target, platform);
}
