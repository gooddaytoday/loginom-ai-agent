import test from 'node:test';
import assert from 'node:assert/strict';
import {browserLaunch} from '../lib/browser-launch.mjs';

test('browser launch normalizes headed DPI without incompatible viewport emulation', () => {
  assert.deepEqual(browserLaunch(false), {
    args:['--start-maximized','--window-size=1280,800','--force-device-scale-factor=1'], viewport:null, windowMode:'maximized',
  });
  assert.deepEqual(browserLaunch(true), {args:[],viewport:{width:1280,height:800},windowMode:'headless'});
  browserLaunch(false).args.push('--invalid');
  assert.equal(browserLaunch(false).args.length,3);
});

test('headed launch keeps the Files refresh control visible without a window manager', {
  skip: !process.env.LOGINOM_DOCK_TEST_BROWSER || process.env.LOGINOM_DOCK_TEST_HEADED !== '1',
  timeout: 30000,
}, async () => {
  const {chromium} = await import('playwright-core');
  const launch = browserLaunch(false);
  const browser = await chromium.launch({executablePath:process.env.LOGINOM_DOCK_TEST_BROWSER,
    headless:false, chromiumSandbox:true, args:launch.args});
  try {
    const page = await browser.newPage({viewport:launch.viewport});
    // Loginom's Files toolbar retains its minimum width in a smaller window.
    await page.setContent(`<style>body{margin:0} #files{position:relative;min-width:1240px;height:100px}
      button{position:absolute;right:6px;top:74px;width:22px;height:22px}</style>
      <div id="files"><button data-tid="MF;TF-3;FileStorageForm;btnRefresh">↻</button></div>`);
    const geometry = await page.locator('[data-tid$=";FileStorageForm;btnRefresh"]').evaluate(element => {
      const box = element.getBoundingClientRect(), x = box.x + box.width / 2, y = box.y + box.height / 2;
      return {width:innerWidth, right:box.right, hit:document.elementFromPoint(x,y) === element};
    });
    assert.equal(page.viewportSize(), null, 'headed context retains native window geometry');
    assert.ok(geometry.right <= geometry.width, JSON.stringify(geometry));
    assert.equal(geometry.hit, true, 'refresh has a visible interaction point');
  } finally {
    await browser.close();
  }
});
