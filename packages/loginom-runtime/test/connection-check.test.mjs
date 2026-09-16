import test from 'node:test';
import assert from 'node:assert/strict';
import { loginomAddress, loginPage } from '../src/connection-check.mjs';

test('Loginom URL preserves parameters and replaces testable without credentials', () => {
  assert.equal(loginomAddress('http://example.test/app/?a=b&testable=false'), 'http://example.test/app/?a=b&testable=true');
  assert.throws(() => loginomAddress('file:///tmp/app'));
  assert.throws(() => loginomAddress('http://user:secret@example.test/app/'));
});

test('private login uses only login controls and verifies the authenticated account', async () => {
  const fills = [], clicks = [];
  let visible = false;
  const account = 'User';
  const locator = selector => ({
    locator(child) { assert.equal(child, 'input'); return this; },
    async fill(value) { fills.push([selector, value]); },
    async click() { clicks.push(selector); visible = true; },
    async isVisible() { return visible; },
    or(other) { return this; }, first() { return this; }, async waitFor() {},
  });
  const page = {
    async goto(url) { assert.equal(url, 'http://example.test/app/?testable=true'); },
    locator(selector) {
      assert.ok(selector.includes('LoginForm;Login;') || selector.includes('btnAvatar'));
      return locator(selector);
    },
    async evaluate() { return account; },
  };
  assert.deepEqual(await loginPage(page, { url: 'http://example.test/app/', username: account, password: '' }), { authenticated: true });
  assert.deepEqual(fills.map(row => row[1]), [account, '']);
  assert.equal(clicks.length, 1);
  await assert.rejects(loginPage(page, { url: 'http://example.test/app/', username: 'Other', password: 'secret' }), /LOGINOM_ACCOUNT_MISMATCH/);
  assert.equal(fills.length, 2, 'an already authenticated foreign session is never silently reused');
});
