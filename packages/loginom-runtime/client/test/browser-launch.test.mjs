import test from 'node:test';
import assert from 'node:assert/strict';
import {browserLaunch} from '../lib/browser-launch.mjs';

test('browser launch normalizes headed DPI without incompatible viewport emulation', () => {
  assert.deepEqual(browserLaunch(false), {
    args:['--start-maximized','--force-device-scale-factor=1'], viewport:null, windowMode:'maximized',
  });
  assert.deepEqual(browserLaunch(true), {args:[],viewport:{width:1280,height:800},windowMode:'headless'});
  browserLaunch(false).args.push('--invalid');
  assert.equal(browserLaunch(false).args.length,2);
});
