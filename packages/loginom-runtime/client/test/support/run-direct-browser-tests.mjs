import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, mkdir, writeFile, rm, readFile, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';

const pinned = JSON.parse(await readFile(new URL('../../../../product/loginom-release.json', import.meta.url), 'utf8'));
assert.equal(process.versions.node, pinned.nodeVersion, 'Use the pinned test Node');
const browser = process.env.LOGINOM_DOCK_TEST_BROWSER || chromium.executablePath();
await access(browser);
const root = await mkdtemp(join(tmpdir(), 'loginom-proxy-desktop-'));
try {
  const environment = {...process.env, LOGINOM_DOCK_TEST_BROWSER:browser, LOGINOM_DOCK_TEST_SYSTEM_PROXY:'1', LOGINOM_DOCK_TEST_HEADED:'1'};
  if (process.platform === 'linux') {
    for (const name of ['config', 'runtime', 'data', 'cache']) await mkdir(join(root, name), {mode:0o700});
    // dconf uses this name in a D-Bus object path: hyphens are invalid.
    await writeFile(join(root, 'dconf-profile'), 'user-db:proxy_test\n');
    Object.assign(environment, {
      XDG_CONFIG_HOME:join(root, 'config'), DCONF_PROFILE:join(root, 'dconf-profile'), GSETTINGS_BACKEND:'dconf',
      XDG_RUNTIME_DIR:join(root, 'runtime'), XDG_DATA_HOME:join(root, 'data'), XDG_CACHE_HOME:join(root, 'cache'),
      XDG_CURRENT_DESKTOP:'GNOME', DESKTOP_SESSION:'gnome', XDG_SESSION_TYPE:'x11',
      LOGINOM_DOCK_TEST_ISOLATED_DESKTOP:'1', LOGINOM_DOCK_TEST_DESKTOP_ROOT:root,
    });
    delete environment.DBUS_SESSION_BUS_ADDRESS;
    delete environment.WAYLAND_DISPLAY;
  }
  const args = ['--test', '--test-concurrency=1', 'test/browser-proxy.integration.test.mjs', 'test/browser-downloads.integration.test.mjs'];
  const child = process.platform === 'linux'
    ? spawn('dbus-run-session', ['--', 'xvfb-run', '-a', process.execPath, ...args], {env:environment, cwd:fileURLToPath(new URL('../../', import.meta.url)), stdio:'inherit'})
    : spawn(process.execPath, args, {env:environment, cwd:fileURLToPath(new URL('../../', import.meta.url)), stdio:'inherit'});
  process.exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => signal ? reject(Error(`Browser tests terminated: ${signal}`)) : resolve(code ?? 1));
  });
} finally {
  await rm(root, {recursive:true, force:true, maxRetries:5});
}
