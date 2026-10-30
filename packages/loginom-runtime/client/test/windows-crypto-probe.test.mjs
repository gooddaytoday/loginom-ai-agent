import test from 'node:test';
import assert from 'node:assert/strict';
import {isWindowsSystemOwner, observeWindowsCryptSvc} from './support/windows-crypto-probe.mjs';

const owner = {pid:3248, name:'svchost.exe', path:'C:\\Windows\\system32\\svchost.exe', parentName:'services.exe',
  parentPath:'C:\\Windows\\System32\\services.exe', services:[{pid:3248, name:'CryptSvc', state:'Running'}]};

test('requires a live service PID, system image and system service parent together', () => {
  assert.equal(isWindowsSystemOwner(owner, 'C:\\Windows'), true);
  assert.equal(isWindowsSystemOwner({...owner, path:'c:\\WINDOWS\\System32\\svchost.exe'}, 'C:\\Windows'), true);
  assert.equal(isWindowsSystemOwner({...owner, services:[{pid:3248, name:'wlidsvc', state:'Running'}]}, 'C:\\Windows'), true);
  for (const changed of [
    {pid:0}, {pid:3249}, {pid:'3248'}, {services:undefined}, {services:[]},
    {services:[{pid:3248, name:'CryptSvc', state:'Stopped'}]},
    {services:[{pid:3248, name:'', state:'Running'}]},
    {services:[{pid:3249, name:'CryptSvc', state:'Running'}]},
    {name:'chrome.exe'}, {path:'C:\\Temp\\svchost.exe'}, {path:undefined},
    {parentName:'chrome.exe'}, {parentPath:'C:\\Temp\\services.exe'}, {parentPath:undefined},
  ]) assert.equal(isWindowsSystemOwner({...owner, ...changed}, 'C:\\Windows'), false);
  assert.equal(isWindowsSystemOwner(undefined, 'C:\\Windows'), false);
  assert.equal(isWindowsSystemOwner(owner, undefined), false);
});

test('an OS-inaccessible parent path retains the other system service requirements', () => {
  const protectedOwner = {...owner, parentPath:null};
  assert.equal(isWindowsSystemOwner(protectedOwner, 'C:\\Windows'), true);
  for (const changed of [
    {pid:undefined}, {pid:0}, {pid:3249}, {pid:'3248'},
    {name:'chrome.exe'}, {path:'C:\\Temp\\svchost.exe'}, {path:undefined},
    {parentName:'chrome.exe'}, {parentName:undefined},
    {services:[]}, {services:[{pid:3248, name:'CryptSvc', state:'Stopped'}]},
    {services:[{pid:3249, name:'CryptSvc', state:'Running'}]},
  ]) assert.equal(isWindowsSystemOwner({...protectedOwner, ...changed}, 'C:\\Windows'), false);
});

test('an accessible parent path outside System32 is rejected', () => {
  assert.equal(isWindowsSystemOwner({...owner, parentPath:'C:\\Temp\\services.exe'}, 'C:\\Windows'), false);
});

test('missing TCP endpoints retain the attribution failure', async () => {
  await assert.rejects(observeWindowsCryptSvc({}), /Missing live TCP endpoint/);
  await assert.rejects(observeWindowsCryptSvc({remotePort:0, localPort:1234, remoteAddress:'127.0.0.1', localAddress:'127.0.0.1'}), /Missing live TCP endpoint/);
});
