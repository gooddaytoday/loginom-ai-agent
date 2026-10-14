import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
const {createCalculatorResourceReader} = await import(process.env.CALCULATOR_READER_SOURCE
  ? pathToFileURL(process.env.CALCULATOR_READER_SOURCE) : new URL('../src/acceptance/calculator-resource-reader.mjs', import.meta.url));
const require = createRequire(process.env.CALCULATOR_CLIENT_PACKAGE ?? new URL('../client/package.json', import.meta.url));
const {chromium} = require('playwright-core');

test('real Chromium/handle transport with explicitly synthetic native objects', async () => {
  assert.ok(process.env.CALCULATOR_CHROMIUM, 'explicit pinned fixture browser required');
  const server = createServer((_, response) => response.end('<!doctype html><title>Calculator reader fixture</title>'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({executablePath: process.env.CALCULATOR_CHROMIUM, headless: true, chromiumSandbox: true});
    for (const mode of ['success', 'undefined', 'null', 'false', 'zero', 'empty', 'error']) {
      const context = await browser.newContext(), page = await context.newPage();
      try {
        const origin = `http://127.0.0.1:${server.address().port}`;
        await page.goto(origin);
        await page.evaluate(mode => {
          globalThis.reads = 0;
          const session = {async get_CurrentUser() {
            globalThis.reads++;
            if (mode === 'error') throw new Error('native double', {cause: 0});
            if (mode !== 'success') throw {undefined: undefined, null: null, false: false, zero: 0, empty: ''}[mode];
            return {async get_Name() {return 'fixture';}};
          }};
          globalThis.bg = {app: {Version: '7.4.2', Application: {FInstance: {FMainForm: {FMapTree: {
            FServerConnection: {Session: session, Connected: true, UserName: 'fixture'},
            PackageNodes: {Count: 1}, HasRunningNodes: () => false,
          }}}}}};
          globalThis.__loginomStartupV1 = {document, id: 'fixture-owner', account: 'fixture'};
        }, mode);
        const owner = {id: 'fixture-owner', account: 'fixture', origin, page, context, deadline: null};
        owner.readinessBinding = Object.freeze({...owner});
        const reader = await createCalculatorResourceReader(owner);
        const result = await reader.read().then(value => ({ok: true, value}), error => ({ok: false, error}));
        if (mode === 'success') assert.equal(result.value.package_count, 1);
        else {
          assert.equal(result.ok, false);
          if (mode === 'error') {assert.equal(result.error.message, 'native double'); assert.equal(result.error.cause, 0);}
          else assert.equal(result.error, {undefined: undefined, null: null, false: false, zero: 0, empty: ''}[mode]);
          const repeated = await reader.read().catch(error => ({error}));
          assert.equal(repeated.error, result.error);
        }
        assert.equal(await page.evaluate(() => globalThis.reads), 1);
        await reader.dispose();
      } finally {await context.close();}
    }
  } finally {
    await browser?.close();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
