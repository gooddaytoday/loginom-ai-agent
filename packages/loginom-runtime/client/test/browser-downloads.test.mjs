import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {browserDownloadScript} from '../lib/browser-downloads.mjs';

test('download policy removes only the save picker on the configured origin', () => {
  const open = () => {};
  const page = vm.createContext({location: {origin: 'https://loginom.test'}, showSaveFilePicker: () => {}, showOpenFilePicker: open});
  const script = browserDownloadScript('https://loginom.test/app/?testable=true&private=value');
  vm.runInContext(script, page);
  vm.runInContext(script, page);
  assert.equal('showSaveFilePicker' in page, false);
  assert.equal(page.showOpenFilePicker, open);
  assert.equal(script.includes('private'), false);
});

test('download policy leaves other origins alone, including similar hostnames and ports', () => {
  for (const origin of ['https://loginom.test.evil', 'http://loginom.test', 'https://loginom.test:8443']) {
    const picker = () => {};
    const page = vm.createContext({location: {origin}, showSaveFilePicker: picker});
    vm.runInContext(browserDownloadScript('https://loginom.test/app/'), page);
    assert.equal(page.showSaveFilePicker, picker);
  }
});

test('legacy dedicated browser and origins without the API are supported', () => {
  for (const url of [null, undefined, 'http://loginom.test/app/']) {
    const page = vm.createContext({location: {origin: 'http://loginom.test'}});
    vm.runInContext(browserDownloadScript(url), page);
    assert.equal('showSaveFilePicker' in page, false);
  }
  const page = vm.createContext({showSaveFilePicker: () => {}});
  vm.runInContext(browserDownloadScript(null), page);
  assert.equal('showSaveFilePicker' in page, false);
});
