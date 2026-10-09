import {readFileSync, writeFileSync, openSync, fsyncSync, closeSync, renameSync} from 'node:fs';
import {dirname} from 'node:path';
import {Diagnostics, navigate} from './account-ui.mjs';
import {requireFiniteCleanup} from './qualify-accounts.mjs';

// This second gate also covers direct invocation outside the Python entry.
// Block before reading credentials, importing Playwright or launching Chromium.
try { requireFiniteCleanup(); }
catch (error) {
  console.error(JSON.stringify({schema: 'accounts-preparation-v1', status: 'BLOCKED', code: error.code}));
  process.exit(1);
}

const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const configFile = option('--config');
const operatorFile = option('--operator');
if (!configFile || !operatorFile) throw Error('CONFIG_REQUIRED');
const config = JSON.parse(readFileSync(configFile, 'utf8'));
const operator = JSON.parse(readFileSync(operatorFile, 'utf8'));
const diagnostics = new Diagnostics(option('--evidence-dir'), 300000);
const playwright = (await import(operator.playwright_module)).default;
const accounts = {url: config.loginom.url, admin_user: operator.admin_user, admin_password: operator.admin_password};
const account = {username: config.loginom.username, password: config.loginom.password, marker: config.marker};
const saveState = (state) => {
  config.account_state = state;
  const temporary = configFile + '.tmp-' + process.pid;
  const descriptor = openSync(temporary, 'wx', 0o600);
  writeFileSync(descriptor, JSON.stringify(config, null, 2) + '\n');
  fsyncSync(descriptor); closeSync(descriptor); renameSync(temporary, configFile);
  const directory = openSync(dirname(configFile), 'r'); fsyncSync(directory); closeSync(directory);
};

const tid = (value) => `[data-tid=${JSON.stringify(value)}]`;
const suffix = (value) => `[data-tid$=${JSON.stringify(value)}]:visible`;
const form = 'UserListForm;UserForm;';
// Loginom 7.4.2 requires Viewer for Designer and does not allow disabling it.
const policy = {chkDesigner: true, chkViewer: true, chkRunner: false, chkAdmin: false, chkAllowPublish: false,
  chkAllowPasswordSave: false, chkGlobalFileStorage: false, chkSchedulerFullAccess: false, chkMustChangePassword: false};

const launchOptions = {headless: true, chromiumSandbox: true, executablePath: operator.browser};
if (operator.proxy?.server) launchOptions.proxy = {server: operator.proxy.server};
if (process.env.PLAYWRIGHT_CHROMIUM) launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM;
const browser = await playwright.chromium.launch(launchOptions);

async function ready(page) {
  await page.waitForFunction(() => ![...document.querySelectorAll('.bg-mask-message')]
    .some((e) => e.getBoundingClientRect().width && e.getBoundingClientRect().height), null, {timeout: 30000});
}

// Return true after the main panel appears, or false on rejected login.
async function login(page, username, password) {
  const url = new URL(accounts.url);
  url.searchParams.set('testable', 'true');
  await page.goto(url.href, {waitUntil: 'domcontentloaded'});
  const user = page.locator(tid('LoginForm;Login;edtUsername')).locator('input');
  await user.waitFor({timeout: 70000});
  await user.click(); await user.fill(username);
  // The password field accepts input only after a real click.
  const secret = page.locator(tid('LoginForm;Login;edtPassword')).locator('input');
  await secret.click(); await secret.fill(password);
  await page.locator(tid('LoginForm;Login;btnLogin')).click();
  await page.waitForFunction(() => document.querySelector('[data-tid="MF;cntMain;tlbMainToolbar;btnAvatar"]') ||
    [...document.querySelectorAll('.x-form-error-wrap')].some((e) => e.textContent.trim()), null, {timeout: 90000});
  const ok = await page.locator(tid('MF;cntMain;tlbMainToolbar;btnAvatar')).isVisible();
  if (ok) await ready(page);
  return ok;
}

async function openUsers(page) {
  await navigate(page, 'Пользователи', diagnostics);
  await page.locator(suffix('UserListForm;btnAdd')).waitFor();
  await ready(page);
}

async function setCheckbox(page, name, desired) {
  const read = () => page.locator(suffix(form + name)).evaluate((e) => e.classList.contains('x-form-cb-checked'));
  if (await read() !== desired) await page.locator(suffix(form + name + ';DisplayEl')).click();
  if (await read() !== desired) throw new Error(`POLICY_NOT_APPLIED:${name}`);
}

async function createAccount(page) {
  await openUsers(page);
  const fill = async (name, value) => {
    const input = page.locator(suffix(form + name)).locator('input');
    await input.click(); await input.fill(value);
  };
  await page.locator(suffix('UserListForm;btnAdd')).click();
  await fill('edtLogin', account.username);
  await fill('edtFullName', account.marker);
  if (await page.locator(suffix(form + 'cbxAuthMode')).locator('input').inputValue() !== 'Локальная') throw new Error('UNEXPECTED_AUTH_MODE');
  await fill('edtPassword', account.password);
  for (const [key, value] of Object.entries(policy)) await setCheckbox(page, key, value);
  await setCheckbox(page, 'chkBlocked', false);
  await page.locator(suffix(form + 'btnApply')).click();
  await page.locator(suffix(form + 'edtLogin')).waitFor({state: 'hidden', timeout: 20000});
  await ready(page);
}

let state = 'exists';
try {
  const probe = await browser.newPage({viewport: {width: 1400, height: 900}});
  probe.setDefaultTimeout(20000);
  // Probe persisted credentials before any account mutation.
  const alreadyWorks = await login(probe, account.username, account.password);
  await probe.close();

  if (!alreadyWorks) {
    if (config.account_state === 'creating' || config.account_state === 'ready') throw new Error('ACCOUNT_CREATION_UNCERTAIN');
    const admin = await browser.newPage({viewport: {width: 1400, height: 900}});
    admin.setDefaultTimeout(20000);
    if (!(await login(admin, accounts.admin_user, accounts.admin_password))) throw new Error('ADMIN_LOGIN_FAILED');
    const existing = admin.locator(suffix('UserListForm;cntTile;ListView;headercontainer;title_' + account.username));
    await openUsers(admin);
    if (await existing.count()) throw new Error('ACCOUNT_EXISTS_WITH_OTHER_PASSWORD');
    saveState('creating');
    await createAccount(admin);
    state = 'created';
    await admin.close();

    const verify = await browser.newPage({viewport: {width: 1400, height: 900}});
    verify.setDefaultTimeout(20000);
    if (!(await login(verify, account.username, account.password))) throw new Error('ACCOUNT_LOGIN_AFTER_CREATE_FAILED');
    await verify.close();
  }
  saveState('ready');
  console.log(JSON.stringify({role: config.role, username: account.username, state, login: 'ok'}));
} catch (error) {
  // Save raw causes before producing the public allowlisted receipt.
  await diagnostics.run('provision', 'failure', null, async () => { throw error; }).catch(() => {});
  console.error(JSON.stringify(diagnostics.publicReceipt(error)));
  process.exitCode = 1;
} finally {
  await browser.close();
}
