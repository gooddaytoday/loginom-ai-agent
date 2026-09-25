import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const execute = promisify(execFile);

// Never change a developer's native proxy configuration. Linux runs in its own
// D-Bus/dconf session; Windows/macOS require a disposable GitHub-hosted runner.
export async function systemProxyFixture(directory) {
  if (process.platform === 'linux') {
    assert.equal(process.env.LOGINOM_DOCK_TEST_ISOLATED_DESKTOP, '1');
    assert.ok(process.env.XDG_CONFIG_HOME?.startsWith(process.env.LOGINOM_DOCK_TEST_DESKTOP_ROOT + '/'));
    const keys = [
      ['org.gnome.system.proxy', 'mode'], ['org.gnome.system.proxy', 'autoconfig-url'],
      ['org.gnome.system.proxy', 'ignore-hosts'], ['org.gnome.system.proxy', 'use-same-proxy'],
      ...['http', 'https', 'socks'].flatMap(scheme => ['host', 'port'].map(key => [`org.gnome.system.proxy.${scheme}`, key])),
    ];
    const saved = await Promise.all(keys.map(async ([schema, key]) => [schema, key, (await execute('gsettings', ['get', schema, key], {timeout:10000})).stdout.trim()]));
    const set = (schema, key, value) => execute('gsettings', ['set', schema, key, value], {timeout:10000});
    return {
      async apply(mode, proxy, pac) {
        await set('org.gnome.system.proxy', 'mode', 'none');
        await set('org.gnome.system.proxy', 'ignore-hosts', '[]');
        await set('org.gnome.system.proxy', 'use-same-proxy', 'false');
        for (const scheme of ['http', 'https', 'socks']) {
          await set(`org.gnome.system.proxy.${scheme}`, 'host', scheme === 'socks' ? "''" : new URL(proxy).hostname);
          await set(`org.gnome.system.proxy.${scheme}`, 'port', scheme === 'socks' ? '0' : new URL(proxy).port);
        }
        await set('org.gnome.system.proxy', 'autoconfig-url', pac);
        await set('org.gnome.system.proxy', 'mode', mode === 'pac' ? 'auto' : mode === 'manual' ? 'manual' : 'none');
      },
      async restore() {
        for (const [schema, key, value] of saved) await set(schema, key, value);
        for (const [schema, key, value] of saved) assert.equal((await execute('gsettings', ['get', schema, key], {timeout:10000})).stdout.trim(), value);
      },
    };
  }
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Native settings may only change on disposable CI');
  assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted', 'Self-hosted runners are not isolated');
  if (process.platform === 'win32') {
    const script = fileURLToPath(new URL('./system-proxy-windows.ps1', import.meta.url));
    const snapshot = join(directory, 'proxy.xml');
    const run = (...args) => execute(join(process.env.SystemRoot ?? process.env.SYSTEMROOT, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Snapshot', snapshot, ...args], {timeout:30000});
    await run('-Action', 'save');
    return {
      apply: (mode, proxy, pac) => run('-Action', 'apply', '-Mode', mode, '-Server', new URL(proxy).host, '-Pac', pac),
      restore: () => run('-Action', 'restore'),
    };
  }
  assert.equal(process.platform, 'darwin');
  const key = 'State:/Network/Global/Proxies';
  const backup = `State:/Network/LoginomProxyTest/${process.pid}`;
  const scutil = async input => {
    const task = execute('/usr/bin/sudo', ['-n', '/usr/sbin/scutil'], {timeout:10000});
    task.child.stdin.end(input + '\nquit\n');
    const result = await task;
    assert.doesNotMatch(result.stdout + result.stderr, /No such key|Permission denied|Invalid command/i);
    return result.stdout.trim();
  };
  // Chromium reads SCDynamicStoreCopyProxies. Preserve the typed dictionary
  // exactly, including per-interface settings, without changing saved services.
  const original = await scutil(`show ${key}`);
  assert.match(original, /<dictionary>/);
  await scutil(`get ${key}\nset ${backup}`);
  return {
    async apply(mode, proxy, pac) {
      const url = new URL(proxy);
      await scutil(`d.init
d.add HTTPEnable # ${mode === 'manual' ? 1 : 0}
d.add HTTPProxy ${url.hostname}
d.add HTTPPort # ${url.port}
d.add HTTPSEnable # ${mode === 'manual' ? 1 : 0}
d.add HTTPSProxy ${url.hostname}
d.add HTTPSPort # ${url.port}
d.add SOCKSEnable # 0
d.add ProxyAutoDiscoveryEnable # 0
d.add ProxyAutoConfigEnable # ${mode === 'pac' ? 1 : 0}
d.add ProxyAutoConfigURLString ${pac}
set ${key}`);
    },
    async restore() {
      await scutil(`get ${backup}\nset ${key}\nremove ${backup}`);
      assert.equal(await scutil(`show ${key}`), original);
    },
  };
}
