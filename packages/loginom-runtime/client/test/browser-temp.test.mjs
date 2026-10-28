import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readlink, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright-core';
import {browserEnvironment} from '../../src/connection-check.mjs';

for (const platform of ['linux', 'darwin']) {
  test(`browser isolates long temporary paths on ${platform}`, () => {
    for (const temporary of ['/tmp/' + 'x'.repeat(120), '/tmp/' + 'я'.repeat(40)]) {
      const input = {TMPDIR: temporary, TMP: temporary, TEMP: temporary, HTTP_PROXY: 'http://proxy.invalid'};
      const result = browserEnvironment('/long/profile', input, platform);
      assert.equal(result.TMPDIR, '/tmp');
      assert.equal(result.TMP, '/tmp');
      assert.equal(result.TEMP, '/tmp');
      assert.equal(result.HTTP_PROXY, input.HTTP_PROXY);
      assert.equal(input.TMPDIR, temporary);
    }
    assert.equal(browserEnvironment('/profile', {TMPDIR: '/tmp/short'}, platform).TMPDIR, '/tmp/short');
    const boundary = '/' + 'x'.repeat((platform === 'darwin' ? 104 : 108) - 65);
    assert.equal(browserEnvironment('/profile', {TMPDIR: boundary}, platform).TMPDIR, boundary);
    assert.equal(browserEnvironment('/profile', {TMPDIR: boundary + 'x'}, platform).TMPDIR, '/tmp');
    assert.equal(browserEnvironment('/profile', {TMPDIR: 'relative/tmp'}, platform).TMPDIR, '/tmp');
    assert.equal(browserEnvironment('/profile', {}, platform).TMPDIR, '/tmp');
  });
}

test('Windows keeps native temporary paths', () => {
  const input = {TMPDIR: 'C:\\' + 'x'.repeat(120), TMP: 'C:\\Temp', TEMP: 'C:\\Temp'};
  const result = browserEnvironment('C:\\profile', input, 'win32');
  for (const key of ['TMPDIR', 'TMP', 'TEMP']) assert.equal(result[key], input[key]);
});

test('real Chromium starts with a long profile and inherited TMPDIR', {
  skip: process.platform !== 'linux' || !process.env.LOGINOM_DOCK_TEST_BROWSER,
  timeout: 60000,
}, async () => {
  const root = await mkdtemp('/tmp/loginom-temp-test-');
  const temporary = join(root, 'x'.repeat(120));
  const profile = join(temporary, 'browser-profile');
  await mkdir(profile, {recursive: true});
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.LOGINOM_DOCK_TEST_BROWSER,
      headless: true, chromiumSandbox: true,
      env: browserEnvironment(profile, {...process.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary}),
      args: ['--no-proxy-server'],
    });
    const socket = await readlink(join(profile, 'SingletonSocket'));
    assert.ok(socket.startsWith('/tmp/'));
    assert.ok(Buffer.byteLength(socket) < 108, socket);
    assert.equal(await context.pages()[0].evaluate(() => 2 + 2), 4);
  } finally {
    await context?.close();
    await rm(root, {recursive: true, force: true});
  }
});
