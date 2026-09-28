#!/usr/bin/env node
// Создаёт в Loginom отдельную учётную запись слота (lab-slot-<буква>) через веб-интерфейс администратора
// и проверяет, что под ней можно войти. Идемпотентно: существующую запись не трогает.
// Файл учётных данных (по умолчанию ~/node-pipeline-accounts.json, права 0600):
//   {"url", "admin_user", "admin_password", "api_key", "slots": {"a": {"username","password","marker"}}}
// Пароли и ключи в вывод не попадают.
import {randomBytes} from 'node:crypto';
import {chmodSync, readFileSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';

const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const slot = option('--slot');
if (!/^[a-z]$/.test(slot ?? '')) {
  console.error('Usage: provision-slot.mjs --slot <a-z> [--accounts <file>] [--verify-only]');
  process.exit(1);
}
const accountsFile = option('--accounts') ?? process.env.LOGINOM_ACCOUNTS_FILE ?? join(homedir(), 'node-pipeline-accounts.json');
const verifyOnly = args.includes('--verify-only');

// Playwright ищем по явному пути (PLAYWRIGHT_MODULE), иначе обычным импортом.
const playwright = process.env.PLAYWRIGHT_MODULE
  ? (await import(process.env.PLAYWRIGHT_MODULE)).default
  : (await import('playwright')).default;

const accounts = JSON.parse(readFileSync(accountsFile, 'utf8'));
const save = () => { writeFileSync(accountsFile, JSON.stringify(accounts, null, 2) + '\n'); chmodSync(accountsFile, 0o600); };
if (!accounts.slots[slot]) {
  if (verifyOnly) { console.error(`слот ${slot} не описан в файле учётных данных`); process.exit(1); }
  // Пароль сохраняем до создания записи, чтобы не потерять его при сбое.
  accounts.slots[slot] = {username: `lab-slot-${slot}`, password: randomBytes(18).toString('base64url'), marker: `node-pipeline slot ${slot}`};
  save();
}
const account = accounts.slots[slot];

const tid = (value) => `[data-tid=${JSON.stringify(value)}]`;
const suffix = (value) => `[data-tid$=${JSON.stringify(value)}]:visible`;
const form = 'UserListForm;UserForm;';
// В Loginom 7.4.2 Viewer обязателен для Designer и недоступен для отключения.
const policy = {chkDesigner: true, chkViewer: true, chkRunner: false, chkAdmin: false, chkAllowPublish: false,
  chkAllowPasswordSave: false, chkGlobalFileStorage: false, chkSchedulerFullAccess: false, chkMustChangePassword: false};

const launchOptions = {headless: true};
if (process.env.PLAYWRIGHT_CHROMIUM) launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM;
const browser = await playwright.chromium.launch(launchOptions);

async function ready(page) {
  await page.waitForFunction(() => ![...document.querySelectorAll('.bg-mask-message')]
    .some((e) => e.getBoundingClientRect().width && e.getBoundingClientRect().height), null, {timeout: 30000});
}

// Вход; возвращает true, если появилась главная панель, и false при отказе.
async function login(page, username, password) {
  const url = new URL(accounts.url);
  url.searchParams.set('testable', 'true');
  await page.goto(url.href, {waitUntil: 'domcontentloaded'});
  const user = page.locator(tid('LoginForm;Login;edtUsername')).locator('input');
  await user.waitFor({timeout: 70000});
  await user.click(); await user.fill(username);
  // Поле пароля доступно для ввода только после настоящего клика.
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
  const target = 'MapTreeForm;colNavigation_Сервер>Администрирование>Пользователи;TreeText';
  if (!(await page.locator(suffix(target)).count())) await page.locator(tid('MF;cntMain;tlbMainToolbar;btnNavigator')).click();
  await page.locator(suffix(target)).first().waitFor({state: 'visible', timeout: 15000});
  const main = page.locator(tid('MF;' + target) + ':visible');
  await ((await main.count()) === 1 ? main : page.locator(suffix(target))).click();
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
  // Если под слотом уже можно войти, запись существует и создавать её не нужно.
  const alreadyWorks = await login(probe, account.username, account.password);
  await probe.close();

  if (!alreadyWorks) {
    if (verifyOnly) throw new Error('SLOT_LOGIN_FAILED');
    const admin = await browser.newPage({viewport: {width: 1400, height: 900}});
    admin.setDefaultTimeout(20000);
    if (!(await login(admin, accounts.admin_user, accounts.admin_password))) throw new Error('ADMIN_LOGIN_FAILED');
    const existing = admin.locator(suffix('UserListForm;cntTile;ListView;headercontainer;title_' + account.username));
    await openUsers(admin);
    if (await existing.count()) throw new Error('ACCOUNT_EXISTS_WITH_OTHER_PASSWORD');
    await createAccount(admin);
    state = 'created';
    await admin.close();

    const verify = await browser.newPage({viewport: {width: 1400, height: 900}});
    verify.setDefaultTimeout(20000);
    if (!(await login(verify, account.username, account.password))) throw new Error('SLOT_LOGIN_AFTER_CREATE_FAILED');
    await verify.close();
  }
  console.log(JSON.stringify({slot, username: account.username, state, login: 'ok'}));
} catch (error) {
  // Сообщения Playwright могут содержать вводимые значения, поэтому печатаем только код.
  console.error(JSON.stringify({slot, error: /^[A-Z_:a-z]+$/.test(error.message) ? error.message : 'UI_ERROR'}));
  process.exitCode = 1;
} finally {
  await browser.close();
}
