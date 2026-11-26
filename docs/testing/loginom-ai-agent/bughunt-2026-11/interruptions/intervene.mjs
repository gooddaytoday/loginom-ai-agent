import { appendFile, glob, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const [root, profile, log, kind, startedAt] = process.argv.slice(2);
const require = createRequire(join(root, 'runtime/client/package.json'));
const { chromium } = require('playwright-core');
const record = async (phase, evidence = {}) => appendFile(log,
  JSON.stringify({ phase, kind, at: Date.now() / 1000, ...evidence }) + '\n');
const wizardSelector = '[data-tid$=";WizrdMCF;btnClose"]:visible';
const panelSelector = '[data-tid$=";FilterDataWizard;FilterDataPanel"]:visible';

async function activeConfigure(journal) {
  const lines = await readFile(journal, 'utf8').catch(() => '');
  const filters = new Set();
  const active = new Map();
  for (const [index, line] of lines.split('\n').entries()) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    const id = event.operation_id;
    if (Date.parse(event.recorded_at) / 1000 < Number(startedAt)) continue;
    if (event.phase === 'node_apply_prepared' && event.request?.target?.type === 'transform.filter_data') filters.add(id);
    if (!filters.has(id)) continue;
    if (event.phase === 'node_phase_prepared' && event.receipt?.phase === 'configure') active.set(id, index + 1);
    if (['node_phase_completed', 'node_phase_paused', 'node_phase_refused'].includes(event.phase) &&
        event.receipt?.phase === 'configure') active.delete(id);
  }
  if (active.size !== 1) return;
  const [entry] = active;
  return { location: journal + ':' + entry[1], operation_id: entry[0], step: 'configure' };
}

async function gesture(page, browser) {
  const wizard = page.locator(wizardSelector);
  if (kind === 'close-wizard') {
    await wizard.click({ timeout: 5000 });
    const message = page.locator('[data-tid^="msgbox"][data-tid$=";cnt;cnt;cmp"]:visible');
    await Promise.race([wizard.waitFor({ state: 'hidden', timeout: 5000 }),
      message.waitFor({ state: 'visible', timeout: 5000 })]);
    if (await message.isVisible()) {
      const text = (await message.innerText()).trim();
      if (text !== 'Вы действительно хотите закрыть мастер настройки?') throw Error('UNEXPECTED_CLOSE_DIALOG');
      const tid = (await message.getAttribute('data-tid')).split(';')[0] + ';tlb;yes';
      await page.locator('[data-tid=' + JSON.stringify(tid) + ']').click({ timeout: 5000 });
      await message.waitFor({ state: 'hidden', timeout: 5000 });
    }
    await wizard.waitFor({ state: 'hidden', timeout: 5000 });
    await page.locator('[data-tid$=";ModelForm;cmpDiagram"]:visible').first().waitFor({ timeout: 5000 });
    return { wizard_closed: true, canvas_visible: true };
  }
  if (kind === 'reload') {
    const navigated = page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame(), timeout: 15_000 });
    await Promise.all([navigated, page.evaluate(() => setTimeout(() => location.reload(), 0))]);
    return { main_frame_navigated: true };
  }
  if (kind === 'switch-tab') {
    const context = page.context();
    const loginom = new URL(page.url());
    const other = await context.newPage();
    await other.goto(loginom.href, { waitUntil: 'commit', timeout: 15_000 });
    if (new URL(other.url()).origin !== loginom.origin) throw Error('TAB_ORIGIN_CHANGED');
    const targetId = async tab => {
      const session = await context.newCDPSession(tab);
      const { targetInfo } = await session.send('Target.getTargetInfo');
      await session.detach();
      return targetInfo.targetId;
    };
    const from = await targetId(page);
    const to = await targetId(other);
    if (from === to) throw Error('NEW_TAB_UNCONFIRMED');
    const session = await browser.newBrowserCDPSession();
    await session.send('Target.activateTarget', { targetId: to });
    await session.detach();
    return { browser_activation_ack: true, from, to };
  }
  if (kind === 'foreign-dialog') {
    const message = 'Проверка вручную: информационное сообщение';
    await page.evaluate(text => {
      if (typeof globalThis.Ext?.Msg?.alert !== 'function') throw Error('LOGINOM_MESSAGE_BOX_UNAVAILABLE');
      globalThis.Ext.Msg.alert('Сообщение', text);
    }, message);
    const dialog = page.locator('.x-message-box:visible').filter({ hasText: message });
    await dialog.waitFor({ timeout: 5000 });
    return { native_message_visible: true, message };
  }
  if (kind === 'kill-cli') return { kill_ready: true };
  throw Error('UNKNOWN_INTERVENTION');
}

const attempts = new Map();
const until = Date.now() + 1_800_000;
try {
  while (Date.now() < until) {
    for await (const portFile of glob('loginom/runtime/generations/*/chats/*/attempts/*/browser-profile/DevToolsActivePort',
      { cwd: profile })) {
      const dir = join(profile, portFile, '../..');
      let browser = attempts.get(dir);
      if (!browser?.isConnected()) {
        const [port, socket] = (await readFile(join(profile, portFile), 'utf8').catch(() => '')).split('\n');
        if (!/^\d{1,5}$/.test(port) || !/^\/devtools\/browser\/[a-f0-9-]{36}$/.test(socket)) continue;
        browser = await chromium.connectOverCDP('ws://127.0.0.1:' + port + socket, { timeout: 750 }).catch(() => null);
        if (!browser) continue;
        attempts.set(dir, browser);
      }
      const journal = join(dir, 'execution-events.jsonl');
      const pending = await activeConfigure(journal);
      if (!pending) continue;
      for (const page of browser.contexts().flatMap(context => context.pages())) {
        const panel = await page.locator(panelSelector).count().catch(() => 0);
        const wizard = await page.locator(wizardSelector).count().catch(() => 0);
        if (panel !== 1 || wizard !== 1) continue;
        const fresh = await activeConfigure(journal);
        if (fresh?.operation_id !== pending.operation_id) continue;
        await record('before', { ...fresh, wizard_visible: true, filter_panel_visible: true });
        await record('after', await gesture(page, browser));
        // The original Playwright pipe remains owned by the Loginom runtime.
        process.exit(0);
      }
    }
    await delay(150);
  }
  throw Error('INTERVENTION_GATE_NOT_REACHED');
} catch (error) {
  await record('fixture_error', { code: error.message.split('\n')[0] });
  process.exit(3);
}
