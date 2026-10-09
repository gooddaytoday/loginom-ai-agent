import {mkdirSync, lstatSync, openSync, writeFileSync, fsyncSync, closeSync, readFileSync} from 'node:fs';
import {join, isAbsolute, dirname} from 'node:path';
import {createHash, randomUUID} from 'node:crypto';

export const tid = value => `[data-tid=${JSON.stringify(value)}]`;
export const suffix = value => `[data-tid$=${JSON.stringify(value)}]:visible`;
const scopes = ['MF;', 'MF;TF;AdminStartForm;'];
const folder = 'MapTreeForm;colNavigation_Сервер>Администрирование;TreeText';
const treeTarget = target => `MapTreeForm;colNavigation_Сервер>Администрирование>${target};TreeText`;
const publicCodes = new Set(['NAVIGATION_AMBIGUOUS', 'NAVIGATION_UNQUALIFIED', 'NAVIGATION_NOT_READY',
  'NAVIGATION_DEADLINE', 'UI_TARGET_AMBIGUOUS', 'BLOCKED_FINITE_SERVER_CLEANUP', 'PAIR_BINDING_MISMATCH']);

export function errorDetails(error, seen = new Set()) {
  if (!error || seen.has(error)) return null;
  seen.add(error);
  const result = {name: error.name ?? null, code: error.code ?? null,
    message: error.message ?? String(error), stack: error.stack ?? null};
  for (const key of ['get_message', 'get_stack']) {
    if (typeof error[key] !== 'function') continue;
    try { result[key] = error[key](); }
    catch (failure) { result[key] = {capture_error: String(failure)}; }
  }
  if (error.browser_error) result.browser_error = error.browser_error;
  if (error.cause) result.cause = errorDetails(error.cause, seen);
  return result;
}

export class Diagnostics {
  constructor(directory, timeout = 30000) {
    if (!isAbsolute(directory)) throw Error('PRIVATE_DIAGNOSTICS_PATH_REQUIRED');
    for (let path = directory; path !== dirname(path); path = dirname(path)) {
      try { if (lstatSync(path).isSymbolicLink()) throw Error('PRIVATE_DIAGNOSTICS_LINKED'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    mkdirSync(directory, {recursive: true, mode: 0o700});
    const info = lstatSync(directory);
    if (info.uid !== process.getuid() || (info.mode & 0o077)) throw Error('PRIVATE_DIAGNOSTICS_PERMISSIONS');
    this.directory = directory;
    this.started = Date.now();
    this.deadline = this.started + timeout;
    this.events = [];
    this.candidates = [];
  }

  remaining() {
    if (Date.now() >= this.deadline) throw Object.assign(Error('NAVIGATION_DEADLINE'), {code: 'NAVIGATION_DEADLINE'});
    return this.deadline - Date.now();
  }

  async run(phase, action, selector, operation) {
    const event = {phase, action, selector, started_at: new Date().toISOString(),
      elapsed_ms: Date.now() - this.started, deadline_at: new Date(this.deadline).toISOString()};
    this.events.push(event);
    this.save();
    try {
      this.remaining();
      const result = await operation();
      event.status = 'PASS';
      event.candidates = structuredClone(this.candidates);
      event.visible_candidate_count = event.candidates.length;
      event.finished_elapsed_ms = Date.now() - this.started;
      this.save();
      return result;
    } catch (error) {
      event.status = 'FAIL';
      event.candidates = structuredClone(this.candidates);
      event.visible_candidate_count = event.candidates.length;
      event.error = errorDetails(error);
      event.finished_elapsed_ms = Date.now() - this.started;
      this.save();
      throw error;
    }
  }

  save() {
    // Each snapshot is immutable; raw Playwright errors never go to stdout.
    const path = join(this.directory, `diagnostic-${randomUUID()}.json`);
    const fd = openSync(path, 'wx', 0o600);
    try { writeFileSync(fd, JSON.stringify({schema: 'account-ui-private-v1', events: this.events}, null, 2) + '\n'); fsyncSync(fd); }
    finally { closeSync(fd); }
    const directory = openSync(this.directory, 'r');
    try { fsyncSync(directory); }
    finally { closeSync(directory); }
    this.sha256 = createHash('sha256').update(readFileSync(path)).digest('hex');
    this.path = path;
  }

  publicReceipt(error) {
    return {schema: 'account-ui-public-v1', status: error ? 'FAIL' : 'PASS',
      code: error ? (publicCodes.has(error.code) ? error.code : 'UI_ERROR') : null,
      diagnostics_sha256: this.sha256};
  }
}

export async function uniqueVisible(page, selector) {
  const locator = page.locator(selector);
  if (await locator.count() !== 1) throw Object.assign(Error('UI_TARGET_AMBIGUOUS'), {code: 'UI_TARGET_AMBIGUOUS'});
  return locator;
}

async function candidates(page, target, diagnostics) {
  const result = await page.evaluate(({folder, target, scopes}) => {
    try {
      const visible = element => !!(element.getBoundingClientRect().width && element.getBoundingClientRect().height)
        && getComputedStyle(element).visibility !== 'hidden';
      const masked = [...document.querySelectorAll('.bg-mask-message')].some(visible);
      return {candidates: [...document.querySelectorAll('[data-tid]')].filter(element => {
        const value = element.getAttribute('data-tid');
        return visible(element) && (value.endsWith(folder) || value.endsWith(target));
      }).map(element => {
        const value = element.getAttribute('data-tid');
        const scope = scopes.find(prefix => value === prefix + folder || value === prefix + target) ?? null;
        const tree = element.closest('.x-tree-view');
        const record = globalThis.Ext?.getCmp(tree?.id)?.getRecord?.(element.closest('table'));
        return {tid: value, scope, kind: value.endsWith(target) ? 'target' : 'folder',
          ready: !!scope && !!record && !masked, expanded: record?.isExpanded?.() ?? null};
      })};
    } catch (error) {
      // Capture native EBGException accessors inside the page, before
      // Playwright turns them into a plain Error without these methods.
      const details = {name: error.name ?? null, message: error.message ?? String(error), stack: error.stack ?? null};
      for (const key of ['get_message', 'get_stack']) {
        if (typeof error[key] !== 'function') continue;
        try { details[key] = error[key](); }
        catch (failure) { details[key] = {capture_error: String(failure)}; }
      }
      return {browser_error: details};
    }
  }, {folder, target: treeTarget(target), scopes});
  if (result.browser_error) throw Object.assign(Error('NAVIGATION_BROWSER_ERROR'), {browser_error: result.browser_error});
  diagnostics.candidates = result.candidates;
  return result.candidates;
}

function select(items, kind) {
  const values = items.filter(item => item.kind === kind);
  if (!values.length) return null;
  const ready = values.filter(item => item.ready);
  if (ready.length === 1 && values.every(item => item.scope)) return ready[0];
  const code = values.some(item => !item.scope) ? 'NAVIGATION_UNQUALIFIED'
    : ready.length > 1 ? 'NAVIGATION_AMBIGUOUS' : 'NAVIGATION_NOT_READY';
  throw Object.assign(Error(code), {code});
}

async function waitNavigation(page, target, diagnostics) {
  await page.waitForFunction(({folder, target}) => [...document.querySelectorAll('[data-tid]')].some(element => {
    const value = element.getAttribute('data-tid');
    return (value.endsWith(folder) || value.endsWith(target)) && element.getBoundingClientRect().width
      && element.getBoundingClientRect().height && getComputedStyle(element).visibility !== 'hidden';
  }), {folder, target: treeTarget(target)}, {timeout: diagnostics.remaining()});
}

export async function ready(page, diagnostics) {
  await diagnostics.run('navigation', 'wait-unmasked', '.bg-mask-message', () => page.waitForFunction(() =>
    ![...document.querySelectorAll('.bg-mask-message')].some(element => element.getBoundingClientRect().width
      && element.getBoundingClientRect().height), null, {timeout: diagnostics.remaining()}));
}

export async function navigate(page, target, diagnostics) {
  if (!['Пользователи', 'Диспетчер'].includes(target)) throw Error('NAVIGATION_TARGET_INVALID');
  await ready(page, diagnostics);
  let items = await diagnostics.run('navigation', 'observe-candidates', treeTarget(target), () => candidates(page, target, diagnostics));
  if (!items.length) {
    const selector = tid('MF;cntMain;tlbMainToolbar;btnNavigator') + ':visible';
    await diagnostics.run('navigation', 'open-navigator', selector, async () =>
      (await uniqueVisible(page, selector)).click({timeout: diagnostics.remaining()}));
    await diagnostics.run('navigation', 'wait-navigator', treeTarget(target), () => waitNavigation(page, target, diagnostics));
    items = await diagnostics.run('navigation', 'observe-candidates', treeTarget(target), () => candidates(page, target, diagnostics));
  }
  if (!items.some(item => item.kind === 'target')) {
    await diagnostics.run('navigation', 'expand-admin', folder, async () => {
      const chosen = select(await candidates(page, target, diagnostics), 'folder');
      if (!chosen || chosen.expanded !== false) throw Object.assign(Error('NAVIGATION_NOT_READY'), {code: 'NAVIGATION_NOT_READY'});
      const expander = page.locator(tid(chosen.tid) + ':visible').locator('xpath=ancestor::tr[1]').locator('.x-tree-expander:visible');
      if (await expander.count() !== 1) throw Object.assign(Error('NAVIGATION_AMBIGUOUS'), {code: 'NAVIGATION_AMBIGUOUS'});
      await expander.click({timeout: diagnostics.remaining()});
    });
    await diagnostics.run('navigation', 'wait-target', treeTarget(target), () => page.waitForFunction(target =>
      [...document.querySelectorAll('[data-tid]')].some(element => element.getAttribute('data-tid').endsWith(target)
        && element.getBoundingClientRect().width && element.getBoundingClientRect().height),
    treeTarget(target), {timeout: diagnostics.remaining()}));
  }
  // Re-observe immediately before the gesture; never reuse an earlier choice.
  await diagnostics.run('navigation', 'click-target', treeTarget(target), async () => {
    const chosen = select(await candidates(page, target, diagnostics), 'target');
    if (!chosen) throw Object.assign(Error('NAVIGATION_NOT_READY'), {code: 'NAVIGATION_NOT_READY'});
    await (await uniqueVisible(page, tid(chosen.tid) + ':visible')).click({timeout: diagnostics.remaining()});
  });
  await ready(page, diagnostics);
}

export async function refresh(page, diagnostics) {
  const selector = suffix('SessionsManagerForm;btnRefresh');
  await diagnostics.run('dispatcher', 'refresh', selector, async () =>
    (await uniqueVisible(page, selector)).click({timeout: diagnostics.remaining()}));
  await ready(page, diagnostics);
}
