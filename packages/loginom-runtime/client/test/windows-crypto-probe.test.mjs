import test from 'node:test';
import assert from 'node:assert/strict';
import {isWindowsCryptoRequest, isWindowsCryptSvcOwner} from './support/windows-crypto-probe.mjs';

const request = {method:'GET', url:'http://crl.microsoft.com/pki/crl/products/MicRooCerAut2011_2011_03_22.crl',
  headers:{'user-agent':'Microsoft-CryptoAPI/10.0'}};
const owner = {pid:3248, name:'svchost.exe', path:'C:\\Windows\\system32\\svchost.exe', parentName:'services.exe',
  servicePid:3248, serviceName:'CryptSvc', serviceState:'Running'};

test('recognizes only the two observed CryptoAPI GET requests', () => {
  assert.equal(isWindowsCryptoRequest(request), true);
  assert.equal(isWindowsCryptoRequest({...request, url:'http://crl.microsoft.com/pki/crl/products/MicRooCerAut_2010-06-23.crl'}), true);
  for (const changed of [
    {method:'CONNECT'}, {method:'POST'}, {headers:{}}, {headers:{'user-agent':'Chrome/154'}},
    {url:request.url + '?other=1'}, {url:request.url.replace('crl.microsoft.com', 'crl.microsoft.com.example.org')},
    {url:'http://example.org/app/'},
  ]) assert.equal(isWindowsCryptoRequest({...request, ...changed}), false);
});

test('requires the live service PID, system image and service parent together', () => {
  assert.equal(isWindowsCryptSvcOwner(owner, 'C:\\Windows'), true);
  assert.equal(isWindowsCryptSvcOwner({...owner, path:'c:\\WINDOWS\\System32\\svchost.exe'}, 'C:\\Windows'), true);
  for (const changed of [
    {pid:0, servicePid:0}, {pid:3249}, {pid:'3248'}, {servicePid:undefined},
    {serviceName:'OtherService'}, {serviceState:'Stopped'}, {name:'chrome.exe'},
    {path:'C:\\Temp\\svchost.exe'}, {path:undefined}, {parentName:'chrome.exe'},
  ]) assert.equal(isWindowsCryptSvcOwner({...owner, ...changed}, 'C:\\Windows'), false);
  assert.equal(isWindowsCryptSvcOwner(undefined, 'C:\\Windows'), false);
  assert.equal(isWindowsCryptSvcOwner(owner, undefined), false);
});
